import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { formatDateTime, formatQty, formatWon } from '@/lib/constants'

import { MovementKind, QtyDelta } from './movement-kind'
import type { MovementRow } from './query'
import { VoidButton } from './void-button'

export function MovementCards({ rows }: { rows: MovementRow[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => {
        const label = `${row.product_name}${row.option_label ? ` ${row.option_label}` : ''}`
        // 판매 전표는 여기서 정정하지 않는다. 영수증 단위로 되돌려야 하는데
        // 그건 판매 화면이 할 일이다. 정정 전표 자신도 다시 정정할 수 없다.
        const canVoid = !row.voided_by && !row.reverses_id && row.type !== 'sale'

        return (
          <li key={row.id}>
            <Card className="flex flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <MovementKind row={row} />
                    {row.voided_by ? <Badge tone="neutral">정정됨</Badge> : null}
                  </div>
                  <p className="text-ink mt-1.5 truncate text-[0.9375rem] font-medium">
                    {row.product_name}
                  </p>
                  {row.option_label ? (
                    <p className="text-ink-muted truncate text-sm">{row.option_label}</p>
                  ) : null}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <QtyDelta row={row} />
                  <span className="text-ink-subtle text-xs" data-numeric>
                    잔여 {formatQty(row.stock_after)}
                  </span>
                </div>
              </div>

              <div className="text-ink-muted flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
                <span data-numeric>{formatDateTime(row.occurred_at)}</span>
                {row.type === 'purchase' && row.unit_cost ? (
                  <span data-numeric>단가 {formatWon(row.unit_cost)}</span>
                ) : null}
                {row.supplier_name ? <span>{row.supplier_name}</span> : null}
                {row.created_by_name ? <span>{row.created_by_name}</span> : null}
              </div>

              {row.note ? (
                <p className="text-ink-muted text-sm break-words">{row.note}</p>
              ) : null}

              {canVoid ? (
                <div className="flex justify-end">
                  <VoidButton id={row.id!} label={label} />
                </div>
              ) : null}
            </Card>
          </li>
        )
      })}
    </ul>
  )
}
