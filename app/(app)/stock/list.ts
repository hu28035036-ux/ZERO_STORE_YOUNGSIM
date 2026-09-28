import 'server-only'

import { createClient } from '@/lib/supabase/server'

import type { ArchivedProduct } from './archived-table'
import { likePattern, PAGE_SIZE, productSearchFilter, SORTS, type StockQuery, type StockRow } from './query'

/**
 * 재고 목록 한 쪽(query.page).
 *
 * 쪽마다 따로 요청하므로 조건·정렬이 요청마다 똑같아야 한다. 정렬이 흔들리면 1쪽과 2쪽
 * 경계에서 같은 상품이 두 번 보이거나 아예 빠진다. 그래서 쿼리는 여기 한 곳에만 있다.
 *
 * offset 기반이다. 쪽을 넘기는 사이에 상품을 지우면 한 줄씩 밀리는데, 이 앱은 사용자가
 * 한 명이라 커서 페이지네이션의 복잡함이 값을 못 한다.
 */
export async function fetchStockPage(query: StockQuery) {
  const supabase = await createClient()
  const offset = (query.page - 1) * PAGE_SIZE

  let list = supabase
    .from('v_variant_stock')
    // count 로 쪽 수를 낸다. exact count 는 뷰 전체를 훑지만 수백 건 규모라 체감되지 않는다.
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
  // 정렬 키가 같은 행끼리의 순서를 고정한다. 이게 없으면 쪽 경계에서
  // DB 가 같은 값의 행을 매번 다르게 내놓아 한 상품이 두 번 보인다.
  list = list.order('variant_id')

  const { data, error, count, status } = await list.range(offset, offset + PAGE_SIZE - 1)
  if (pastTheEnd(status, error) && query.page > 1) return fetchStockPage({ ...query, page: 1 })

  return {
    rows: (data ?? []) as StockRow[],
    total: count ?? 0,
    error: error?.message ?? null,
  }
}

/**
 * 쪽 수보다 먼 쪽을 달라고 했나. 그때 PostgREST 는 빈 목록이 아니라 416(PGRST103)을 주고 개수도
 * 안 싣는다 — 그대로 두면 "재고를 불러오지 못했습니다"가 뜬다. 부르는 쪽은 1쪽을 다시 받아 개수를
 * 얻고, page.tsx 가 그 개수로 마지막 쪽으로 보낸다. 드문 길이다(다른 기기에서 지워 쪽이 줄었거나,
 * 주소를 손으로 고쳤을 때). 딱 끝(offset = 개수)은 416 이 아니라 빈 목록이 온다.
 */
function pastTheEnd(status: number, error: { code?: string } | null): boolean {
  return status === 416 || error?.code === 'PGRST103'
}

/** "삭제됨" 탭 한 쪽. 지운 때의 역순이다 — 방금 지운 것을 되살리는 일이 가장 잦다. */
export async function fetchArchivedPage(query: StockQuery) {
  const supabase = await createClient()
  const offset = (query.page - 1) * PAGE_SIZE

  let list = supabase
    .from('v_archived_products')
    .select('*', { count: 'exact' })
    .order('archived_at', { ascending: false })
    // 선택 삭제는 한 번에 여러 상품을 같은 시각으로 숨긴다. 그 시각끼리의 순서를 못 박지
    // 않으면 쪽 경계에서 같은 상품이 두 번 보이거나 빠진다.
    .order('product_id')

  const pattern = likePattern(query.q)
  if (pattern) list = list.ilike('product_name', pattern)

  const { data, error, count, status } = await list.range(offset, offset + PAGE_SIZE - 1)
  if (pastTheEnd(status, error) && query.page > 1) return fetchArchivedPage({ ...query, page: 1 })

  return {
    rows: (data ?? []) as ArchivedProduct[],
    total: count ?? 0,
    error: error?.message ?? null,
  }
}
