'use server'

import { createHash } from 'node:crypto'

import type { PostgrestError } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireUser } from '@/lib/auth'
import { todayInSeoul } from '@/lib/constants'
import { likePattern, nameSkuBarcodeFilter } from '@/lib/search'
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

/** PostgREST in() 은 URL 로 나간다. 200개씩 끊지 않으면 URL 길이에서 터진다. */
function chunks<T>(list: T[], size = 200): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

type VariantRow = {
  variant_id: string | null
  product_name: string | null
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
  'variant_id, product_name, option_label, sale_price, cost_price, stock_qty, barcode, unit'

/**
 * 파일의 각 줄을 상품(변형)에 잇는다. 바코드 정확 일치 → 상품명 정확 일치 →
 * 유사 검색 순서다. N+1 을 만들지 않는다 — distinct 값들을 모아 왕복 몇 번으로
 * 끝낸다. 수백 줄 파일이 줄마다 조회하면 그 수만큼 왕복이 생긴다.
 */
export async function resolveSaleRows(raw: MatchQuery[]): Promise<ResolvedRow[]> {
  await requireUser()

  const parsed = matchSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error('매칭 요청이 올바르지 않습니다')
  }
  const rows = parsed.data

  const supabase = await createClient()

  // 1) 바코드 정확 일치. barcodes 는 부바코드까지 갖고 있어서 v_variant_stock
  //    의 대표 바코드 한 줄로는 못 찾는 코드도 여기서는 잡힌다.
  const codes = [...new Set(rows.map((r) => r.barcode).filter((v): v is string => !!v))]
  const codeToVariant = new Map<string, string>()
  for (const part of chunks(codes)) {
    const { data } = await supabase
      .from('barcodes')
      .select('code, variant_id')
      .in('code', part)
    for (const b of data ?? []) codeToVariant.set(b.code, b.variant_id)
  }

  // 2) 이름 정확 일치 후보. 바코드로 못 찾은 줄만 대상이다.
  const names = [
    ...new Set(
      rows
        .filter((r) => !(r.barcode && codeToVariant.has(r.barcode)))
        .map((r) => r.name)
        .filter((v): v is string => !!v),
    ),
  ]
  const nameToVariants = new Map<string, VariantRow[]>()
  for (const part of chunks(names)) {
    const { data } = await supabase
      .from('v_variant_stock')
      .select(VARIANT_COLS)
      .eq('is_active', true)
      .eq('product_active', true)
      .in('product_name', part)
    for (const v of data ?? []) {
      const key = v.product_name ?? ''
      const list = nameToVariants.get(key) ?? []
      list.push(v)
      nameToVariants.set(key, list)
    }
  }

  // 바코드로 찾은 변형들의 정보도 v_variant_stock 에서 한 번에 가져온다.
  const idToVariant = new Map<string, VariantRow>()
  const variantIds = [...new Set(codeToVariant.values())]
  for (const part of chunks(variantIds)) {
    const { data } = await supabase
      .from('v_variant_stock')
      .select(VARIANT_COLS)
      .in('variant_id', part)
    for (const v of data ?? []) idToVariant.set(v.variant_id!, v)
  }

  // 3) 그래도 못 찾은 줄만 유사 검색. 상한을 두는 이유: 전부 안 걸리는 파일
  //    (열 지정이 틀렸다든가)이 줄 수만큼 ilike 를 쏘게 두면 안 된다.
  const FUZZY_LIMIT = 30
  let fuzzyBudget = FUZZY_LIMIT
  const fuzzyCache = new Map<string, VariantRow[]>()

  async function fuzzy(name: string): Promise<VariantRow[]> {
    if (fuzzyCache.has(name)) return fuzzyCache.get(name)!
    if (fuzzyBudget <= 0) return []
    fuzzyBudget -= 1
    const pattern = likePattern(name)
    if (!pattern) return []
    const { data } = await supabase
      .from('v_variant_stock')
      .select(VARIANT_COLS)
      .eq('is_active', true)
      .eq('product_active', true)
      .or(nameSkuBarcodeFilter(pattern))
      .limit(6)
    const list = data ?? []
    fuzzyCache.set(name, list)
    return list
  }

  const out: ResolvedRow[] = []
  for (const row of rows) {
    // 바코드가 맞으면 그걸로 끝. 파일에 이름이 같이 있어도 바코드를 믿는다.
    if (row.barcode) {
      const vid = codeToVariant.get(row.barcode)
      const v = vid ? idToVariant.get(vid) : undefined
      if (v) {
        out.push({ status: 'ok', item: toFound(v) })
        continue
      }
    }

    if (row.name) {
      const exact = nameToVariants.get(row.name) ?? []
      if (exact.length === 1) {
        out.push({ status: 'ok', item: toFound(exact[0]) })
        continue
      }
      if (exact.length > 1) {
        // 같은 이름에 변형 여러 개. 파일에 옵션 열이 있으면 그걸로 좁힌다.
        const byOption = row.option
          ? exact.filter((v) => (v.option_label ?? '') === row.option)
          : []
        if (byOption.length === 1) {
          out.push({ status: 'ok', item: toFound(byOption[0]) })
        } else {
          out.push({ status: 'ambiguous', candidates: exact.map(toFound) })
        }
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
