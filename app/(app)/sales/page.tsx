import Link from 'next/link'
import { FileUp, History, PencilLine } from 'lucide-react'

import { Card, StatTile } from '@/components/ui/card'
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
    <div className="flex flex-col gap-4">
      <h1 className="text-ink text-lg font-semibold tracking-tight">판매 기록</h1>

      <div className="grid grid-cols-3 gap-3">
        <StatTile label="오늘 매출" value={formatWon(sales?.revenue)} />
        <StatTile
          label="판매 건수"
          value={`${formatQty(sales?.order_count)}건`}
          hint={`${formatQty(sales?.qty_sold)}점`}
        />
        <StatTile
          label="오늘 마진"
          value={formatWon(sales?.margin)}
          tone={(sales?.margin ?? 0) < 0 ? 'loss' : 'profit'}
        />
      </div>

      {/* 두 갈래. 휴대폰은 적는 손이라 "적기"가 먼저·크게, 파일은 PC 일이라
          안내만 남긴다. PC 는 나란히 둔다 — 어느 쪽이 주 경로인지는 파일이
          쌓이는 방식(포스 정산을 받는지)에 따라 사람마다 다르다. */}
      <div className={device === 'desktop' ? 'grid grid-cols-2 gap-3' : 'flex flex-col gap-3'}>
        <Link href="/sales/new" className="block">
          <Card className="hover:bg-surface-sunken flex items-center gap-4 p-5 transition-colors">
            <span className="bg-primary text-primary-ink flex size-11 shrink-0 items-center justify-center rounded-lg">
              <PencilLine size={22} aria-hidden />
            </span>
            <span className="min-w-0">
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
            <span className="bg-surface-sunken text-ink flex size-11 shrink-0 items-center justify-center rounded-lg">
              <FileUp size={22} aria-hidden />
            </span>
            <span className="min-w-0">
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

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-ink text-sm font-semibold">최근 영수증</h2>
          <Link
            href="/sales/batches"
            className="text-ink-muted hover:text-ink flex items-center gap-1 text-sm"
          >
            <History size={14} aria-hidden />
            임포트 이력·되돌리기
          </Link>
        </div>
        {orders.length === 0 ? (
          <Card className="p-5">
            <p className="text-ink-muted text-sm leading-relaxed">
              아직 기록한 판매가 없습니다. 판매를 적으면 여기에 영수증이 쌓입니다.
            </p>
          </Card>
        ) : (
          <Card className="flex flex-col">
            <ul>
              {orders.map((o) => (
                <li
                  key={o.id}
                  className="border-border-base flex items-baseline justify-between gap-3 border-b px-4 py-3 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="text-ink text-sm font-medium" data-numeric>
                      {formatDateTime(o.occurred_at)}
                      {o.source === 'import' ? (
                        <span className="text-ink-subtle ml-2 text-xs">파일</span>
                      ) : null}
                    </p>
                    {o.memo ? (
                      <p className="text-ink-muted truncate text-xs">{o.memo}</p>
                    ) : null}
                  </div>
                  <p className="shrink-0 text-sm">
                    <span className="text-ink-muted" data-numeric>
                      {formatQty(o.item_count)}점
                    </span>
                    <span className="text-ink ml-2 font-semibold" data-numeric>
                      {formatWon(o.total_revenue)}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  )
}
