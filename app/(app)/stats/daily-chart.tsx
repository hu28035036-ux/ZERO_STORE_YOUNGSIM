'use client'

import { useState } from 'react'

import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/cn'
import { formatWon, TIME_ZONE } from '@/lib/constants'

import { addDays, eachDay } from './period'

export type DailyPoint = { date: string; revenue: number }

const GRAINS = ['day', 'week', 'month'] as const
type Grain = (typeof GRAINS)[number]
const GRAIN_LABEL: Record<Grain, string> = { day: '일별', week: '주간', month: '월간' }

const DAY_LABEL = new Intl.DateTimeFormat('ko-KR', {
  timeZone: TIME_ZONE,
  month: 'numeric',
  day: 'numeric',
})
const MONTH_LABEL = new Intl.DateTimeFormat('ko-KR', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: 'numeric',
})

function dayLabel(date: string): string {
  return DAY_LABEL.format(new Date(`${date}T00:00:00+09:00`))
}

/** 그 날이 속한 주의 월요일. 달력 날짜 문자열만 다루므로 서버 시간대와 무관하다. */
function weekStart(date: string): string {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay() // 0=일
  return addDays(date, -((dow + 6) % 7))
}

type Bucket = { key: string; label: string; revenue: number }

/**
 * 일별 점을 주·월로 묶는다.
 *
 * 판매가 없던 구간도 자리를 잡아야 하므로 기간 안의 모든 날을 먼저 깔고 묶는다 —
 * 있는 날만 묶으면 판매가 없던 주가 통째로 사라져 추이가 거짓말을 한다.
 * 첫·마지막 통은 기간 경계에 잘린 채로 둔다(그 주의 이틀치만 있으면 이틀치다).
 * 경계를 늘리면 화면 위 기간 문구와 그래프가 다른 범위를 말하게 된다.
 */
function bucketize(points: DailyPoint[], from: string, to: string, grain: Grain): Bucket[] {
  const byDate = new Map(points.map((p) => [p.date, p.revenue]))
  const out: Bucket[] = []
  let cur: Bucket | null = null

  for (const date of eachDay(from, to)) {
    const key =
      grain === 'day' ? date : grain === 'week' ? weekStart(date) : date.slice(0, 7)
    if (!cur || cur.key !== key) {
      const label =
        grain === 'day'
          ? dayLabel(date)
          : grain === 'week'
            ? `${dayLabel(date)}~`
            : MONTH_LABEL.format(new Date(`${date}T00:00:00+09:00`))
      cur = { key, label, revenue: 0 }
      out.push(cur)
    }
    cur.revenue += byDate.get(date) ?? 0
  }
  return out
}

/**
 * 매출 추이 — 일별·주간·월간을 골라 본다.
 *
 * 묶음은 화면에서 한다. 서버에 세 번 묻지 않아도 일별 점만 있으면 나머지는
 * 더하기라, 전환이 즉시 되고 URL 도 안 바뀐다(기간은 URL, 묶음은 화면).
 *
 * 한 계열이라 색은 하나다. 막대마다 길이에 따라 색을 진하게 하는 흔한 처리는
 * 쓰지 않는다 — 길이가 이미 크기를 말하고 있는데 색까지 같은 걸 말하면
 * 유일하게 남은 표현 수단을 낭비하는 셈이다.
 *
 * 판매가 없던 날도 축에 자리를 잡는다. 있는 날만 이어 붙이면 3일 쉰 구간이
 * 하루처럼 붙어서 추이가 거짓말을 한다.
 */
