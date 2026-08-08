'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { fail, ok, type ActionState } from '@/lib/action-state'
import { requireUser } from '@/lib/auth'
import { chunks, chunksByEncodedLength } from '@/lib/chunks'
import { createClient } from '@/lib/supabase/server'

/**
 * 입고 파일 임포트의 서버 몫: 매칭(resolvePurchaseRows) · 확정(importPurchases) ·
 * 배치 되돌리기(voidPurchaseBatch). 파일 자체는 서버로 오지 않는다 — 브라우저가
 * 표로 만들고, 어느 상품의 재고를 늘릴지는 전부 여기서 정한다 (판매 임포트와
 * 같은 구도).
 *
 * 매칭 순서는 코드 → 정제한 이름 정확 일치, 둘뿐이다. 판매 임포트의 유사검색을
 * 여기 넣지 않은 것은 의도다 — 판매는 못 찾으면 "기록이 빠지는" 손해로 끝나지만,
 * 입고를 비슷한 이름에 붙이면 **엉뚱한 상품의 재고가 늘고** 화면 어디에도 티가
 * 안 난다. 못 찾은 줄은 사람에게 보여주는 쪽이 싸다.
 */

export type PurchaseMatch = {
  variantId: string
  productName: string
  optionLabel: string | null
  stockQty: number
  costPrice: number
  unit: string
  unitsPerPack: number | null
  purchaseUnitName: string | null
}

export type MatchQuery = { code: string | null; name: string | null }

const matchSchema = z
  .array(
    z.object({
      code: z.string().trim().max(64).nullable(),
      name: z.string().trim().max(200).nullable(),
    }),
  )
  .max(2_000)

type VariantRow = {
  variant_id: string | null
  product_name: string | null
  option_label: string | null
  stock_qty: number | null
  cost_price: number | null
  unit: string | null
  units_per_pack: number | null
  purchase_unit_name: string | null
}

function toMatch(r: VariantRow): PurchaseMatch {
  return {
    variantId: r.variant_id!,
    productName: r.product_name ?? '',
    optionLabel: r.option_label,
    stockQty: r.stock_qty ?? 0,
    costPrice: Number(r.cost_price ?? 0),
    unit: r.unit || '개',
    unitsPerPack: r.units_per_pack,
    purchaseUnitName: r.purchase_unit_name,
  }
}

export async function resolvePurchaseRows(
  raw: MatchQuery[],
): Promise<(PurchaseMatch | null)[]> {
  await requireUser()

  const parsed = matchSchema.safeParse(raw)
  if (!parsed.success) throw new Error('매칭 요청이 올바르지 않습니다')
  const rows = parsed.data

  const supabase = await createClient()

  // 코드는 barcodes 가 진실이다 — 부바코드로 등록된 코드까지 잡는다.
  const codes = [...new Set(rows.map((r) => r.code).filter((v): v is string => !!v))]
  const byCode = new Map<string, string>() // code → variant_id
  for (const part of chunks(codes)) {
    const { data, error } = await supabase
      .from('barcodes')
      .select('code, variant_id')
      .in('code', part)
    // 실패를 "일치 없음"으로 삼키면 못 찾은 줄로 조용히 둔갑한다 (lib/chunks.ts).
    if (error) throw new Error('코드 매칭에 실패했습니다: ' + error.message)
    for (const b of data ?? []) byCode.set(b.code, b.variant_id)
  }

  const names = [...new Set(rows.map((r) => r.name).filter((v): v is string => !!v))]
  const byName = new Map<string, VariantRow[]>()
  for (const part of chunksByEncodedLength(names)) {
    const { data, error } = await supabase
      .from('v_variant_stock')
      .select(
        'variant_id, product_name, option_label, stock_qty, cost_price, unit, units_per_pack, purchase_unit_name',
      )
      .eq('is_active', true)
      .eq('product_active', true)
      .in('product_name', part)
    if (error) throw new Error('이름 매칭에 실패했습니다: ' + error.message)
    for (const v of (data ?? []) as VariantRow[]) {
      if (!v.product_name) continue
      const list = byName.get(v.product_name) ?? []
      list.push(v)
      byName.set(v.product_name, list)
    }
  }

  // 코드로 걸린 변형의 상세도 같은 뷰에서 받는다 — 숨긴 상품이면 여기서
  // 빠져서 매칭 실패로 떨어진다 (숨긴 상품의 재고를 파일이 늘리면 안 된다).
  const codeVariantIds = [...new Set(byCode.values())]
  const byVariantId = new Map<string, VariantRow>()
  for (const part of chunks(codeVariantIds)) {
    const { data, error } = await supabase
      .from('v_variant_stock')
      .select(
        'variant_id, product_name, option_label, stock_qty, cost_price, unit, units_per_pack, purchase_unit_name',
      )
      .eq('is_active', true)
      .eq('product_active', true)
      .in('variant_id', part)
    if (error) throw new Error('코드 매칭에 실패했습니다: ' + error.message)
    for (const v of (data ?? []) as VariantRow[]) {
      if (v.variant_id) byVariantId.set(v.variant_id, v)
    }
  }

  return rows.map((r) => {
    if (r.code) {
      const vid = byCode.get(r.code)
      const v = vid ? byVariantId.get(vid) : undefined
      if (v) return toMatch(v)
    }
    if (r.name) {
      const list = byName.get(r.name) ?? []
      // 변형이 여럿인 상품은 이름만으로 어느 옵션인지 알 수 없다 — 사람 몫.
      if (list.length === 1) return toMatch(list[0])
    }
    return null
  })
}

