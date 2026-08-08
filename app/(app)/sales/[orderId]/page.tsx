import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'

import { ActionForm } from '@/components/ui/action-form'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDateTime, formatQty, formatWon } from '@/lib/constants'
import { createClient } from '@/lib/supabase/server'

import { voidOrder } from '../batches/actions'

export const metadata = { title: '영수증' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * 영수증 하나의 내용.
 *
 * 판매 라인은 별도 테이블이 아니라 원장(stock_movements)의 type='sale' 행이다.
 * 정정 전표(reverses_id 有)는 라인이 아니라 취소 기록이므로 표에서 뺀다 —
 * 취소 여부는 배너 하나로 말한다 (void_sale_order 는 영수증 통째로만 되돌린다).
 */
export default async function SaleOrderPage({
  params,
}: {
  params: Promise<{ orderId: string }>
}) {
  const { orderId } = await params
  // 모양이 틀린 uuid 를 그대로 넘기면 PostgREST 가 400 을 낸다.
  if (!UUID.test(orderId)) notFound()

  const supabase = await createClient()

  const [orderResult, linesResult] = await Promise.all([
    supabase
      .from('sale_orders')
      .select('id, occurred_at, created_at, item_count, total_revenue, memo, source')
      .eq('id', orderId)
      .maybeSingle(),
    supabase
      .from('v_movements')
      .select('id, variant_id, product_name, option_label, qty_delta, unit_price, revenue_amount, reverses_id, unit')
      .eq('sale_order_id', orderId)
      .order('id'),
  ])

  const order = orderResult.data
  if (!order) notFound()

  const lines = (linesResult.data ?? []).filter((l) => l.reverses_id == null)
  const voided = order.item_count === 0
  const qtyTotal = lines.reduce((s, l) => s + -(l.qty_delta ?? 0), 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link
          href="/sales"
          aria-label="판매 기록으로 돌아가기"
          className="text-ink-muted hover:bg-surface-sunken hover:text-ink -ml-2 inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors"
        >
          <ChevronLeft size={20} aria-hidden />
        </Link>
        <h1 className="text-ink text-lg font-semibold tracking-tight">영수증</h1>
      </div>

      {voided ? (
        <Card className="border-border-strong bg-surface-sunken p-4">
          <p className="text-ink text-sm font-medium">되돌린 영수증입니다.</p>
          <p className="text-ink-muted mt-1 text-sm">
            재고와 매출에 영향이 없습니다. 아래 내용은 되돌리기 전의 기록입니다.
          </p>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>
            <span data-numeric>{formatDateTime(order.occurred_at)}</span>
          </CardTitle>
          <span className="text-ink-subtle text-xs">
            {order.source === 'import' ? '파일로 반영' : '직접 적음'}
          </span>
        </CardHeader>
        <CardBody className="flex flex-col gap-1">
          {order.memo ? (
            <p className="text-ink-muted text-sm">{order.memo}</p>
          ) : null}
          <p className="text-sm">
            <span className="text-ink-muted" data-numeric>
              {formatQty(voided ? qtyTotal : order.item_count)}줄 · {formatQty(qtyTotal)}점
            </span>
            <span className="text-ink ml-2 font-semibold" data-numeric>
              {formatWon(
                voided
                  ? lines.reduce((s, l) => s + Number(l.revenue_amount ?? 0), 0)
                  : order.total_revenue,
              )}
            </span>
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>담긴 상품 {lines.length}줄</CardTitle>
        </CardHeader>
        {lines.length === 0 ? (
          <CardBody>
            <p className="text-ink-muted text-sm">라인이 없습니다.</p>
          </CardBody>
        ) : (
          <ul className="divide-border-base divide-y">
            {lines.map((l) => (
              <li
                key={l.id}
                className="flex items-baseline justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-ink truncate text-sm font-medium">
                    {l.product_name}
                  </p>
                  <p className="text-ink-muted text-xs" data-numeric>
                    {l.option_label ? `${l.option_label} · ` : ''}
                    {formatQty(-(l.qty_delta ?? 0))}
                    {l.unit || '개'} × {formatWon(l.unit_price)}
                  </p>
                </div>
                <p className="text-ink shrink-0 text-sm font-semibold" data-numeric>
                  {formatWon(l.revenue_amount)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {voided ? null : (
        <Card className="p-4">
          <ActionForm
            action={voidOrder}
            submitLabel="이 영수증 되돌리기"
            submitVariant="secondary"
            submitSize="sm"
            confirmLabel="정말 되돌리기 — 재고와 매출이 기록 전으로 돌아갑니다"
          >
            <input type="hidden" name="orderId" value={order.id} />
          </ActionForm>
        </Card>
      )}
    </div>
  )
}
