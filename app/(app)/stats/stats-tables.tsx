import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/cn'
import type { Database } from '@/lib/database.types'
import { formatQty, formatWon } from '@/lib/constants'

type Fn = Database['public']['Functions']
export type TopProduct = Fn['stats_top_products']['Returns'][number]
export type CategoryStat = Fn['stats_by_category']['Returns'][number]
export type SupplierStat = Fn['stats_by_supplier']['Returns'][number]
export type TurnoverStat = Fn['stats_turnover']['Returns'][number]

/**
 * 값 크기를 나타내는 가로 막대.
 *
 * 막대 안에 글자를 넣지 않는다. 짧은 막대에 글자가 들어가면 잘리고, 잘린 글자는
 * 없는 것만 못하다. 숫자는 옆 칸에 그대로 있다.
 */
function Bar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max(0, (value / max) * 100) : 0
  return (
    <div className="bg-surface-sunken h-2 w-full overflow-hidden rounded-[4px]">
      <div className="bg-primary h-full rounded-[4px]" style={{ width: `${pct}%` }} />
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="text-ink-muted py-6 text-center text-sm">{text}</p>
}

const TH = 'px-3 py-2 font-medium'
const TD = 'px-3 py-2.5'

export function TopProductsTable({ rows }: { rows: TopProduct[] }) {
  const max = rows.reduce((m, r) => Math.max(m, Number(r.revenue ?? 0)), 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>많이 팔린 상품</CardTitle>
        <span className="text-ink-muted text-xs">매출순</span>
      </CardHeader>
      <CardBody className="p-0">
        {rows.length === 0 ? (
          <Empty text="이 기간에는 판매가 없습니다." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[38rem] text-sm">
              <thead className="border-border-base text-ink-muted border-b text-xs">
                <tr>
                  <th scope="col" className={cn(TH, 'text-left')}>
                    상품
                  </th>
                  <th scope="col" className={cn(TH, 'w-28 text-left')}>
                    <span className="sr-only">매출 비중</span>
                  </th>
                  <th scope="col" className={cn(TH, 'text-right')}>
                    수량
                  </th>
                  <th scope="col" className={cn(TH, 'text-right')}>
                    매출
                  </th>
                  <th scope="col" className={cn(TH, 'text-right')}>
                    마진
                  </th>
                  <th scope="col" className={cn(TH, 'text-right')}>
                    마진율
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.variant_id} className="border-border-base border-b last:border-0">
                    <td className={TD}>
                      <span className="text-ink font-medium">{r.product_name}</span>
                      {r.option_label ? (
                        <span className="text-ink-muted"> · {r.option_label}</span>
                      ) : null}
                    </td>
                    <td className={TD}>
                      <Bar value={Number(r.revenue ?? 0)} max={max} />
                    </td>
                    <td className={cn(TD, 'text-ink-muted text-right')}>
                      {formatQty(Number(r.qty_sold ?? 0))}
                    </td>
                    <td className={cn(TD, 'text-ink text-right')}>
                      {formatWon(r.revenue)}
                    </td>
                    <td
                      className={cn(
                        TD,
                        'text-right',
                        Number(r.margin ?? 0) < 0 ? 'text-loss font-medium' : 'text-ink-muted',
                      )}
                    >
                      {formatWon(r.margin)}
                    </td>
                    <td className={cn(TD, 'text-ink-muted text-right')}>
                      {r.margin_rate}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  )
}

export function CategoryTable({ rows }: { rows: CategoryStat[] }) {
  const max = rows.reduce((m, r) => Math.max(m, Number(r.revenue ?? 0)), 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>카테고리별</CardTitle>
      </CardHeader>
      <CardBody className="p-0">
        {rows.length === 0 ? (
          <Empty text="이 기간에는 판매가 없습니다." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead className="border-border-base text-ink-muted border-b text-xs">
                <tr>
                  <th scope="col" className={cn(TH, 'text-left')}>
                    카테고리
                  </th>
                  <th scope="col" className={cn(TH, 'w-28 text-left')}>
                    <span className="sr-only">매출 비중</span>
                  </th>
                  <th scope="col" className={cn(TH, 'text-right')}>
                    비중
                  </th>
                  <th scope="col" className={cn(TH, 'text-right')}>
                    매출
                  </th>
                  <th scope="col" className={cn(TH, 'text-right')}>
                    마진율
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.category_id ?? 'none'}
                    className="border-border-base border-b last:border-0"
                  >
                    <td className={cn(TD, 'text-ink font-medium')}>{r.category_name}</td>
                    <td className={TD}>
                      <Bar value={Number(r.revenue ?? 0)} max={max} />
                    </td>
                    <td className={cn(TD, 'text-ink-muted text-right')}>
                      {r.revenue_share}%
                    </td>
                    <td className={cn(TD, 'text-ink text-right')}>{formatWon(r.revenue)}</td>
                    <td className={cn(TD, 'text-ink-muted text-right')}>
                      {r.margin_rate}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  )
}

export function SupplierTable({ rows }: { rows: SupplierStat[] }) {
  const max = rows.reduce((m, r) => Math.max(m, Number(r.purchase_amount ?? 0)), 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>거래처별 매입</CardTitle>
      </CardHeader>
      <CardBody className="p-0">
        {rows.length === 0 ? (
          <Empty text="이 기간에는 입고가 없습니다." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[30rem] text-sm">
              <thead className="border-border-base text-ink-muted border-b text-xs">
                <tr>
                  <th scope="col" className={cn(TH, 'text-left')}>
                    거래처
                  </th>
                  <th scope="col" className={cn(TH, 'w-28 text-left')}>
                    <span className="sr-only">매입 비중</span>
                  </th>
                  <th scope="col" className={cn(TH, 'text-right')}>
                    건수
                  </th>
                  <th scope="col" className={cn(TH, 'text-right')}>
                    수량
                  </th>
                  <th scope="col" className={cn(TH, 'text-right')}>
                    매입액
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.supplier_id ?? 'none'}
                    className="border-border-base border-b last:border-0"
                  >
                    <td className={cn(TD, 'text-ink font-medium')}>{r.supplier_name}</td>
                    <td className={TD}>
                      <Bar value={Number(r.purchase_amount ?? 0)} max={max} />
                    </td>
                    <td className={cn(TD, 'text-ink-muted text-right')}>
                      {formatQty(Number(r.purchase_count ?? 0))}
                    </td>
                    <td className={cn(TD, 'text-ink-muted text-right')}>
                      {formatQty(Number(r.qty_purchased ?? 0))}
                    </td>
                    <td className={cn(TD, 'text-ink text-right')}>
                      {formatWon(r.purchase_amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  )
}

export function TurnoverTable({ rows }: { rows: TurnoverStat[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>재고 회전</CardTitle>
        {/* 스키마 주석이 요구하는 표기다. 정확한 회전율은 일별 재고 스냅샷이
            있어야 나오는데 지금은 현재 재고자산으로 나눈 근사값이다. */}
        <span className="text-ink-muted text-xs">추정치</span>
      </CardHeader>
      <CardBody className="p-0">
        {rows.length === 0 ? (
          <Empty text="계산할 재고가 없습니다." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] text-sm">
                <thead className="border-border-base text-ink-muted border-b text-xs">
                  <tr>
                    <th scope="col" className={cn(TH, 'text-left')}>
                      카테고리
                    </th>
                    <th scope="col" className={cn(TH, 'text-right')}>
                      기간 매출원가
                    </th>
                    <th scope="col" className={cn(TH, 'text-right')}>
                      현재 재고자산
                    </th>
                    <th scope="col" className={cn(TH, 'text-right')}>
                      연 회전
                    </th>
                    <th scope="col" className={cn(TH, 'text-right')}>
                      소진 예상
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.category_id ?? 'none'}
                      className="border-border-base border-b last:border-0"
                    >
                      <td className={cn(TD, 'text-ink font-medium')}>
                        {r.category_name}
                      </td>
                      <td className={cn(TD, 'text-ink-muted text-right')}>
                        {formatWon(r.period_cogs)}
                      </td>
                      <td className={cn(TD, 'text-ink-muted text-right')}>
                        {formatWon(r.stock_value_now)}
                      </td>
                      <td className={cn(TD, 'text-ink text-right')}>
                        {Number(r.turnover_annual ?? 0).toFixed(2)}회
                      </td>
                      <td className={cn(TD, 'text-ink-muted text-right')}>
                        {r.days_of_stock === null ? '—' : `${r.days_of_stock}일`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-ink-subtle border-border-base border-t px-3 py-2 text-xs leading-relaxed">
              기간 매출원가를 지금 재고자산으로 나눠 연 단위로 환산한 값입니다.
              기간 중 재고가 크게 변했다면 실제 회전율과 차이가 납니다.
            </p>
          </>
        )}
      </CardBody>
    </Card>
  )
}
