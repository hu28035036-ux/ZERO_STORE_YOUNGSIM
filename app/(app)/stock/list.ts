import 'server-only'

import { createClient } from '@/lib/supabase/server'

import { likePattern, PAGE_SIZE, productSearchFilter, SORTS, type StockQuery, type StockRow } from './query'

/**
 * 재고 목록 한 페이지.
 *
 * 첫 화면(page.tsx)과 "더 불러오기"(actions.ts)가 같은 조건·정렬을 써야 한다.
 * 둘이 따로 쿼리를 짜면 첫 30개와 다음 30개의 정렬이 어긋나 같은 상품이 두 번
 * 보이거나 빠진다. 그래서 쿼리는 여기 한 곳에만 있다.
 *
 * offset 기반이다. 목록이 스크롤되는 동안 다른 사람이 상품을 지우면 한 줄이
 * 밀려 겹칠 수 있는데, 이 앱은 사용자가 한 명이라 커서 페이지네이션의 복잡함이
 * 값을 못 한다. 대신 화면에서 variant_id 로 중복을 걸러낸다.
 */
export async function fetchStockPage(query: StockQuery, offset: number) {
  const supabase = await createClient()

  let list = supabase
    .from('v_variant_stock')
    // 첫 페이지에서만 count 가 필요하지만, 조건이 한 곳에 있으려면 늘 같이 센다.
    // exact count 는 뷰 전체를 훑지만 수백 건 규모라 체감되지 않는다.
    .select('*', { count: 'exact' })
    // 판매 중지한 상품·변형은 재고 목록에서 뺀다. 되살리는 것은 "삭제됨" 탭 몫이다.
    .eq('is_active', true)
    .eq('product_active', true)

  if (query.filter === 'low') list = list.eq('is_low_stock', true)
  if (query.filter === 'negative') list = list.eq('is_negative', true)

  const pattern = likePattern(query.q)
  if (pattern) {
    // 상품명·POS 메뉴명·SKU·바코드를 한 번에 훑는다. 물건을 손에 들고 찾을 때
    // 넷 중 무엇으로 찾을지는 그때그때 다르고, 매장 사람이 아는 이름은 발주명이
    // 아니라 POS 메뉴명 쪽인 경우가 많다.
    list = list.or(productSearchFilter(pattern))
  }

  list = list.order(SORTS[query.sort].column, { ascending: !query.desc })
  if (query.sort !== 'name') list = list.order('product_name')
  // 같은 상품 안에서는 옵션 순. 옵션 없는 변형(label = null)이 맨 위로 온다.
  list = list.order('option_label', { nullsFirst: true })
  // 정렬 키가 같은 행끼리의 순서를 고정한다. 이게 없으면 페이지 경계에서
  // DB 가 같은 값의 행을 매번 다르게 내놓아 한 상품이 두 번 보인다.
  list = list.order('variant_id')

  const { data, error, count } = await list.range(offset, offset + PAGE_SIZE - 1)

  return {
    rows: (data ?? []) as StockRow[],
    total: count ?? 0,
    error: error?.message ?? null,
  }
}
