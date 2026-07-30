import type { Tables } from '@/lib/database.types'
import type { MovementType } from '@/lib/constants'

export type MovementRow = Tables<'v_movements'>

/**
 * 화면에서 고를 수 있는 종류.
 *
 * 'sale' 은 여기 없다. 판매 전표는 판매 화면에서만 생기고, 이 화면에서 손으로
 * 만들 수 있게 하면 영수증 없는 판매가 원장에 섞인다. 다만 내역에는 보여야
 * 하므로 필터에는 들어간다.
 */
export const ENTRY_TYPES: MovementType[] = [
  'purchase',
  'outbound',
  'adjustment',
  'stocktake',
]

export const FILTER_TYPES = ['all', ...ENTRY_TYPES, 'sale'] as const
export type MovementFilter = (typeof FILTER_TYPES)[number]

export const FILTER_LABEL: Record<MovementFilter, string> = {
  all: '전체',
  purchase: '입고',
  outbound: '출고',
  adjustment: '조정',
  stocktake: '실사',
  sale: '판매',
}

export const LIST_LIMIT = 100

export type MovementQuery = {
  type: MovementFilter
  /** 특정 변형의 내역만. 재고 화면에서 넘어올 때 쓴다. */
  variantId: string | null
  /** KST 기준 날짜. 비어 있으면 전체 기간. */
  from: string
  to: string
  page: number
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function one(v: string | string[] | undefined): string {
  return typeof v === 'string' ? v : ''
}

export function parseMovementQuery(sp: {
  [key: string]: string | string[] | undefined
}): MovementQuery {
  const from = one(sp.from)
  const to = one(sp.to)
  const variantId = one(sp.variant)
  const page = Number(one(sp.page))

  return {
    type: FILTER_TYPES.find((t) => t === sp.type) ?? 'all',
    // 모양이 틀린 uuid 를 그대로 넘기면 PostgREST 가 400 을 낸다.
    variantId: UUID.test(variantId) ? variantId : null,
    from: DATE.test(from) ? from : '',
    to: DATE.test(to) ? to : '',
    page: Number.isInteger(page) && page > 0 ? page : 0,
  }
}

export function movementHref(
  current: MovementQuery,
  patch: Partial<MovementQuery>,
): string {
  const next = { ...current, ...patch }
  const params = new URLSearchParams()
  if (next.type !== 'all') params.set('type', next.type)
  if (next.variantId) params.set('variant', next.variantId)
  if (next.from) params.set('from', next.from)
  if (next.to) params.set('to', next.to)
  if (next.page > 0) params.set('page', String(next.page))
  const qs = params.toString()
  return qs ? `/movements?${qs}` : '/movements'
}

/**
 * KST 날짜를 timestamptz 경계로.
 *
 * occurred_at 은 timestamptz 이고 통계의 날짜 버킷은 전부 KST 로 잘린다.
 * 여기서 UTC 자정으로 자르면 목록과 통계가 9시간씩 어긋나서, 저녁에 넣은
 * 입고가 내역에서는 오늘인데 통계에서는 내일이 된다.
 *
 * 한국은 서머타임이 없어 +09:00 고정 오프셋이 항상 맞다.
 */
export function kstDayStart(date: string): string {
  return `${date}T00:00:00+09:00`
}

/** 종료일은 그 날을 포함해야 하므로 다음 날 0시 미만으로 본다. */
export function kstDayEnd(date: string): string {
  const d = new Date(`${date}T00:00:00+09:00`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString()
}
