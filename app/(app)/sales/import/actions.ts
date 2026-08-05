'use server'

import { createHash } from 'node:crypto'

import type { PostgrestError } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireUser } from '@/lib/auth'
import { chunks, chunksByEncodedLength } from '@/lib/chunks'
import { todayInSeoul } from '@/lib/constants'
import { likePattern, productSearchFilter } from '@/lib/search'
import { createClient } from '@/lib/supabase/server'

import type { FoundItem } from '../actions'

/**
 * 임포트 두 액션: 매칭(resolveSaleRows)과 확정(importSales).
 *
 * 파일 자체는 서버로 오지 않는다 — 브라우저가 추린 값만 온다. 그래도 어느
 * 상품의 재고를 깎을지는 전부 여기서 정하고, zod 로 다시 검증한다. 서버
 * 액션은 UI 없이도 POST 로 불릴 수 있어서 브라우저의 검증은 편의일 뿐이다.
 */

// ---------------------------------------------------------------------------
// 매칭
// ---------------------------------------------------------------------------

export type MatchQuery = {
  barcode: string | null
  name: string | null
  option: string | null
}

export type ResolvedRow =
  | { status: 'ok'; item: FoundItem }
  | { status: 'ambiguous'; candidates: FoundItem[] }
  | { status: 'missing'; candidates: FoundItem[] }

const matchSchema = z
  .array(
    z.object({
      barcode: z.string().trim().max(64).nullable(),
      name: z.string().trim().max(200).nullable(),
      option: z.string().trim().max(200).nullable(),
    }),
  )
  .max(2_000)

type VariantRow = {
  variant_id: string | null
  product_name: string | null
  pos_name: string | null
  option_label: string | null
  sale_price: number | null
  cost_price: number | null
  stock_qty: number | null
  barcode: string | null
  unit: string | null
}

function toFound(r: VariantRow): FoundItem {
  return {
    variantId: r.variant_id!,
    productName: r.product_name ?? '',
    optionLabel: r.option_label,
    salePrice: Number(r.sale_price ?? 0),
    costPrice: Number(r.cost_price ?? 0),
    stockQty: r.stock_qty ?? 0,
    barcode: r.barcode,
    unit: r.unit || '개',
  }
}

const VARIANT_COLS =
  'variant_id, product_name, pos_name, option_label, sale_price, cost_price, stock_qty, barcode, unit'

/** 후보 목록을 한 줄의 판정으로 좁힌다. 세 경로가 같은 규칙을 쓰게 한 곳이다. */
function narrow(list: VariantRow[], option: string | null): ResolvedRow | null {
  if (list.length === 0) return null
  if (list.length === 1) return { status: 'ok', item: toFound(list[0]) }
  // 같은 이름에 변형 여러 개. 파일에 옵션 열이 있으면 그걸로 좁힌다.
  const byOption = option ? list.filter((v) => (v.option_label ?? '') === option) : []
  if (byOption.length === 1) return { status: 'ok', item: toFound(byOption[0]) }
  return { status: 'ambiguous', candidates: list.map(toFound) }
}

