import type { Tables } from '@/lib/database.types'
import { parsePage } from '@/lib/pagination'

// 검색어 정제는 입출고·판매 화면도 그대로 쓴다. lib 에 두고 여기서는 다시 내보낸다.
export { likePattern, productSearchFilter } from '@/lib/search'

export type StockRow = Tables<'v_variant_stock'>

/**
 * 목록에 부제로 그릴 POS 메뉴명. 그릴 게 없으면 null.
 *
 * **표기만 다른 경우는 안 그린다.** 확정 매칭을 재보면 36% 는 괄호·띄어쓰기
 * 차이뿐이라(`라라스윗 저당 카라멜 팝콘` ↔ `라라스윗) 저당 카라멜 팝콘`), 그것까지
 * 다 그리면 목록이 두 배로 길어지면서 정작 진짜 다른 22%(브랜드가 바뀐 것들)가
 * 파묻힌다. 목록의 부제는 "어, 이건 이름이 다르네" 를 눈에 띄게 하려고 있는 것이지
 * 데이터를 다 보여주려고 있는 게 아니다. 전체 값은 상품 수정 화면에서 본다.
 *
 * 비교는 소문자·공백·괄호를 털어낸 뒤에 한다. 이 정규화는 검색이 아니라
 * "사람이 보기에 같은 이름인가" 판정 전용이다.
 */
export function posSubtitle(row: Pick<StockRow, 'product_name' | 'pos_name'>): string | null {
  const pos = row.pos_name?.trim()
  if (!pos) return null
  const flatten = (s: string) => s.toLowerCase().replace(/[\s()[\]]/g, '')
  return flatten(pos) === flatten(row.product_name ?? '') ? null : pos
}

export const FILTERS = ['all', 'low', 'negative', 'archived'] as const
export type StockFilter = (typeof FILTERS)[number]

export const FILTER_LABEL: Record<StockFilter, string> = {
  all: '전체',
  low: '부족·품절',
  negative: '음수',
  archived: '삭제됨',
}

/**
 * 정렬 키 → 뷰 컬럼.
 *
 * URL 로 들어온 문자열을 그대로 order() 에 넘기면 존재하지 않는 컬럼으로
 * 400 이 나거나, 뷰에 있지만 화면에 안 보이는 컬럼으로 정렬된다.
 * 허용 목록을 코드에 박아두고 그 밖은 전부 기본값으로 떨어뜨린다.
 */
export const SORTS = {
  name: { column: 'product_name', label: '상품' },
  qty: { column: 'stock_qty', label: '재고' },
  price: { column: 'sale_price', label: '판매가' },
  margin: { column: 'margin_rate', label: '마진율' },
  value: { column: 'stock_value', label: '재고금액' },
} as const

export type SortKey = keyof typeof SORTS

const SORT_KEYS = Object.keys(SORTS) as SortKey[]

/**
 * 재고 목록 한 쪽의 행수. 삭제됨 탭도 같은 크기로 나눈다.
 *
 * 처음엔 200개를 한 번에 받고 잘랐는데, 432개 품목이 되자 "200개까지만" 안내가
 * 늘 떠 있어 전체를 못 보는 화면이 됐다. 그 뒤 30개씩 이어 붙이는 무한 스크롤을 거쳐
 * 2026-09-28 에 사용자 요청으로 쪽 넘김이 됐다 — 30 은 그때 정한 크기 그대로다.
 */
export const PAGE_SIZE = 30

/**
 * 목록 칸의 id — 쪽을 넘기면 Pager(components/ui/pager.tsx)가 이 칸의 위쪽을 검색 막대 바로
 * 아래로 올린다. page.tsx 가 칸의 id 로 찍고 Pager 에 prop 으로 넘긴다. 'use client' 파일에 두면
 * 서버 화면이 받는 값이 문자열이 아니라 클라이언트 참조가 되어 id 가 엉뚱하게 찍힌다.
 */
export const STOCK_LIST_ID = 'stock-list'

export type StockQuery = {
  q: string
  filter: StockFilter
  sort: SortKey
  desc: boolean
  /** 1부터 센다(1 = 첫 쪽). 화면 번호와 같아서 ±1 환산이 없다. */
  page: number
  /** 상품 수정 화면에서 삭제하고 돌아왔을 때 보여줄 이름. 필터·정렬과 달리
   *  링크 상태가 아니라 1회성 안내라 stockHref/sortHref 는 이 값을 건드리지 않는다. */
  archivedName: string | null
}

export function parseStockQuery(sp: {
  [key: string]: string | string[] | undefined
}): StockQuery {
  const raw = typeof sp.q === 'string' ? sp.q : ''
  const archivedRaw = typeof sp.archived === 'string' ? sp.archived : ''
  return {
    q: raw.trim().slice(0, 40),
    filter: FILTERS.find((f) => f === sp.filter) ?? 'all',
    sort: SORT_KEYS.find((s) => s === sp.sort) ?? 'name',
    desc: sp.dir === 'desc',
    page: parsePage(sp.page),
    archivedName: archivedRaw.trim().slice(0, 120) || null,
  }
}

/**
 * 현재 조건에서 일부만 바꾼 링크. 기본값은 URL 에 남기지 않는다.
 *
 * 쪽은 patch 에 없으면 1쪽으로 돌린다. 필터·정렬을 바꾸면 목록이 통째로 달라져서, 보던 쪽
 * 번호가 남으면 엉뚱한 자리부터 보이거나("부족·품절 7쪽") 없는 쪽이 된다.
 */
export function stockHref(current: StockQuery, patch: Partial<StockQuery>): string {
  const next = { ...current, page: 1, ...patch }
  const params = new URLSearchParams()
  if (next.q) params.set('q', next.q)
  if (next.filter !== 'all') params.set('filter', next.filter)
  if (next.sort !== 'name') params.set('sort', next.sort)
  if (next.desc) params.set('dir', 'desc')
  if (next.page > 1) params.set('page', String(next.page))
  const qs = params.toString()
  return qs ? `/stock?${qs}` : '/stock'
}

/** 표 머리글을 눌렀을 때 갈 곳. 같은 열을 다시 누르면 방향만 뒤집는다. */
export function sortHref(current: StockQuery, key: SortKey): string {
  return stockHref(current, {
    sort: key,
    // 이름은 오름차순이 자연스럽고, 숫자 열은 큰 값부터 보는 게 쓸모 있다.
    desc: current.sort === key ? !current.desc : key !== 'name',
  })
}
