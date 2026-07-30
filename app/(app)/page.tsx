import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader, CardTitle, StatTile } from '@/components/ui/card'
import { formatWon, todayInSeoul } from '@/lib/constants'
import { createClient } from '@/lib/supabase/server'

export const metadata = { title: '홈' }

export default async function HomePage() {
  const supabase = await createClient()
  const today = todayInSeoul()

  const [valuation, lowStock, summary, integrity] = await Promise.all([
    supabase.from('v_stock_valuation').select('*').maybeSingle(),
    supabase
      .from('v_low_stock')
      .select('variant_id, product_name, option_label, stock_qty, low_stock_threshold')
      .order('stock_qty')
      .limit(5),
    supabase.rpc('stats_summary', { p_from: today, p_to: today }),
    // 캐시와 원장이 어긋나면 여기 행이 뜬다. 평소에는 0 이어야 정상이라
    // 숫자를 보여주는 대신 문제가 있을 때만 경고를 띄운다.
    supabase.from('v_stock_integrity').select('variant_id'),
  ])

  const stock = valuation.data
  const sales = summary.data?.[0]
  const lowCount = lowStock.data?.length ?? 0
  const driftCount = integrity.data?.length ?? 0

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-ink text-lg font-semibold tracking-tight">오늘</h1>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="오늘 매출"
          value={formatWon(sales?.revenue)}
          hint={`${sales?.order_count ?? 0}건`}
        />
        <StatTile
          label="오늘 마진"
          value={formatWon(sales?.margin)}
          hint={`마진율 ${sales?.margin_rate ?? 0}%`}
          tone={Number(sales?.margin ?? 0) < 0 ? 'loss' : 'profit'}
        />
        <StatTile
          label="재고 자산"
          value={formatWon(stock?.total_cost_value)}
          hint={`${stock?.variant_count ?? 0}개 품목`}
        />
        <StatTile
          label="재고 부족"
          value={`${lowCount}건`}
          hint={lowCount > 0 ? '확인이 필요합니다' : '이상 없음'}
          tone={lowCount > 0 ? 'low' : 'neutral'}
        />
      </div>

      {driftCount > 0 ? (
        <Card className="border-danger/40 bg-danger-soft p-4">
          <p className="text-danger text-sm font-medium">
            재고 수량과 입출고 내역의 합계가 맞지 않는 품목이 {driftCount}개 있습니다.
          </p>
          <p className="text-ink-muted mt-1 text-sm">
            입출고 내역이 정확한 기록입니다. 설정 화면에서 재고를 다시 계산하세요.
          </p>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>재고가 부족한 상품</CardTitle>
          <Link href="/stock" className="text-primary text-sm font-medium">
            전체 보기
          </Link>
        </CardHeader>

        {lowCount === 0 ? (
          <CardBody>
            <p className="text-ink-muted text-sm">
              지금은 부족한 상품이 없습니다.
            </p>
          </CardBody>
        ) : (
          <ul className="divide-border-base divide-y">
            {lowStock.data?.map((row) => (
              <li
                key={row.variant_id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="text-ink truncate text-sm font-medium">
                    {row.product_name}
                  </div>
                  {row.option_label ? (
                    <div className="text-ink-muted truncate text-xs">
                      {row.option_label}
                    </div>
                  ) : null}
                </div>
                <Badge tone={(row.stock_qty ?? 0) < 0 ? 'danger' : 'low'}>
                  {row.stock_qty ?? 0}개 / 기준 {row.low_stock_threshold ?? 0}개
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
