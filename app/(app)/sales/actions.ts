'use server'

import type { PostgrestError } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireUser } from '@/lib/auth'
import { todayInSeoul } from '@/lib/constants'
import { likePattern, nameSkuBarcodeFilter } from '@/lib/search'
import { createClient } from '@/lib/supabase/server'

export type FoundItem = {
  variantId: string
  productName: string
  optionLabel: string | null
  salePrice: number
  costPrice: number
  stockQty: number
  barcode: string | null
  /** 상품의 세는 말. 재고 문구("재고 3병")에 붙는다. */
  unit: string
}

const SEARCH_LIMIT = 12

/**
 * 스캔 · 검색 한 방.
 *
 * 바코드 정확 일치를 먼저 본다. 계산대의 정상 경로가 이쪽이고, barcodes.code 가
 * PK 라 단일 조회로 끝난다. 부분 검색을 먼저 돌리면 매 스캔마다 ilike 세 개를
 * 훑게 된다.
 *
 * 서버 액션은 UI 없이 POST 로도 불릴 수 있어서 여기서도 로그인을 확인한다.
 */
export async function findItems(rawQuery: string): Promise<FoundItem[]> {
  await requireUser()

  const q = String(rawQuery ?? '').trim().slice(0, 60)
  if (!q) return []

  const supabase = await createClient()

  const { data: exact } = await supabase.rpc('lookup_by_barcode', { p_code: q })
  if (exact && exact.length > 0) {
    return exact.map((r) => ({
      variantId: r.variant_id,
      productName: r.product_name,
      optionLabel: r.option_label,
      salePrice: Number(r.sale_price ?? 0),
      costPrice: Number(r.cost_price ?? 0),
      stockQty: r.stock_qty ?? 0,
      barcode: r.barcode,
      unit: r.unit || '개',
    }))
  }

  const pattern = likePattern(q)
  if (!pattern) return []

  const { data } = await supabase
    .from('v_variant_stock')
    .select('*')
    .eq('is_active', true)
    .eq('product_active', true)
    .or(nameSkuBarcodeFilter(pattern))
    .order('product_name')
    .order('option_label', { nullsFirst: true })
    .limit(SEARCH_LIMIT)

  return (data ?? []).map((r) => ({
    variantId: r.variant_id!,
    productName: r.product_name ?? '',
    optionLabel: r.option_label,
    salePrice: Number(r.sale_price ?? 0),
    costPrice: Number(r.cost_price ?? 0),
    stockQty: r.stock_qty ?? 0,
    barcode: r.barcode,
    unit: r.unit || '개',
  }))
}

const itemSchema = z.object({
  variant_id: z.uuid(),
  qty: z.number().int().min(1).max(10_000),
  unit_price: z.number().int().min(0).max(1_000_000_000),
})

const cartSchema = z
  .array(itemSchema)
  .min(1, { error: '담긴 물건이 없습니다' })
  .max(200)

export type SaleState =
  | null
  | { status: 'error'; error: string }
  | { status: 'done'; orderId: string; total: number; count: number }

function humanize(error: PostgrestError): string {
  return error.message
}

export async function recordSale(
  _prev: SaleState,
  formData: FormData,
): Promise<SaleState> {
  await requireUser()

  const raw = formData.get('cart')
  if (typeof raw !== 'string') {
    return { status: 'error', error: '장바구니를 읽지 못했습니다' }
  }

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return { status: 'error', error: '장바구니를 읽지 못했습니다' }
  }

  const parsed = cartSchema.safeParse(json)
  if (!parsed.success) {
    return { status: 'error', error: parsed.error.issues[0].message }
  }

  const memo = String(formData.get('memo') ?? '').trim().slice(0, 200) || undefined

  const today = todayInSeoul()
  const date = String(formData.get('date') ?? '').trim()
  if (date && date > today) {
    // 아직 일어나지 않은 일을 원장에 넣으면 통계가 미래로 샌다.
    return { status: 'error', error: '앞날짜로는 등록할 수 없습니다' }
  }
  // 오늘이면 now() 그대로 두어 시각까지 남긴다. 지난 날짜면 그 날 정오로
  // 박는다 — KST 오프셋을 명시해야 날짜 버킷이 하루 밀리지 않는다
  // (movements/actions.ts 와 같은 규칙).
  const occurredAt = date && date !== today ? `${date}T12:00:00+09:00` : undefined

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('record_sale', {
    p_items: parsed.data,
    p_memo: memo,
    p_occurred_at: occurredAt,
  })

  if (error) return { status: 'error', error: humanize(error) }

  // 판매는 재고·원장·오늘 매출(홈)·기간 매출(통계)을 전부 움직인다.
  // 하나라도 빼면 그 화면만 어제 숫자를 보여준다.
  revalidatePath('/')
  revalidatePath('/stock')
  revalidatePath('/movements')
  revalidatePath('/stats')
  revalidatePath('/sales')

  const total = parsed.data.reduce((sum, i) => sum + i.qty * i.unit_price, 0)
  const count = parsed.data.reduce((sum, i) => sum + i.qty, 0)

  return { status: 'done', orderId: String(data), total, count }
}
