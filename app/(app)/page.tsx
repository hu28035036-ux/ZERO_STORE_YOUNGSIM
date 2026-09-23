import Link from 'next/link'
import { BarChart3, Boxes, ChevronRight, ClipboardList, ReceiptText, TriangleAlert } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { buttonClass } from '@/components/ui/button'
import {
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
  StatTile,
} from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { formatWon, todayInSeoul } from '@/lib/constants'
import { createClient } from '@/lib/supabase/server'

export const metadata = { title: '홈' }

/** 홈 오른쪽 카드의 바로가기 세 개. 재고 화면에서 수량을 보고, 나머지는 여기서 갈아탄다. */
const SHORTCUTS = [
  {
    href: '/movements',
    icon: ClipboardList,
    title: '입출고 등록',
    subtitle: '입고·출고·실사 화면으로 이동',
  },
  {
    href: '/sales',
    icon: ReceiptText,
    title: '판매 기록',
    subtitle: '직접 적거나 파일로 반영',
  },
  {
    href: '/stock',
    icon: Boxes,
    title: '상품 관리',
    subtitle: '상품 확인과 파일 등록',
  },
] as const

export default async function HomePage() {
  const supabase = await createClient()
  const today = todayInSeoul()

  const [valuation, lowStock, summary, integrity] = await Promise.all([
    supabase.from('v_stock_valuation').select('*').maybeSingle(),
    supabase
      .from('v_low_stock')
      .select('variant_id, product_name, option_label, stock_qty, low_stock_threshold, unit')
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
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="STORE OVERVIEW"
        title="오늘의 매장"
        description="재고와 판매 현황을 한눈에 확인하세요."
        actions={
          <Link href="/stock" className={buttonClass('black')}>
            재고 보기
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="오늘 매출"
          value={formatWon(sales?.revenue)}
          hint={`${sales?.order_count ?? 0}건`}
          icon={ReceiptText}
        />
        <StatTile
          label="오늘 마진"
          value={formatWon(sales?.margin)}
          hint={`마진율 ${sales?.margin_rate ?? 0}%`}
          tone={Number(sales?.margin ?? 0) < 0 ? 'loss' : 'profit'}
          icon={BarChart3}
        />
        <StatTile
          label="재고 자산"
          value={formatWon(stock?.total_cost_value)}
          hint={`${stock?.variant_count ?? 0}개 품목`}
          icon={Boxes}
        />
        <StatTile
          label="재고 부족"
          value={`${lowCount}건`}
          hint={lowCount > 0 ? '확인이 필요합니다' : '이상 없음'}
          tone={lowCount > 0 ? 'low' : 'neutral'}
          icon={TriangleAlert}
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.75fr)_minmax(16rem,1fr)]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>재고가 부족한 상품</CardTitle>
              <CardDescription>먼저 확인할 상품을 모아두었어요.</CardDescription>
            </div>
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
                  className="flex items-center justify-between gap-3 px-5 py-4"
                >
                  <div className="min-w-0">
                    <div className="text-ink truncate text-sm font-semibold">
                      {row.product_name}
                    </div>
                    {row.option_label ? (
                      <div className="text-ink-subtle truncate text-xs">
                        {row.option_label}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-ink-subtle text-xs">
                      기준 {row.low_stock_threshold ?? 0}
                      {row.unit || '개'}
                    </span>
                    <Badge tone={(row.stock_qty ?? 0) < 0 ? 'danger' : 'low'}>
                      {row.stock_qty ?? 0}
                      {row.unit || '개'}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>자주 하는 작업</CardTitle>
            </CardHeader>
            <ul>
              {SHORTCUTS.map((s) => (
                <li key={s.href} className="border-border-base border-b last:border-0">
                  <Link
                    href={s.href}
                    className="hover:bg-surface-sunken flex items-center gap-3 px-5 py-4 transition-colors"
                  >
                    <span className="border-border-base text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border">
                      <s.icon size={18} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="text-ink block text-sm font-semibold">{s.title}</span>
                      <span className="text-ink-muted block text-xs">{s.subtitle}</span>
                    </span>
                    <ChevronRight size={18} aria-hidden className="text-ink-subtle shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          <div className="bg-primary-soft text-primary rounded-xl px-5 py-4 text-sm">
            <strong className="block">수량 확인은 재고에서</strong>
            판매 기록과 입출고는 기존 메뉴에서 그대로 관리합니다.
          </div>
        </div>
      </div>
    </div>
  )
}
