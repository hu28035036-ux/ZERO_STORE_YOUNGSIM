import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { formatDateTime, formatQty, formatWon } from '@/lib/constants'

import { MovementKind, QtyDelta } from './movement-kind'
import type { MovementRow } from './query'
import { VoidButton } from './void-button'

export function MovementTable({ rows }: { rows: MovementRow[] }) {
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[56rem] text-sm">
        <thead className="border-border-base text-ink-muted border-b text-xs">
          <tr>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              일시
            </th>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              종류
            </th>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              상품
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              수량
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              잔여
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              단가
            </th>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              거래처 · 메모
            </th>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              처리
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              <span className="sr-only">정정</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const label = `${row.product_name}${row.option_label ? ` ${row.option_label}` : ''}`
            const canVoid = !row.voided_by && !row.reverses_id && row.type !== 'sale'

            return (
              <tr
                key={row.id}
                className="border-border-base hover:bg-surface-sunken border-b last:border-0"
              >
                <td className="text-ink-muted px-3 py-2.5 whitespace-nowrap" data-numeric>
                  {formatDateTime(row.occurred_at)}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <MovementKind row={row} />
                    {row.voided_by ? <Badge tone="neutral">정정됨</Badge> : null}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <span className="text-ink font-medium">{row.product_name}</span>
                  {row.option_label ? (
                    <span className="text-ink-muted"> · {row.option_label}</span>
                  ) : null}
                </td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  <QtyDelta row={row} />
                </td>
                <td className="text-ink-muted px-3 py-2.5 text-right" data-numeric>
                  {formatQty(row.stock_after)}
                </td>
                <td className="text-ink-muted px-3 py-2.5 text-right" data-numeric>
                  {row.type === 'purchase' && row.unit_cost
                    ? formatWon(row.unit_cost)
                    : '—'}
                </td>
                <td className="text-ink-muted px-3 py-2.5">
                  {row.supplier_name ? (
                    <span className="text-ink">{row.supplier_name}</span>
                  ) : null}
                  {row.supplier_name && row.note ? ' · ' : null}
                  {row.note}
                  {!row.supplier_name && !row.note ? '—' : null}
                </td>
                <td className="text-ink-subtle px-3 py-2.5">
                  {row.created_by_name ?? '—'}
                </td>
                <td className="px-3 py-2.5 text-right">
                  {canVoid ? <VoidButton id={row.id!} label={label} /> : null}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Card>
  )
}