// ---------------------------------------------------------------------------
// 확정
// ---------------------------------------------------------------------------

const lineSchema = z
  .object({
    variantId: z.uuid(),
    /** 낱개 수량 (박스 해석이면 boxes × perPack 과 같아야 한다 — RPC 가 검산) */
    qty: z.number().int().min(1).max(1_000_000),
    /** 낱개 매입가. 소수 2자리까지 (박스값 ÷ 개수가 원 아래로 남을 수 있다) */
    unitCost: z.number().min(0).max(1_000_000_000).nullable(),
    boxes: z.number().int().min(1).max(10_000).nullable(),
    perPack: z.number().int().min(2).max(100_000).nullable(),
  })
  .refine((l) => l.boxes == null || (l.perPack != null && l.qty === l.boxes * l.perPack), {
    error: '박스 환산이 맞지 않습니다',
  })

const importSchema = z.object({
  lines: z
    .array(lineSchema)
    .min(1, { error: '반영할 줄이 없습니다' })
    .max(2_000, { error: '한 번에 2,000줄까지만 반영할 수 있습니다' }),
  note: z.string().trim().max(120).nullable(),
  /** KST 발생일. null 이면 지금 */
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
})

export type PurchaseImportPayload = z.infer<typeof importSchema>

export type PurchaseImportResult =
  | { status: 'error'; error: string }
  | { status: 'done'; batchId: string; count: number; totalQty: number }

export async function importPurchases(
  payload: PurchaseImportPayload,
): Promise<PurchaseImportResult> {
  await requireUser()

  const parsed = importSchema.safeParse(payload)
  if (!parsed.success) {
    return { status: 'error', error: parsed.error.issues[0].message }
  }
  const { lines, note, occurredOn } = parsed.data

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('import_purchases', {
    p_rows: lines.map((l) => ({
      variant_id: l.variantId,
      qty: l.qty,
      unit_cost: l.unitCost,
      boxes: l.boxes,
      per_pack: l.perPack,
    })),
    p_note: note ?? undefined,
    p_occurred_on: occurredOn ?? undefined,
  })

  if (error) return { status: 'error', error: error.message }

  refresh()

  const row = data?.[0]
  return {
    status: 'done',
    batchId: row?.batch_id ?? '',
    count: row?.movement_count ?? lines.length,
    totalQty: row?.total_qty ?? 0,
  }
}

// ---------------------------------------------------------------------------
// 배치 되돌리기 — 이 화면의 이력 카드가 ActionForm 으로 부른다
// ---------------------------------------------------------------------------

export async function voidPurchaseBatch(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser()

  const parsed = z.uuid().safeParse(formData.get('batchId'))
  if (!parsed.success) return fail('배치를 찾을 수 없습니다')

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('void_purchase_import', {
    p_batch_id: parsed.data,
    p_reason: '입고 파일 되돌림',
  })

  if (error) return fail(error.message)
  refresh()
  return ok(`전표 ${data}장을 되돌렸습니다. 재고와 매입이 반영 전으로 돌아왔습니다`)
}

function refresh() {
  // 입고는 재고·원장·홈 타일(재고 자산)·통계(매입액)를 전부 움직인다.
  revalidatePath('/')
  revalidatePath('/stock')
  revalidatePath('/movements', 'layout')
  revalidatePath('/stats')
}
