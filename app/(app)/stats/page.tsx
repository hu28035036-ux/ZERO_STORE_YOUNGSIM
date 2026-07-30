import { ArrowDown, ArrowUp, Minus } from 'lucide-react'

import { Card, StatTile } from '@/components/ui/card'
import { cn } from '@/lib/cn'
import { formatQty, formatWon } from '@/lib/constants'
import { createClient } from '@/lib/supabase/server'

import { DailyChart } from './daily-chart'
import { changeRate, dayCount, parsePeriod, previousPeriod } from './period'
import { PeriodPicker } from './period-picker'
import {
  CategoryTable,
  SupplierTable,
  TopProductsTable,
  TurnoverTable,
} from './stats-tables'

export const metadata = { title: '통계' }

const TOP_LIMIT = 10

/**
 * 직전 기간 대비 증감.
 *
 * 화살표와 글자를 같이 쓴다. 색만으로 오르내림을 말하면 적록색약인 사람에게는
 * 아무 정보도 아니다.
 */
function Delta({ current, previous }: { current: number; previous: number }) {
  const rate = changeRate(current, previous)

  if (rate === null) {
    return <span className="text-ink-subtle">직전 기간에 견줄 값 없음</span>
  }

  const Icon = rate > 0 ? ArrowUp : rate < 0 ? ArrowDown : Minus
  const tone = rate > 0 ? 'text-profit' : rate < 0 ? 'text-loss' : 'text-ink-subtle'

  return (
    <span className={cn('inline-flex items-center gap-0.5', tone)}>
      <Icon size={12} aria-hidden />
      {Math.abs(rate).toFixed(1)}%
      <span className="text-ink-subtle">&nbsp;직전 대비</span>
    </span>
  )
}

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const period = parsePeriod(await searchParams)
  const prev = previousPeriod(period)
  const range = { p_from: period.from, p_to: period.to }

  const supabase = await createClient()

  const [summary, prevSummary, top, byCategory, bySupplier, turnover, daily] =
    await Promise.all([
      supabase.rpc('stats_summary', range),
      supabase.rpc('stats_summary', { p_from: prev.from, p_to: prev.to }),
      supabase.rpc('stats_top_products', { ...range, p_limit: TOP_LIMIT }),
      supabase.rpc('stats_by_category', range),
      supabase.rpc('stats_by_supplier', range),
      supabase.rpc('stats_turnover', range),
      supabase
        .from('v_daily_sales')
        .select('sale_date, revenue')
        .gte('sale_date', period.from)
        .lte('sale_date', period.to),
    ])

  // 집계 함수는 한 행짜리 표를 돌려준다.
  const now = summary.data?.[0]
  const before = prevSummary.data?.[0]
  const error = summary.error ?? top.error ?? byCategory.error

  const revenue = Number(now?.revenue ?? 0)
  const margin = Number(now?.margin ?? 0)
  const orders = Number(now?.order_count ?? 0)
  const days = dayCount(period.from, period.to)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h1 className="text-ink text-lg font-semibold tracking-tight">통계</h1>
        <p className="text-ink-muted text-sm">
          {period.from} – {period.to} ({days}일)
        </p>
      </div>

      {/* 필터는 한 줄로 맨 위에 둔다. 아래 모든 숫자가 이 기간 하나를 본다.
          카드마다 제 기간을 갖게 하면 나란한 두 숫자가 서로 다른 기간이 된다. */}
      <PeriodPicker period={period} />

      {error ? (
        <Card className="p-5">
          <p className="text-danger text-sm font-medium">통계를 불러오지 못했습니다.</p>
          <p className="text-ink-muted mt-1.5 text-sm">{error.message}</p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label="매출"
              value={formatWon(revenue)}
              hint={<Delta current={revenue} previous={Number(before?.revenue ?? 0)} />}
            />
            <StatTile
              label="마진"
              value={formatWon(margin)}
              tone={margin < 0 ? 'loss' : 'profit'}
              hint={`마진율 ${now?.margin_rate ?? 0}%`}
            />
            <StatTile
              label="판매 건수"
              value={`${formatQty(orders)}건`}
              hint={`${formatQty(Number(now?.qty_sold ?? 0))}점`}
            />
            <StatTile
              label="객단가"
              value={formatWon(now?.avg_order_value)}
              hint={
                <Delta
                  current={Number(now?.avg_order_value ?? 0)}
                  previous={Number(before?.avg_order_value ?? 0)}
                />
              }
            />
          </div>

          <DailyChart
            points={(daily.data ?? []).map((d) => ({
              date: String(d.sale_date),
              revenue: Number(d.revenue ?? 0),
            }))}
            from={period.from}
            to={period.to}
          />

          <TopProductsTable rows={top.data ?? []} />
          <CategoryTable rows={byCategory.data ?? []} />
          <SupplierTable rows={bySupplier.data ?? []} />
          <TurnoverTable rows={turnover.data ?? []} />
        </>
      )}
    </div>
  )
}
