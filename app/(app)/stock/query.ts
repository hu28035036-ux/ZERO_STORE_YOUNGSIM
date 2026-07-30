import type { Tables } from '@/lib/database.types'

export type StockRow = Tables<'v_variant_stock'>

export const FILTERS = ['all', 'low', 'negative'] as const
export type StockFilter = (typeof FILTERS)[number]

export const FILTER_LABEL: Record<StockFilter, string> = {
  all: '전체',
  low: '부족·품절',
  negative: '음수',
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
 * 한 번에 가져올 최대 행수.
 *
 * 잘린 것을 화면에서 반드시 알려야 한다. 조용히 자르면 "우리 가게 물건이
 * 200개뿐"이라고 읽힌다.
 */
export const LIST_LIMIT = 200

export type StockQuery = {
  q: string
  filter: StockFilter
  sort: SortKey
  desc: boolean
}

export function parseStockQuery(sp: {
  [key: string]: string | string[] | undefined
}): StockQuery {
  const raw = typeof sp.q === 'string' ? sp.q : ''
  return {
    q: raw.trim().slice(0, 40),
    filter: FILTERS.find((f) => f === sp.filter) ?? 'all',
    sort: SORT_KEYS.find((s) => s === sp.sort) ?? 'name',
    desc: sp.dir === 'desc',
  }
}

/** 현재 조건에서 일부만 바꾼 링크. 기본값은 URL 에 남기지 않는다. */
export function stockHref(current: StockQuery, patch: Partial<StockQuery>): string {
  const next = { ...current, ...patch }
  const params = new URLSearchParams()
  if (next.q) params.set('q', next.q)
  if (next.filter !== 'all') params.set('filter', next.filter)
  if (next.sort !== 'name') params.set('sort', next.sort)
  if (next.desc) params.set('dir', 'desc')
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

/**
 * PostgREST `or()` 에 넣을 LIKE 패턴.
 *
 * or() 는 쉼표로 조건을 나누고 괄호로 묶는 문법이라, 사용자가 상품명에 친
 * 쉼표 하나에 필터가 통째로 깨져 400 이 난다. LIKE 와일드카드(`%` `_`)도
 * 빼둔다 — 검색창에 `%` 만 쳤을 때 전체가 걸리면 검색이 고장난 것처럼 보인다.
 *
 * 마침표는 남긴다. 값 부분의 점은 PostgREST 가 구분자로 보지 않고,
 * "1.5L" 같은 상품명이 실제로 흔하다.
 */
export function likePattern(raw: string): string {
  const cleaned = raw.replace(/[,()%_\\*]/g, ' ').trim()
  return cleaned ? `%${cleaned}%` : ''
}