export function DailyChart({
  points,
  from,
  to,
}: {
  points: DailyPoint[]
  from: string
  to: string
}) {
  const [grain, setGrain] = useState<Grain>('day')
  // 마우스를 올린 막대. 브라우저 title 툴팁은 1초 뒤에야 떠서 막대를 훑을 때 쓸모가 없다.
  const [hover, setHover] = useState<string | null>(null)
  const buckets = bucketize(points, from, to, grain)

  const max = buckets.reduce((m, d) => Math.max(m, d.revenue), 0)
  const peak = buckets.find((d) => d.revenue === max && max > 0)
  const first = buckets[0]
  const last = buckets[buckets.length - 1]
  // 막대가 적을 때(주간·월간)는 막대마다 라벨을 달고 폭도 묶는다 — 두 개뿐인 막대가 카드를 반씩
  // 차지하면 그래프가 아니라 판자처럼 보인다. 많을 때는 양 끝만 적는다(일별 30개에 다 적으면 겹친다).
  const few = buckets.length <= 12
  const col = cn('flex min-w-0 flex-1 flex-col', few && 'max-w-24')

  return (
    <Card>
      <CardHeader className="flex-wrap">
        <div className="flex items-center gap-3">
          <CardTitle>매출 추이</CardTitle>
          {/* 값을 막대마다 적지 않고 최고점 하나만 글로 짚는다.
              막대마다 숫자를 붙이면 아무도 읽지 않는 숫자밭이 된다. */}
          {peak ? (
            <span className="text-ink-muted text-xs">
              최고 {peak.label} · {formatWon(max)}
            </span>
          ) : null}
        </div>
        <div role="group" aria-label="묶음 단위" className="flex gap-1">
          {GRAINS.map((g) => {
            const on = grain === g
            return (
              <button
                key={g}
                type="button"
                aria-pressed={on}
                onClick={() => setGrain(g)}
                className={cn(
                  'inline-flex h-8 items-center rounded-lg px-2.5 text-xs font-medium transition-colors',
                  on
                    ? 'bg-ink-strong text-ink-inverted font-semibold'
                    : 'text-ink-muted hover:bg-surface-sunken',
                )}
              >
                {GRAIN_LABEL[g]}
              </button>
            )
          })}
        </div>
      </CardHeader>
      <CardBody>
        {max === 0 ? (
          <p className="text-ink-muted py-6 text-center text-sm">
            이 기간에는 판매가 없습니다.
          </p>
        ) : (
          <figure className="m-0">
            {/* 축 라벨 자리를 컨테이너 높이에 포함시킨다. 그리기 영역만 재면
                라벨이 잘려서 카드 안에 작은 스크롤이 생긴다. */}
            <div
              // 묶음을 바꾸면 막대를 새로 만들어 차오르는 동작이 다시 돈다.
              key={grain}
              className="flex h-36 justify-center gap-[2px]"
              role="img"
              aria-label={`${first.label}부터 ${last.label}까지 ${GRAIN_LABEL[grain]} 매출 막대그래프. 최고 ${formatWon(max)}.`}
            >
              {buckets.map((d, i) => {
                const on = hover === d.key
                // 양 끝 근처의 말풍선은 가운데 정렬하면 카드 밖으로 잘린다. 앞 15% 는 왼쪽에, 뒤 15% 는 오른쪽에 붙인다.
                const edge =
                  i < buckets.length * 0.15
                    ? 'left-0'
                    : i > buckets.length * 0.85
                      ? 'right-0'
                      : 'left-1/2 -translate-x-1/2'
                return (
                  <div
                    key={d.key}
                    className={cn(col, 'relative h-full justify-end')}
                    onPointerEnter={() => setHover(d.key)}
                    onPointerLeave={() => setHover(null)}
                  >
                    {on ? (
                      <div
                        role="tooltip"
                        className={cn(
                          'bg-ink-strong text-ink-inverted pointer-events-none absolute z-10 rounded-md px-2 py-1 text-xs whitespace-nowrap shadow-sm',
                          edge,
                        )}
                        style={{ bottom: `calc(${(d.revenue / max) * 100}% + 6px)` }}
                      >
                        <span className="text-ink-inverted/70 mr-1.5">{d.label}</span>
                        <span className="font-semibold" data-numeric>
                          {formatWon(d.revenue)}
                        </span>
                      </div>
                    ) : null}
                    <div
                      className={cn(
                        'bar-rise w-full rounded-t-[4px] transition-colors',
                        // 같은 계열은 한 색이다. 올린 막대만 한 단 진해지는 건 크기가 아니라 "지금 이거" 를 말하는 것.
                        on ? 'bg-primary-hover' : 'bg-primary',
                      )}
                      style={{ height: `${(d.revenue / max) * 100}%` }}
                    />
                  </div>
                )
              })}
            </div>

            {/* 기준선은 실선 헤어라인. 점선은 "예상치"나 "임계값"으로 읽힌다. */}
            <div className="bg-border-base mt-1 h-px w-full" />

            {few ? (
              // 막대 줄과 같은 열 배치를 반복해 라벨이 제 막대 아래 놓인다.
              <div className="text-ink-subtle mt-1.5 flex justify-center gap-[2px] text-xs">
                {buckets.map((d) => (
                  <span key={d.key} className={cn(col, 'items-center')}>
                    <span className="max-w-full truncate">{d.label}</span>
                  </span>
                ))}
              </div>
            ) : (
              <div className="text-ink-subtle mt-1.5 flex justify-between text-xs">
                <span>{first.label}</span>
                <span>{last.label}</span>
              </div>
            )}
          </figure>
        )}

        {/* 마우스를 올려야만 값을 알 수 있으면 안 된다. 표로도 읽히게 둔다. */}
        {max > 0 ? (
          <details className="mt-3">
            <summary className="text-ink-muted cursor-pointer text-sm">
              숫자로 보기
            </summary>
            <div className="mt-2 max-h-56 overflow-y-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">{GRAIN_LABEL[grain]} 매출 표</caption>
                <thead className="text-ink-muted text-xs">
                  <tr>
                    <th scope="col" className="py-1 text-left font-medium">
                      {grain === 'day' ? '날짜' : grain === 'week' ? '주 (시작일)' : '월'}
                    </th>
                    <th scope="col" className="py-1 text-right font-medium">
                      매출
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {buckets
                    .filter((d) => d.revenue !== 0)
                    .map((d) => (
                      <tr key={d.key} className="border-border-base border-t">
                        <td className="text-ink-muted py-1">{d.label}</td>
                        <td className="text-ink py-1 text-right">
                          {formatWon(d.revenue)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </details>
        ) : null}
      </CardBody>
    </Card>
  )
}
