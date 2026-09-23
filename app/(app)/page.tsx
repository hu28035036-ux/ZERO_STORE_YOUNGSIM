import Link from 'next/link'
import {
  Boxes,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  ReceiptText,
  TriangleAlert,
} from 'lucide-react'

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
import { CountUp } from '@/components/ui/count-up'
import { PageHeader } from '@/components/ui/page-header'
import { formatQty, formatWon, todayInSeoul } from '@/lib/constants'
import { createClient } from '@/lib/supabase/server'

import { addDays, presetRange } from './stats/period'
import { TopSellersCard } from './top-sellers-card'

export const metadata = { title: '홈' }

/** 부족 목록에 펼쳐 보여줄 상품 수. 건수·수량 합계는 이 상한과 무관하게 전체를 센다. */
const LOW_LIST = 5

/** 홈 아래쪽 바로가기 세 개. 수량 확인은 재고 화면에서, 나머지는 여기서 갈아탄다. */
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
  const yesterday = addDays(today, -1)
  // 원그래프·순위는 이번 달(1일~오늘). 사용자가 "매달" 단위로 본다고 해서 최근 30일에서
  // 바꿨다 — 달 초에는 며칠치만 보이지만, 통계 화면의 '이번 달' 프리셋과 숫자가 같아진다.
  const month = presetRange('month', today)
  const topRange = { p_from: month.from, p_to: month.to }
  const monthLabel = `${Number(today.slice(5, 7))}월`

  const [valuation, lowStock, todaySummary, yesterdaySummary, byCategory, top, integrity] =
    await Promise.all([
      supabase.from('v_stock_valuation').select('*').maybeSingle(),
      // limit 을 걸지 않는다 — 5개만 받으면 "재고 부족 5건" 이 상한에 걸린 숫자인지
      // 정말 5건인지 구분이 안 되고, 부족 수량 합계도 낼 수 없다. 부족 목록은
      // 전체 품목의 작은 부분집합이라 다 받아도 가볍다.
      supabase
        .from('v_low_stock')
        .select('variant_id, product_name, option_label, stock_qty, low_stock_threshold, unit')
        .order('stock_qty'),
      supabase.rpc('stats_summary', { p_from: today, p_to: today }),
      supabase.rpc('stats_summary', { p_from: yesterday, p_to: yesterday }),
      supabase.rpc('stats_by_category', topRange),
      // 함수는 매출 순으로 잘라 주는데 순위 목록은 수량 순이다. 값싼 상품이 매출 순위
      // 밖으로 밀려 수량 순위에서 빠지지 않도록 상한을 상품 수보다 넉넉히 준다.
      supabase.rpc('stats_top_products', { ...topRange, p_limit: 1000 }),
      // 캐시와 원장이 어긋나면 여기 행이 뜬다. 평소에는 0 이어야 정상이라
      // 숫자를 보여주는 대신 문제가 있을 때만 경고를 띄운다.
      supabase.from('v_stock_integrity').select('variant_id'),
    ])

  const stock = valuation.data
  const todaySales = todaySummary.data?.[0]
  const yesterdaySales = yesterdaySummary.data?.[0]
  const lowRows = lowStock.data ?? []
  const lowCount = lowRows.length
  // 채워 넣어야 할 개수. 기준선까지 얼마나 모자라는지가 발주 수량의 출발점이다.
  const shortage = (row: { stock_qty: number | null; low_stock_threshold: number | null }) =>
    Math.max(0, (row.low_stock_threshold ?? 0) - (row.stock_qty ?? 0))
  const shortageTotal = lowRows.reduce((s, r) => s + shortage(r), 0)
  const driftCount = integrity.data?.length ?? 0

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="STORE OVERVIEW"
        title="오늘의 매장"
        description="어제 매출, 잘 팔리는 상품, 채워야 할 재고를 한눈에."
        actions={
          <Link href="/stock" className={buttonClass('black')}>
            재고 보기
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="어제 매출"
          value={<CountUp value={Number(yesterdaySales?.revenue ?? 0)} format="won" />}
          hint={`${yesterdaySales?.order_count ?? 0}건 · 마진 ${formatWon(yesterdaySales?.margin)}`}
          icon={CalendarDays}
        />
        <StatTile
          label="오늘 매출"
          value={<CountUp value={Number(todaySales?.revenue ?? 0)} format="won" />}
          hint={`${todaySales?.order_count ?? 0}건 · 마진 ${formatWon(todaySales?.margin)}`}
          icon={ReceiptText}
        />
        <StatTile
          label="재고 부족"
          value={<CountUp value={lowCount} format="qty" suffix="건" />}
          hint={
            lowCount > 0
              ? `기준까지 ${formatQty(shortageTotal)}개 모자람`
              : '이상 없음'
          }
          tone={lowCount > 0 ? 'low' : 'neutral'}
          icon={TriangleAlert}
        />
        <StatTile
          label="재고 자산"
          value={<CountUp value={Number(stock?.total_cost_value ?? 0)} format="won" />}
          hint={`${stock?.variant_count ?? 0}개 품목`}
          icon={Boxes}
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,1fr)]">
        <TopSellersCard
          categories={byCategory.data ?? []}
          products={top.data ?? []}
          from={month.from}
          to={month.to}
          dayLabel={monthLabel}
        />

        <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>재고가 부족한 상품</CardTitle>
              <CardDescription>
                {lowCount > LOW_LIST
                  ? `가장 적은 ${LOW_LIST}개만 보여줍니다. 전체 ${lowCount}건`
                  : '먼저 확인할 상품을 모아두었어요.'}
              </CardDescription>
            </div>
            <Link href="/stock?filter=low" className="text-primary shrink-0 text-sm font-medium">
              전체 보기
            </Link>
          </CardHeader>

          {lowCount === 0 ? (
            <CardBody>
              <p className="text-ink-muted text-sm">지금은 부족한 상품이 없습니다.</p>
            </CardBody>
          ) : (
            <ul className="divide-border-base divide-y">
              {lowRows.slice(0, LOW_LIST).map((row) => {
                const unit = row.unit || '개'
                const need = shortage(row)
                return (
                  <li
                    key={row.variant_id}
                    className="flex items-center justify-between gap-3 px-5 py-4"
                  >
                    <div className="min-w-0">
                      <div className="text-ink truncate text-sm font-semibold">
                        {row.product_name}
                      </div>
                      <div className="text-ink-subtle truncate text-xs">
                        {row.option_label ? `${row.option_label} · ` : ''}
                        기준 {row.low_stock_threshold ?? 0}
                        {unit}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {/* 현재 수량 옆에 모자라는 개수를 같이 둔다. "3개 남음" 만으로는
                          몇 개를 들여와야 하는지 한 번 더 계산해야 한다. */}
                      <span className="text-low text-xs font-medium">
                        {need > 0 ? `${formatQty(need)}${unit} 부족` : '기준 도달'}
                      </span>
                      <Badge tone={(row.stock_qty ?? 0) < 0 ? 'danger' : 'low'}>
                        남은 {formatQty(row.stock_qty)}
                        {unit}
                      </Badge>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

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
        </div>
      </div>
    </div>
  )
}
