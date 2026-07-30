import type { Enums } from '@/lib/database.types'

export type MovementType = Enums<'stock_movement_type'>

/**
 * DB 는 영문 enum 값으로 저장하고 한국어는 여기서만 붙인다.
 * 한글 enum 값은 마이그레이션·정렬·외부 연동에서 계속 발목을 잡는다.
 */
export const MOVEMENT_LABEL: Record<MovementType, string> = {
  purchase: '입고',
  outbound: '출고',
  sale: '판매',
  adjustment: '조정',
  stocktake: '실사',
}

/** 재고가 늘어나는 방향인지. 배지 색과 부호 표시에 쓴다. */
export const MOVEMENT_TONE: Record<MovementType, 'in' | 'out' | 'neutral'> = {
  purchase: 'in',
  outbound: 'out',
  sale: 'out',
  adjustment: 'neutral',
  stocktake: 'neutral',
}

/** 원화 표기. 소수점은 버린다 — 화면에서 원 단위 아래는 의미가 없다. */
export function formatWon(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? Number(value) : (value ?? 0)
  if (!Number.isFinite(n)) return '0원'
  return `${Math.round(n).toLocaleString('ko-KR')}원`
}

/** 수량. 음수 재고는 부호를 살려서 보여준다. */
export function formatQty(value: number | null | undefined): string {
  return (value ?? 0).toLocaleString('ko-KR')
}

/**
 * 집계 기준 시각대. DB 쪽 뷰·함수가 전부 KST 로 날짜를 자르므로
 * 화면에서 날짜를 만들 때도 같은 기준을 써야 하루씩 어긋나지 않는다.
 */
export const TIME_ZONE = 'Asia/Seoul'

/**
 * 목록에 쓰는 짧은 일시. 항상 KST 로 그린다.
 *
 * 서버는 UTC 로 돌고 브라우저는 기기 시간대를 쓴다. 어느 쪽이든 기본값에
 * 맡기면 같은 전표가 서버 렌더링과 클라이언트에서 다른 시각으로 보인다.
 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: TIME_ZONE,
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
}

/** KST 기준 오늘 날짜를 YYYY-MM-DD 로. 통계 기간 기본값에 쓴다. */
export function todayInSeoul(now: Date = new Date()): string {
  // en-CA 로케일이 YYYY-MM-DD 를 준다. 직접 조립하는 것보다 실수가 적다.
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(now)
}