/**
 * 파일의 각 줄을 상품(변형)에 잇는다. **POS 메뉴명 정확 일치 → 바코드 정확
 * 일치 → 발주명 정확 일치 → 유사 검색** 순서다. N+1 을 만들지 않는다 —
 * distinct 값들을 모아 왕복 몇 번으로 끝낸다. 수백 줄 파일이 줄마다 조회하면
 * 그 수만큼 왕복이 생긴다.
 *
 * **한동안 바코드가 1순위였다** ("이름이 같이 있어도 바코드를 믿는다"). 사용자
 * 결정으로 뒤집었고(2026-08-05), 프로덕션 데이터가 그 결정을 뒷받침한다:
 *
 * | | 상품 수 |
 * |---|---|
 * | POS 메뉴명 ○ · POS 바코드 ○ | 315 |
 * | **POS 메뉴명만 ○** | **73** |
 * | **POS 바코드만 ○** | **0** |
 *
 * 바코드로만 찾을 수 있는 상품은 **하나도 없고**, 메뉴명으로만 찾을 수 있는
 * 것이 73개 더 있다. `pos_name` 은 중복이 0이라 이 경로가 애매해질 일도 없다.
 * 바코드는 지웠으면 POS 파일에서는 아무것도 안 잃었겠지만, `바코드·상품명·수량`
 * 만 있는 평범한 CSV(`docs/samples/판매기록-예시.csv`)가 붙을 길이 사라진다 —
 * 그래서 **지우지 않고 보조로 남겼다.**
 *
 * 순서를 되돌리지 마라. POS 의 EAN-13 은 사람이 검수표로 짝지어 심은 것이라
 * 잘못 심긴 것이 섞여 있을 수 있는데, 그러면 판매가 **엉뚱한 상품의 재고**를
 * 깎는다. 메뉴명은 POS 가 그 줄에 대해 말한 이름 그 자체다.
 *
 * **조회 실패를 전부 throw 한다.** 예전에는 `{ data }` 만 받고 `?? []` 로
 * 넘겼는데, 그러면 요청이 실패해도 화면에는 "등록된 상품에서 찾지 못했습니다"
 * 로만 보인다 — 파일이 멀쩡한데 전부 못 찾은 것처럼 나오고, 사람이 원인을
 * 알아낼 방법이 없다. 미리보기(preview.tsx)가 이 예외를 잡아 문구를 띄운다.
 */
