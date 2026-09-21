import Link from 'next/link'
import {
  BarChart3,
  ChevronRight,
  FileUp,
  History,
  PencilLine,
  ReceiptText,
  ShoppingBag,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, StatTile } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { formatDateTime, formatQty, formatWon, todayInSeoul } from '@/lib/constants'
import { getDevice } from '@/lib/server-device'
import { createClient } from '@/lib/supabase/server'

export const metadata = { title: '판매 기록' }

/**
 * 판매 기록 홈.
 *
 * 이 앱의 판매는 계산대가 아니라 "이미 일어난 판매를 재고에 반영하는 일"이다.
 * 그래서 첫 화면이 입력이 아니라 요약과 갈래다 — 오늘 얼마나 반영됐는지 보고,
 * 적으러 들어간다.
 */
export default async function SalesPage() {
  const supabase = await createClient()
  const today = todayInSeoul()

  const [device, todaySales, recent] = await Promise.all([
    getDevice(),
    // v_daily_sales 는 KST 로 날짜를 자른다. 여기서도 KST 오늘을 그대로 넘긴다.
    supabase.from('v_daily_sales').select('*').eq('sale_date', today).maybeSingle(),
    supabase
      .from('sale_orders')
      .select('id, occurred_at, item_count, total_revenue, memo, source')
      .order('occurred_at', { ascending: false })
      .limit(10),
  ])

  const sales = todaySales.data
  const orders = recent.data ?? []

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="SALES RECORDS"
        title="판매 기록"
        description="이미 판매한 내역을 기록하고 확인하세요."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatTile label="오늘 매출" value={formatWon(sales?.revenue)} icon={ReceiptText} />
        <StatTile
          label="판매 건수"
          value={`${formatQty(sales?.order_count)}건`}
          hint={`${formatQty(sales?.qty_sold)}점`}
          icon={ShoppingBag}
        />
        <StatTile
          label="오늘 마진"
          value={formatWon(sales?.margin)}
          tone={(sales?.margin ?? 0) < 0 ? 'loss' : 'profit'}
          icon={BarChart3}
        />
      </div>

      {/* 두 갈래. 휴대폰은 적는 손이라 "적기"가 먼저·크게, 파일은 PC 일이라
          안내만 남긴다. PC 는 나란히 둔다 — 어느 쪽이 주 경로인지는 파일이
          쌓이는 방식(포스 정산을 받는지)에 따라 사람마다 다르다. */}
      <div className={device === 'desktop' ? 'grid grid-cols-2 gap-4' : 'flex flex-col gap-3'}>
        <Link href="/sales/new" className="block">
          <Card className="hover:bg-surface-sunken flex items-center gap-4 p-5 transition-colors">
            <span className="bg-primary text-primary-ink flex size-11 shrink-0 items-center justify-center rounded-xl">
              <PencilLine size={22} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-ink block text-[0.9375rem] font-semibold">
                판매 적기
              </span>
              <span className="text-ink-muted block text-sm">
                바코드를 찍거나 상품명으로 담아서 기록합니다
              </span>
            </span>
          </Card>
        </Link>
        <Link href="/sales/import" className="block">
          <Card className="hover:bg-surface-sunken flex items-center gap-4 p-5 transition-colors">
            <span className="bg-surface-sunken text-ink flex size-11 shrink-0 items-center justify-center rounded-xl">
              <FileUp size={22} aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="text-ink block text-[0.9375rem] font-semibold">
                판매기록 파일 올리기
              </span>
              <span className="text-ink-muted block text-sm">
                {device === 'mobile'
                  ? '엑셀·CSV 일괄 반영 — PC 에서 하는 게 편합니다'
                  : '엑셀·CSV 를 올려 한 번에 반영합니다'}
              </span>
            </span>
          </Card>
        </Link>
      </div>

      <Card>
        <div className="border-border-base flex items-center justify-between gap-3 border-b px-5 py-4">
          <h2 className="text-ink text-base font-semibold">최근 영수증</h2>
          <Link
            href="/sales/batches"
            className="text-ink-muted hover:text-ink flex items-center gap-1 text-sm"
          >
            <History size={14} aria-hidden />
            임포트 이력·되돌리기
          </Link>
        </div>
        {orders.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm">
            <p className="text-ink-muted">
              아직 기록한 판매가 없습니다. 판매를 적으면 여기에 영수증이 쌓입니다.
            </p>
          </div>
        ) : (
          <ul>
            {orders.map((o) => {
              const d = new Date(o.occurred_at)
              const mm = String(d.getMonth() + 1).padStart(2, '0')
              const dd = String(d.getDate()).padStart(2, '0')
              return (
                <li key={o.id} className="border-border-base border-b last:border-0">
                  {/* 날짜(줄 전체)를 누르면 그 영수증에 담긴 상품이 보인다.
                      기록만 쌓이고 열어볼 수 없던 것이 사용자 리포트였다. */}
                  <Link
                    href={`/sales/${o.id}`}
                    className="hover:bg-surface-sunken flex items-center gap-3 px-5 py-4 transition-colors"
                  >
                    <span className="text-primary w-10 shrink-0 text-sm font-semibold" data-numeric>
                      {mm}/{dd}
                    </span>
                    <Badge tone="neutral">{o.source === 'import' ? '파일' : '직접'}</Badge>
                    <div className="min-w-0 flex-1">
                      <p className="text-ink truncate text-sm font-medium">
                        {o.memo || '판매'}
                        {o.item_count === 0 ? (
                          <span className="text-ink-subtle ml-2 text-xs">되돌림</span>
                        ) : null}
                      </p>
                      <p className="text-ink-muted text-xs" data-numeric>
                        {formatDateTime(o.occurred_at).split(' ').slice(-1)[0]} · {formatQty(o.item_count)}점
                      </p>
                    </div>
                    <span className="text-ink shrink-0 text-sm font-semibold" data-numeric>
                      {formatWon(o.total_revenue)}
                    </span>
                    <ChevronRight size={16} aria-hidden className="text-ink-subtle shrink-0" />
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
