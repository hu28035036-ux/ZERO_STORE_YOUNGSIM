import 'server-only'

import { isPastTheEnd } from '@/lib/pagination'
import { likePattern, productSearchFilter } from '@/lib/search'
import { createClient } from '@/lib/supabase/server'

import type { QuickTarget } from './quick-row'

/** 한 쪽의 줄 수. 재고 화면(stock/query.ts 의 PAGE_SIZE)과 같은 30 — 두 목록의 쪽 감각이 같아야 한다. */
export const QUICK_PAGE_SIZE = 30

/**
 * 빠른 등록 목록 한 쪽(page, 1부터).
 *
 * 쪽마다 따로 요청하므로 조건·정렬이 요청마다 똑같아야 쪽 경계에서 한 상품이 두 번 보이거나
 * 빠지지 않는다. 그래서 쿼리는 여기 한 곳에만 있다.
 *
 * 예전엔 20개에서 잘라 "검색어를 더 좁혀 주세요" 로 끝냈는데, 검색어 없이 전체를 훑으며 수량을
 * 손보는 사용이 실제로 있어(2026-09-23 요청) 무한 스크롤이 됐고, 2026-09-28 에 재고 목록과 같은
 * 30개씩 쪽 넘김이 됐다(사용자 요청).
 */
export async function fetchQuickPage(q: string, page: number): Promise<{
  rows: QuickTarget[]
  total: number
  error: string | null
}> {
  const supabase = await createClient()
  const offset = (page - 1) * QUICK_PAGE_SIZE

  let list = supabase
    .from('v_variant_stock')
    .select('*', { count: 'exact' })
    .eq('is_active', true)
    .eq('product_active', true)

  const pattern = likePattern(q)
  if (pattern) list = list.or(productSearchFilter(pattern))

  list = list
    .order('product_name')
    .order('option_label', { nullsFirst: true })
    // 이름·옵션이 같은 행의 순서를 고정한다. 없으면 쪽 경계에서 DB 가 같은
    // 값의 행을 매번 다르게 내놓아 한 상품이 두 번 보인다.
    .order('variant_id')

  const { data, error, count, status } = await list.range(offset, offset + QUICK_PAGE_SIZE - 1)
  // 쪽 수보다 먼 쪽이면 1쪽을 다시 받아 개수를 얻는다 — page.tsx 가 그 개수로 마지막 쪽으로
  // 보낸다(lib/pagination.ts 의 isPastTheEnd 주석).
  if (isPastTheEnd(status, error) && page > 1) return fetchQuickPage(q, 1)

  const rows: QuickTarget[] = (data ?? []).map((row) => ({
    variantId: row.variant_id!,
    productName: row.product_name ?? '',
    optionLabel: row.option_label,
    stockQty: row.stock_qty ?? 0,
    threshold: row.low_stock_threshold ?? 0,
    salePrice: Number(row.sale_price ?? 0),
    unit: row.unit || '개',
  }))

  return { rows, total: count ?? 0, error: error?.message ?? null }
}