export async function resolveSaleRows(raw: MatchQuery[]): Promise<ResolvedRow[]> {
  await requireUser()

  const parsed = matchSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error('매칭 요청이 올바르지 않습니다')
  }
  const rows = parsed.data

  const supabase = await createClient()

  // 1) POS 메뉴명 정확 일치 — **1순위다.** 파일의 모든 이름을 대상으로 한다.
  //    한글 이름이므로 개수가 아니라 URL 인코딩 길이로 끊는다 — 개수 기준
  //    200개면 percent 인코딩으로 URL 이 3만 자를 넘어 요청이 통째로 실패한다.
  const names = [...new Set(rows.map((r) => r.name).filter((v): v is string => !!v))]
  const posNameToVariants = new Map<string, VariantRow[]>()
  for (const part of chunksByEncodedLength(names)) {
    const { data, error } = await supabase
      .from('v_variant_stock')
      .select(VARIANT_COLS)
      .eq('is_active', true)
      .eq('product_active', true)
      .in('pos_name', part)
    if (error) throw new Error('POS 메뉴명 조회에 실패했습니다: ' + error.message)
    for (const v of data ?? []) {
      const key = v.pos_name ?? ''
      const list = posNameToVariants.get(key) ?? []
      list.push(v)
      posNameToVariants.set(key, list)
    }
  }

  // "이 줄은 POS 메뉴명으로 풀렸다" 의 정의. 아래 조회 대상 추리기와 마지막
  // 판정이 **같은 함수**를 봐야 한다 — 어긋나면 조회는 건너뛰었는데 판정은
  // 그 값을 기대하는 줄이 생기고, 그 줄만 조용히 못 찾은 것으로 나온다.
  const posHitFor = (r: MatchQuery): ResolvedRow | null =>
    r.name ? narrow(posNameToVariants.get(r.name) ?? [], r.option) : null

  // 2) 바코드 정확 일치 — **보조 수단.** 메뉴명으로 못 푼 줄만 대상이다.
  //    barcodes 는 부바코드까지 갖고 있어서 v_variant_stock 의 대표 바코드
  //    한 줄로는 못 찾는 코드도 여기서는 잡힌다.
  const unmatchedByPos = rows.filter((r) => posHitFor(r)?.status !== 'ok')
  const codes = [
    ...new Set(unmatchedByPos.map((r) => r.barcode).filter((v): v is string => !!v)),
  ]
  const codeToVariant = new Map<string, string>()
  for (const part of chunks(codes)) {
    const { data, error } = await supabase
      .from('barcodes')
      .select('code, variant_id')
      .in('code', part)
    if (error) throw new Error('바코드 조회에 실패했습니다: ' + error.message)
    for (const b of data ?? []) codeToVariant.set(b.code, b.variant_id)
  }

  // 바코드로 찾은 변형들의 정보도 v_variant_stock 에서 한 번에 가져온다.
  // is_active·product_active 를 여기서도 건다 — 이름 경로에만 걸어 두면
  // 숨긴 상품이 바코드로는 통과해서 그 재고가 임포트로 깎인다.
  const idToVariant = new Map<string, VariantRow>()
  const variantIds = [...new Set(codeToVariant.values())]
  for (const part of chunks(variantIds)) {
    const { data, error } = await supabase
      .from('v_variant_stock')
      .select(VARIANT_COLS)
      .eq('is_active', true)
      .eq('product_active', true)
      .in('variant_id', part)
    if (error) throw new Error('상품 정보 조회에 실패했습니다: ' + error.message)
    for (const v of data ?? []) idToVariant.set(v.variant_id!, v)
  }

  const barcodeHitFor = (r: MatchQuery): VariantRow | undefined => {
    if (!r.barcode) return undefined
    const vid = codeToVariant.get(r.barcode)
    return vid ? idToVariant.get(vid) : undefined
  }

  // 3) 발주명(이 앱의 대표 이름) 정확 일치 — 앞의 둘로도 못 푼 줄만.
  //    POS 파일에서는 거의 안 걸린다(388개 전부 메뉴명과 표기가 다르다).
  //    바코드·상품명만 있는 평범한 CSV 를 위한 경로다.
  //
  //    in('pos_name') 과 or 로 합치지 않는다. PostgREST 에서 in 과 or 를 섞으면
  //    URL 이 더 길어지는데, 이 함수가 바로 그 길이 때문에 조용히 죽었던
  //    곳이다. 순서대로 두 번 조회하는 편이 안전하다.
  //
  //    이 단계가 유사 검색보다 **앞**이어야 한다. 유사 검색은 상한이 30건이라,
  //    정확 일치로 풀 수 있는 것을 거기까지 흘리면 예산을 다 쓴다.
  const remainingNames = [
    ...new Set(
      rows
        .filter((r) => posHitFor(r) === null && !barcodeHitFor(r))
        .map((r) => r.name)
        .filter((v): v is string => !!v),
    ),
  ]
  const nameToVariants = new Map<string, VariantRow[]>()
  for (const part of chunksByEncodedLength(remainingNames)) {
    const { data, error } = await supabase
      .from('v_variant_stock')
      .select(VARIANT_COLS)
      .eq('is_active', true)
      .eq('product_active', true)
      .in('product_name', part)
    if (error) throw new Error('상품명 조회에 실패했습니다: ' + error.message)
    for (const v of data ?? []) {
      const key = v.product_name ?? ''
      const list = nameToVariants.get(key) ?? []
      list.push(v)
      nameToVariants.set(key, list)
    }
  }

  // 3) 그래도 못 찾은 줄만 유사 검색. 상한을 두는 이유: 전부 안 걸리는 파일
  //    (열 지정이 틀렸다든가)이 줄 수만큼 ilike 를 쏘게 두면 안 된다.
  const FUZZY_LIMIT = 30
  let fuzzyBudget = FUZZY_LIMIT
  const fuzzyCache = new Map<string, VariantRow[]>()

  async function fuzzy(name: string): Promise<VariantRow[]> {
    if (fuzzyCache.has(name)) return fuzzyCache.get(name)!
    // 패턴 검사가 예산 차감보다 먼저다. 쿼리도 안 나가는 이름(쉼표만 있다든가)
    // 에 예산을 쓰면, 정작 조회가 필요한 줄이 상한에 걸려 후보 없이 나온다.
    const pattern = likePattern(name)
    if (!pattern) {
      fuzzyCache.set(name, [])
      return []
    }
    if (fuzzyBudget <= 0) return []
    fuzzyBudget -= 1
    const { data, error } = await supabase
      .from('v_variant_stock')
      .select(VARIANT_COLS)
      .eq('is_active', true)
      .eq('product_active', true)
      .or(productSearchFilter(pattern))
      .limit(6)
    if (error) throw new Error('비슷한 상품 검색에 실패했습니다: ' + error.message)
    const list = data ?? []
    fuzzyCache.set(name, list)
    return list
  }

  const out: ResolvedRow[] = []
  for (const row of rows) {
    // ① POS 메뉴명이 한 상품으로 떨어지면 그걸로 끝. 파일에 바코드가 같이
    //    있어도 메뉴명을 믿는다 — 바코드가 보조라는 것이 이 한 줄이다.
    const posHit = posHitFor(row)
    if (posHit?.status === 'ok') {
      out.push(posHit)
      continue
    }

    // ② 바코드. 메뉴명이 후보를 여럿 준 경우에도 여기서 풀릴 수 있어서,
    //    ambiguous 를 곧장 내보내지 않고 바코드를 한 번 더 본다.
    const v = barcodeHitFor(row)
    if (v) {
      out.push({ status: 'ok', item: toFound(v) })
      continue
    }
    if (posHit) {
      out.push(posHit)
      continue
    }

    // ③ 발주명 → ④ 유사 검색
    if (row.name) {
      const nameHit = narrow(nameToVariants.get(row.name) ?? [], row.option)
      if (nameHit) {
        out.push(nameHit)
        continue
      }
      const near = await fuzzy(row.name)
      out.push({ status: 'missing', candidates: near.map(toFound) })
      continue
    }

    out.push({ status: 'missing', candidates: [] })
  }

  return out
}

