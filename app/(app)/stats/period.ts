import { todayInSeoul } from '@/lib/constants'

export const PRESETS = ['today', '7d', '30d', 'month', 'last-month'] as const
export type Preset = (typeof PRESETS)[number]

export const PRESET_LABEL: Record<Preset, string> = {
  today: '오늘',
  '7d': '최근 7일',
  '30d': '최근 30일',
  month: '이번 달',
  'last-month': '지난 달',
}

const DEFAULT_PRESET: Preset = '30d'
const DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * 달력 날짜 더하기.
 *
 * 시간대 의미 없이 YYYY-MM-DD 문자열만 다룬다. UTC 로 파싱하고 UTC 로 더하므로
 * 서버가 어느 시간대에서 돌든 결과가 같다. 로컬 Date 로 하면 배포 지역에 따라
 * 하루가 밀린다.
 */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** from 부터 to 까지 며칠인지 (양끝 포함). */
export function dayCount(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  return Math.round((b - a) / 86_400_000) + 1
}

/** from..to 사이의 모든 날짜. 판매가 없던 날도 축에 자리를 잡아야 추이가 안 찌그러진다. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = []
  const n = dayCount(from, to)
  for (let i = 0; i < n; i++) out.push(addDays(from, i))
  return out
}

function firstOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`
}

export function presetRange(preset: Preset, today: string): { from: string; to: string } {
  switch (preset) {
    case 'today':
      return { from: today, to: today }
    case '7d':
      return { from: addDays(today, -6), to: today }
    case 'month':
      return { from: firstOfMonth(today), to: today }
    case 'last-month': {
      const lastDay = addDays(firstOfMonth(today), -1)
      return { from: firstOfMonth(lastDay), to: lastDay }
    }
    case '30d':
    default:
      return { from: addDays(today, -29), to: today }
  }
}

export type Period = {
  from: string
  to: string
  /** 프리셋으로 만들어진 기간이면 그 이름. 직접 고른 기간이면 null. */
  preset: Preset | null
}

export function parsePeriod(sp: {
  [key: string]: string | string[] | undefined
}): Period {
  const today = todayInSeoul()
  const from = typeof sp.from === 'string' ? sp.from : ''
  const to = typeof sp.to === 'string' ? sp.to : ''

  // 직접 고른 기간이 우선. 뒤집혀 있으면 바로잡는다 — 400 을 던지는 것보다
  // 사용자가 의도한 걸 보여주는 쪽이 낫다.
  if (DATE.test(from) && DATE.test(to)) {
    return from <= to ? { from, to, preset: null } : { from: to, to: from, preset: null }
  }

  const preset = PRESETS.find((p) => p === sp.preset) ?? DEFAULT_PRESET
  return { ...presetRange(preset, today), preset }
}

/**
 * 직전 같은 길이의 기간.
 *
 * 7일을 보고 있으면 그 앞 7일과 비교한다. 달을 보고 있으면 앞 달과 길이가
 * 다를 수 있지만, 같은 일수로 자르는 편이 "하루 평균이 늘었나"에 정직하다.
 */
export function previousPeriod(period: Period): { from: string; to: string } {
  const n = dayCount(period.from, period.to)
  const to = addDays(period.from, -1)
  return { from: addDays(to, -(n - 1)), to }
}

export function periodHref(patch: {
  preset?: Preset
  from?: string
  to?: string
}): string {
  const params = new URLSearchParams()
  if (patch.preset) params.set('preset', patch.preset)
  if (patch.from) params.set('from', patch.from)
  if (patch.to) params.set('to', patch.to)
  const qs = params.toString()
  return qs ? `/stats?${qs}` : '/stats'
}

/** 증감률. 직전 기간이 0 이면 비율이 뜻을 잃으므로 null 을 준다. */
export function changeRate(current: number, previous: number): number | null {
  if (!previous) return null
  return ((current - previous) / Math.abs(previous)) * 100
}
