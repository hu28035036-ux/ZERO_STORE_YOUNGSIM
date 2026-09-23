import Link from 'next/link'

import { Card, CardBody, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CountUp } from '@/components/ui/count-up'
import { formatQty } from '@/lib/constants'

import type { CategoryStat, TopProduct } from './stats/stats-tables'

/** 조각으로 따로 그릴 분류 수. 그 아래는 "그 밖"으로 묶는다. */
const SLICES = 5
/** 순위 목록에 보여줄 상품 수. */
const RANKS = 10

// 조각 색은 토큰만 쓴다(globals.css 의 --chart-*). 여기서 hex 를 고르면 다크 모드가 깨진다.
// 한 계열 막대는 primary 하나지만, 원그래프는 조각마다 다른 것을 가리켜야 하므로
// 범주형 팔레트가 맞다 — 이 화면만의 예외가 아니라 차트 종류의 차이다.
const SLICE_CLASS = [
  'text-chart-1',
  'text-chart-2',
  'text-chart-3',
  'text-chart-4',
  'text-chart-5',
] as const
const REST_CLASS = 'text-chart-rest'

// 도넛의 기하. 반지름을 viewBox 의 절반보다 작게 두어 선 두께가 잘리지 않게 한다.
const SIZE = 160
const STROKE = 26
const R = (SIZE - STROKE) / 2
const C = 2 * Math.PI * R

type Slice = {
  key: string
  name: string
  qty: number
  /** 0~100. 소수 첫째 자리까지. */
  share: number
  colorClass: string
}

function pct(part: number, total: number): number {
  return Math.round((part / total) * 1000) / 10
}

function toSlices(rows: CategoryStat[]): { slices: Slice[]; total: number } {
  const sorted = rows
    .map((r) => ({
      key: r.category_id ? String(r.category_id) : 'none',
      name: r.category_name ?? '미분류',
      qty: Number(r.qty_sold ?? 0),
    }))
    .filter((r) => r.qty > 0)
    .sort((a, b) => b.qty - a.qty)

  const total = sorted.reduce((s, r) => s + r.qty, 0)
  if (total === 0) return { slices: [], total: 0 }

  const head = sorted.slice(0, SLICES)
  const restQty = total - head.reduce((s, r) => s + r.qty, 0)

  const slices: Slice[] = head.map((r, i) => ({
    ...r,
    share: pct(r.qty, total),
    colorClass: SLICE_CLASS[i],
  }))

  if (restQty > 0) {
    slices.push({
      key: 'rest',
      name: `그 밖 ${formatQty(sorted.length - head.length)}개 분류`,
      qty: restQty,
      share: pct(restQty, total),
      colorClass: REST_CLASS,
    })
  }

  return { slices, total }
}

/**
 * 잘 팔리는 것 — 분류별 원그래프 + 상품 순위.
 *
 * 둘 다 매출이 아니라 **수량** 기준이다. 주인이 "뭐가 많이 나가나"를 물을 때 답이
 * 되는 건 금액이 아니라 개수다 — 비싼 것 하나가 싼 것 열 개를 이기면 발주 판단이
 * 어긋난다. 금액 순위는 통계 화면이 맡는다.
 *
 * 원그래프를 상품이 아니라 분류로 그리는 이유: 이 가게는 상품 400여 종이 고르게
 * 팔려서 1위 상품도 전체의 4% 가 안 된다. 상품으로 그리면 "그 밖" 한 조각이 90% 를
 * 먹어 그림이 회색 원이 된다(실제로 그렇게 나왔다). 분류는 열 개 남짓이라 조각이
 * 읽힌다. 상품은 옆에 순위 목록으로 둔다.
 *
 * 값은 조각 안이 아니라 범례에 적는다. 색만으로 무엇인지 말하지 않는다는 규칙
 * 그대로다 — 범례에 이름·수량·비중이 전부 있어 그래프 없이도 읽힌다.
 */
