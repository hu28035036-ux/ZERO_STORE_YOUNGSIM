import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { formatDateTime, formatQty, formatWon } from '@/lib/constants'

import { MovementKind, QtyDelta } from './movement-kind'
import type { MovementRow } from './query'
import { VoidButton } from './void-button'

export function MovementTable({ rows }: { rows: MovementRow[] }) {
  return (
    // relative: 머리칸의 sr-only(position:absolute)가 이 카드를 기준으로 자리 잡게 한다. 없으면
    // 좁은 창에서 표 오른쪽 끝 자리가 페이지 폭을 늘린다(재고 삭제됨 탭에서 실제로 밀렸다).
    <Card className="relative overflow-x-auto">
      <table className="w-full min-w-[60rem] text-sm">
        <thead className="bg-surface-sunken text-ink-muted text-xs font-medium">
          <tr>
            <th scope="col" className="px-4 py-3 text-left font-medium whitespace-nowrap">
              일시
            </th>
            <th scope="col" className="px-4 py-3 text-left font-medium whitespace-nowrap">
              종류
            </th>
            <th scope="col" className="px-4 py-3 text-left font-medium whitespace-nowrap">
              상품
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium whitespace-nowrap">
              수량
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium whitespace-nowrap">
              잔여
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium whitespace-nowrap">
              단가
            </th>
            <th scope="col" className="px-4 py-3 text-left font-medium whitespace-nowrap">
              거래처 · 메모
            </th>
            <th scope="col" className="px-4 py-3 text-left font-medium whitespace-nowrap">
              처리
            </th>
            <th scope="col" className="px-4 py-3 text-right font-medium whitespace-nowrap">
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
                <td className="text-ink-muted px-4 py-3.5 whitespace-nowrap" data-numeric>
                  {formatDateTime(row.occurred_at)}
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-1.5">
                    <MovementKind row={row} />
                    {row.voided_by ? <Badge tone="neutral">정정됨</Badge> : null}
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  <span className="text-ink font-medium">{row.product_name}</span>
                  {row.option_label ? (
                    <span className="text-ink-muted"> · {row.option_label}</span>
                  ) : null}
                </td>
                <td className="px-4 py-3.5 text-right whitespace-nowrap">
                  <QtyDelta row={row} />
                </td>
                {/* 숫자 칸은 줄을 못 바꾸게 한다 — 표가 칸을 좁게 잡으면 "39 / 5", "4,830 / 원"처럼
                    숫자 안에서 꺾여 재고를 잘못 읽는다. 수량 칸은 원래 그랬다. */}
                <td className="text-ink-muted px-4 py-3.5 text-right whitespace-nowrap" data-numeric>
                  {formatQty(row.stock_after)}
                </td>
                <td className="text-ink-muted px-4 py-3.5 text-right whitespace-nowrap" data-numeric>
                  {row.type === 'purchase' && row.unit_cost
                    ? formatWon(row.unit_cost)
                    : '—'}
                </td>
                <td className="text-ink-muted px-4 py-3.5">
                  {row.supplier_name ? (
                    <span className="text-ink">{row.supplier_name}</span>
                  ) : null}
                  {row.supplier_name && row.note ? ' · ' : null}
                  {row.note}
                  {!row.supplier_name && !row.note ? '—' : null}
                </td>
                <td className="text-ink-subtle px-4 py-3.5 whitespace-nowrap">
                  {row.created_by_name ?? '—'}
                </td>
                <td className="px-4 py-3.5 text-right whitespace-nowrap">
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