// ---------------------------------------------------------------------------
// 확정
// ---------------------------------------------------------------------------

const lineSchema = z.object({
  variantId: z.uuid(),
  qty: z.number().int().min(1).max(10_000),
  unitPrice: z.number().int().min(0).max(1_000_000_000),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: '날짜 형식이 잘못됐습니다' }),
})

const importSchema = z.object({
  lines: z.array(lineSchema).min(1, { error: '반영할 판매가 없습니다' }).max(2_000, {
    error: '한 번에 2,000줄까지만 반영할 수 있습니다. 파일을 나눠서 올리세요',
  }),
  memo: z.string().trim().max(200).optional(),
  force: z.boolean(),
})

export type ImportPayload = z.infer<typeof importSchema>

export type ImportResult =
  | { status: 'error'; error: string }
  | {
      // 이미 반영한 날짜가 있다. 화면이 "빼고 반영 / 그래도 반영"을 묻는다.
      status: 'duplicate'
      existing: { date: string; importedAt: string }[]
    }
  | {
      status: 'done'
      batchId: string
      orders: { date: string; count: number; revenue: number }[]
    }

/**
 * 내용 지문: 정규화된 (변형, 수량, 단가)를 정렬해 이은 문자열의 SHA-256.
 *
 * 파일 바이트가 아니라 내용에서 만드는 이유 — 엑셀은 내용이 같아도 다시
 * 저장하면 바이트가 바뀌고, CSV 로 바꿔 저장해도 같은 판매다. 서버에서
 * 만드는 이유 — 브라우저가 만들면 보호하려는 값을 보호 대상이 정하는 꼴이다.
 */
function fingerprint(date: string, lines: { variantId: string; qty: number; unitPrice: number }[]): string {
  const body = lines
    .map((l) => `${l.variantId}:${l.qty}:${l.unitPrice}`)
    .sort()
    .join(',')
  return createHash('sha256').update(`${date}|${body}`).digest('hex')
}