export function TopSellersCard({
  categories,
  products,
  from,
  to,
  dayLabel,
}: {
  categories: CategoryStat[]
  products: TopProduct[]
  from: string
  to: string
  /** 카드 설명에 들어갈 기간 이름. "9월" 처럼. */
  dayLabel: string
}) {
  const { slices, total } = toSlices(categories)

  // stroke-dasharray 로 그리는 도넛. path 계산보다 단순하고, 조각이 하나뿐일 때
  // (100%) 도 arc 의 시작·끝이 겹치는 문제 없이 온전한 원이 된다.
  const arcs = slices.reduce<Array<Slice & { len: number; offset: number }>>((acc, s) => {
    const prev = acc[acc.length - 1]
    const offset = prev ? prev.offset + prev.len : 0
    acc.push({ ...s, len: (s.qty / total) * C, offset })
    return acc
  }, [])

  // 함수는 매출 순으로 돌려주므로 수량 순은 여기서 다시 세운다.
  const ranked = products
    .map((r) => ({
      key: String(r.variant_id),
      name: r.product_name ?? '(이름 없음)',
      detail: r.option_label || null,
      qty: Number(r.qty_sold ?? 0),
    }))
    .filter((r) => r.qty > 0)
    .sort((a, b) => b.qty - a.qty)
    .slice(0, RANKS)
  const maxQty = ranked[0]?.qty ?? 0

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>잘 팔리는 것</CardTitle>
          <CardDescription>{dayLabel} 판매 수량 기준 · 모두 {formatQty(total)}개</CardDescription>
        </div>
        <Link
          href={`/stats?from=${from}&to=${to}`}
          className="text-primary shrink-0 text-sm font-medium"
        >
          통계 보기
        </Link>
      </CardHeader>

      {slices.length === 0 ? (
        <CardBody>
          <p className="text-ink-muted py-6 text-center text-sm">
            {dayLabel} 동안 판매 기록이 없습니다.
          </p>
        </CardBody>
      ) : (
        <>
          <CardBody>
            <h3 className="text-ink-muted mb-4 text-xs font-medium">분류별 비중</h3>
            <figure className="m-0 flex flex-col items-center gap-5 sm:flex-row sm:items-center">
              <svg
                viewBox={`0 0 ${SIZE} ${SIZE}`}
                className="h-40 w-40 shrink-0"
                role="img"
                aria-label={`${dayLabel} 분류별 판매 수량 원그래프. ${slices
                  .map((s) => `${s.name} ${s.share}%`)
                  .join(', ')}.`}
              >
                <defs>
                  {/* 마스크의 선이 차오르면서 아래 조각들이 순서대로 드러난다. 조각 두께보다 조금
                      두껍게 그려 가장자리 안티에일리어싱이 잘리지 않게 한다. */}
                  <mask id="donut-reveal" maskUnits="userSpaceOnUse">
                    <circle
                      cx={SIZE / 2}
                      cy={SIZE / 2}
                      r={R}
                      fill="none"
                      stroke="#fff"
                      strokeWidth={STROKE + 2}
                      strokeDasharray={C}
                      strokeDashoffset={C}
                      transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
                      className="donut-reveal"
                    />
                  </mask>
                </defs>
                {/* 12시 방향에서 시계 방향으로 시작하도록 -90도 돌린다. */}
                <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`} mask="url(#donut-reveal)">
                  {arcs.map((a) => (
                    <circle
                      key={a.key}
                      cx={SIZE / 2}
                      cy={SIZE / 2}
                      r={R}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={STROKE}
                      strokeDasharray={`${a.len} ${C - a.len}`}
                      strokeDashoffset={-a.offset}
                      className={a.colorClass}
                    />
                  ))}
                </g>
                <text
                  x="50%"
                  y="46%"
                  textAnchor="middle"
                  className="fill-ink text-[22px] font-semibold"
                >
                  <CountUp value={total} format="qty" />
                </text>
                <text
                  x="50%"
                  y="60%"
                  textAnchor="middle"
                  className="fill-ink-muted text-[11px]"
                >
                  개 판매
                </text>
              </svg>

              <figcaption className="min-w-0 flex-1 self-stretch">
                <ol className="divide-border-base divide-y">
                  {slices.map((s) => (
                    <li key={s.key} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                      <span
                        aria-hidden
                        className={`${s.colorClass} h-2.5 w-2.5 shrink-0 rounded-full bg-current`}
                      />
                      <span className="text-ink min-w-0 flex-1 truncate text-sm font-medium">
                        {s.name}
                      </span>
                      <span className="shrink-0 text-right" data-numeric>
                        <span className="text-ink text-sm font-semibold">
                          <CountUp value={s.share} format="percent" suffix="%" />
                        </span>
                        <span className="text-ink-subtle ml-2 text-xs">
                          <CountUp value={s.qty} format="qty" suffix="개" />
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              </figcaption>
            </figure>
          </CardBody>

          <div className="border-border-base border-t px-5 pt-4 pb-2">
            <h3 className="text-ink-muted text-xs font-medium">많이 팔린 상품 {RANKS}</h3>
          </div>
          {/* 한 계열이라 막대 색은 하나다. 순위는 숫자로 이미 말하고 있다. */}
          <ol className="divide-border-base divide-y">
            {ranked.map((r, i) => (
              <li key={r.key} className="flex items-center gap-3 px-5 py-2.5">
                <span
                  className="text-ink-subtle w-5 shrink-0 text-right text-xs font-medium"
                  data-numeric
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-ink block truncate text-sm">
                    {r.name}
                    {r.detail ? (
                      <span className="text-ink-subtle ml-1 text-xs">{r.detail}</span>
                    ) : null}
                  </span>
                  <span className="bg-surface-sunken mt-1 block h-1.5 w-full overflow-hidden rounded-[3px]">
                    <span
                      className="bg-primary block h-full rounded-[3px]"
                      style={{ width: `${maxQty > 0 ? (r.qty / maxQty) * 100 : 0}%` }}
                    />
                  </span>
                </span>
                <span className="text-ink w-16 shrink-0 text-right text-sm font-semibold" data-numeric>
                  <CountUp value={r.qty} format="qty" suffix="개" />
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </Card>
  )
}
