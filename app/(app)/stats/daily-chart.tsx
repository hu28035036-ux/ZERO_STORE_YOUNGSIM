import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { formatWon, TIME_ZONE } from '@/lib/constants'

import { eachDay } from './period'

export type DailyPoint = { date: string; revenue: number }

const DAY_LABEL = new Intl.DateTimeFormat('ko-KR', {
  timeZone: TIME_ZONE,
  month: 'numeric',
  day: 'numeric',
})

function label(date: string): string {
  return DAY_LABEL.format(new Date(`${date}T00:00:00+09:00`))
}

/**
 * 일별 매출 추이.
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
  const byDate = new Map(points.map((p) => [p.date, p.revenue]))
  const days = eachDay(from, to).map((date) => ({
    date,
    revenue: byDate.get(date) ?? 0,
  }))

  const max = days.reduce((m, d) => Math.max(m, d.revenue), 0)
  const peak = days.find((d) => d.revenue === max && max > 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>일별 매출</CardTitle>
        {/* 값을 막대마다 적지 않고 최고점 하나만 글로 짚는다.
            막대마다 숫자를 붙이면 아무도 읽지 않는 숫자밭이 된다. */}
        {peak ? (
          <span className="text-ink-muted text-xs">
            최고 {label(peak.date)} · {formatWon(max)}
          </span>
        ) : null}
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
            <div className="flex h-36 items-end gap-[2px]" role="img"
              aria-label={`${label(from)}부터 ${label(to)}까지 일별 매출 막대그래프. 최고 ${formatWon(max)}.`}
            >
              {days.map((d) => (
                <div
                  key={d.date}
                  className="flex h-full flex-1 items-end"
                  title={`${label(d.date)} · ${formatWon(d.revenue)}`}
                >
                  <div
                    className="bg-primary w-full rounded-t-[4px]"
                    style={{ height: `${(d.revenue / max) * 100}%` }}
                  />
                </div>
              ))}
            </div>

            {/* 기준선은 실선 헤어라인. 점선은 "예상치"나 "임계값"으로 읽힌다. */}
            <div className="bg-border-base mt-1 h-px w-full" />

            <div className="text-ink-subtle mt-1.5 flex justify-between text-xs">
              <span>{label(from)}</span>
              <span>{label(to)}</span>
            </div>
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
                <caption className="sr-only">일별 매출 표</caption>
                <thead className="text-ink-muted text-xs">
                  <tr>
                    <th scope="col" className="py-1 text-left font-medium">
                      날짜
                    </th>
                    <th scope="col" className="py-1 text-right font-medium">
                      매출
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {days
                    .filter((d) => d.revenue !== 0)
                    .map((d) => (
                      <tr key={d.date} className="border-border-base border-t">
                        <td className="text-ink-muted py-1">{label(d.date)}</td>
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