function humanize(error: PostgrestError): string {
  if (error.code === '23505' && error.message.includes('import_fingerprint')) {
    // 사전 조회를 뚫고 온 경쟁 상태(동시 제출). 유니크 인덱스가 마지막 보증이다.
    return '같은 내용이 방금 이미 반영됐습니다. 임포트 이력을 확인하세요'
  }
  return error.message
}

export async function importSales(payload: ImportPayload): Promise<ImportResult> {
  await requireUser()

  const parsed = importSchema.safeParse(payload)
  if (!parsed.success) {
    return { status: 'error', error: parsed.error.issues[0].message }
  }
  const { lines, memo, force } = parsed.data

  const today = todayInSeoul()
  if (lines.some((l) => l.date > today)) {
    // 파일에 연도가 잘못 들어가는 일이 흔하다. 미래 판매가 원장에 들어가면
    // 통계가 미래로 샌다.
    return { status: 'error', error: '앞날짜 판매는 반영할 수 없습니다' }
  }

  // (날짜, 변형, 단가) 로 합산한다. 같은 상품이 500줄로 나뉜 파일이 500번의
  // 행 잠금이 되지 않게 한다. 단가가 다르면 합치지 않는다 — 같은 물건을
  // 할인가로도 팔았을 수 있고, 합치면 그 구분이 사라진다.
  const byDate = new Map<string, Map<string, { variantId: string; qty: number; unitPrice: number }>>()
  for (const l of lines) {
    const day = byDate.get(l.date) ?? new Map()
    const key = `${l.variantId}:${l.unitPrice}`
    const cur = day.get(key)
    if (cur) cur.qty += l.qty
    else day.set(key, { variantId: l.variantId, qty: l.qty, unitPrice: l.unitPrice })
    byDate.set(l.date, day)
  }

  const groups = [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, day]) => {
      const items = [...day.values()]
      return { date, items, fp: fingerprint(date, items) }
    })

  const supabase = await createClient()

  // 사전 조회는 좋은 문구를 위한 것이고, 진짜 보증은 유니크 인덱스다.
  // 이 조회만 믿으면 동시 제출 두 개가 나란히 통과한다 — 둘 다 있어야 한다.
  if (!force) {
    const { data: dup } = await supabase
      .from('sale_orders')
      .select('import_fingerprint, occurred_at, created_at')
      .in('import_fingerprint', groups.map((g) => g.fp))
    if (dup && dup.length > 0) {
      const fpToDate = new Map(groups.map((g) => [g.fp, g.date]))
      return {
        status: 'duplicate',
        existing: dup.map((d) => ({
          date: fpToDate.get(d.import_fingerprint!) ?? '',
          importedAt: d.created_at,
        })),
      }
    }
  }

  const { data, error } = await supabase.rpc('import_sales', {
    p_groups: groups.map((g) => ({
      // 정오로 박는 이유: 파일에는 시각이 없고, 자정은 오프셋 실수 한 번에
      // 날짜가 하루 밀리지만 정오는 ±12시간 여유가 있다 (movements 와 같은 규칙).
      occurred_at: `${g.date}T12:00:00+09:00`,
      fingerprint: g.fp,
      items: g.items.map((i) => ({
        variant_id: i.variantId,
        qty: i.qty,
        unit_price: i.unitPrice,
      })),
    })),
    p_memo: memo,
    p_force: force,
  })

  if (error) return { status: 'error', error: humanize(error) }

  // 임포트는 재고·원장·홈·통계·판매 기록을 전부 움직인다.
  revalidatePath('/')
  revalidatePath('/stock')
  revalidatePath('/movements')
  revalidatePath('/stats')
  revalidatePath('/sales')

  const rows = data ?? []
  return {
    status: 'done',
    batchId: rows[0]?.batch_id ?? '',
    orders: rows.map((r) => ({
      date: r.occurred_at.slice(0, 10),
      count: r.item_count,
      revenue: Number(r.revenue ?? 0),
    })),
  }
}
