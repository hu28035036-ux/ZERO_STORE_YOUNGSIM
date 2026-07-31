import { ActionForm } from '@/components/ui/action-form'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDateTime, formatQty, formatWon } from '@/lib/constants'
import { createClient } from '@/lib/supabase/server'

import { voidBatch, voidOrder } from './actions'

export const metadata = { title: '임포트 이력' }

type OrderRow = {
  id: string
  occurred_at: string
  created_at: string
  item_count: number
  total_revenue: number
  memo: string | null
  source: string
  import_batch_id: string | null
}

/**
 * 임포트 이력과 되돌리기.
 *
 * 같은 파일을 잘못 올렸을 때의 복구 지점이다. 배치(파일 한 번) 단위로 묶어
 * 보여주고 통째로 되돌린다. 아래에는 최근 영수증 개별 취소도 둔다 — 판매
 * 적기 화면에서 실수한 것도 여기서 되돌린다.
 */
export default async function BatchesPage() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('sale_orders')
    .select(
      'id, occurred_at, created_at, item_count, total_revenue, memo, source, import_batch_id',
    )
    .order('created_at', { ascending: false })
    .limit(100)

  const orders = (data ?? []) as OrderRow[]

  // 배치 = 파일 한 번. created_at 이 같은 임포트 영수증들을 배치 id 로 묶는다.
  const batches = new Map<string, OrderRow[]>()
  for (const o of orders) {
    if (o.source !== 'import' || !o.import_batch_id) continue
    const list = batches.get(o.import_batch_id) ?? []
    list.push(o)
    batches.set(o.import_batch_id, list)
  }

  const manual = orders.filter((o) => o.source !== 'import')

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-ink text-lg font-semibold tracking-tight">임포트 이력</h1>

      {batches.size === 0 ? (
        <Card className="p-5">
          <p className="text-ink-muted text-sm leading-relaxed">
            아직 파일로 반영한 판매가 없습니다. 판매기록 파일을 올리면 여기에
            배치가 쌓이고, 잘못 올린 것을 통째로 되돌릴 수 있습니다.
          </p>
        </Card>
      ) : (
        [...batches.entries()].map(([batchId, list]) => {
          const revenue = list.reduce((s, o) => s + Number(o.total_revenue), 0)
          const lines = list.reduce((s, o) => s + o.item_count, 0)
          // 전부 되돌린 배치는 유효 라인이 0 이다 (void_sale_order 가 다시 센다).
          const voided = lines === 0
          const dates = [...new Set(list.map((o) => o.occurred_at.slice(0, 10)))].sort()

          return (
            <Card key={batchId}>
              <CardHeader>
                <CardTitle>
                  {formatDateTime(list[0].created_at)} 에 올린 파일
                </CardTitle>
                {voided ? (
                  <span className="text-ink-subtle text-xs">되돌림</span>
                ) : null}
              </CardHeader>
              <CardBody className="flex flex-col gap-3">
                <p className="text-ink-muted text-sm">
                  영수증 {list.length}장 ({dates.join(', ')}) ·{' '}
                  <span data-numeric>{formatQty(lines)}줄</span> ·{' '}
                  <span className="text-ink font-medium" data-numeric>
                    {formatWon(revenue)}
                  </span>
                  {list[0].memo ? (
                    <span className="text-ink-subtle"> · {list[0].memo}</span>
                  ) : null}
                </p>
                {voided ? (
                  <p className="text-ink-subtle text-sm">
                    이미 되돌린 배치입니다. 재고와 매출에 영향이 없습니다.
                  </p>
                ) : (
                  <ActionForm
                    action={voidBatch}
                    submitLabel="이 배치 통째로 되돌리기"
                    submitVariant="secondary"
                    submitSize="sm"
                    confirmLabel="정말 되돌리기 — 재고와 매출이 반영 전으로 돌아갑니다"
                  >
                    <input type="hidden" name="batchId" value={batchId} />
                  </ActionForm>
                )}
              </CardBody>
            </Card>
          )
        })
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-ink text-sm font-semibold">직접 적은 영수증</h2>
        {manual.length === 0 ? (
          <Card className="p-5">
            <p className="text-ink-muted text-sm">직접 적은 판매가 없습니다.</p>
          </Card>
        ) : (
          <Card className="flex flex-col">
            <ul>
              {manual.map((o) => {
                const voided = o.item_count === 0
                return (
                  <li
                    key={o.id}
                    className="border-border-base flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="text-ink text-sm font-medium" data-numeric>
                        {formatDateTime(o.occurred_at)}
                        {voided ? (
                          <span className="text-ink-subtle ml-2 text-xs">되돌림</span>
                        ) : null}
                      </p>
                      <p className="text-ink-muted text-xs" data-numeric>
                        {formatQty(o.item_count)}점 · {formatWon(o.total_revenue)}
                        {o.memo ? ` · ${o.memo}` : ''}
                      </p>
                    </div>
                    {voided ? null : (
                      <ActionForm
                        action={voidOrder}
                        submitLabel="되돌리기"
                        submitVariant="ghost"
                        submitSize="sm"
                        confirmLabel="정말 되돌리기"
                        layout="row"
                      >
                        <input type="hidden" name="orderId" value={o.id} />
                      </ActionForm>
                    )}
                  </li>
                )
              })}
            </ul>
          </Card>
        )}
      </section>
    </div>
  )
}
