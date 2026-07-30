import { Badge, MovementBadge } from '@/components/ui/badge'
import { formatQty } from '@/lib/constants'

import type { MovementRow } from './query'

/**
 * 전표 종류 배지.
 *
 * 정정 전표는 원본과 같은 type 을 그대로 갖는다 (매입 통계를 상쇄해야 하므로).
 * 그래서 type 만 보고 그리면 입고 정정이 "입고 -20" 으로 보인다. 목록에서
 * 제일 헷갈리는 지점이라 정정은 정정이라고 먼저 말한다.
 */
export function MovementKind({ row }: { row: MovementRow }) {
  if (row.reverses_id) return <Badge tone="neutral">정정</Badge>
  if (!row.type) return null
  return <MovementBadge type={row.type} />
}

/**
 * 수량 변화 표기.
 *
 * 실사는 델타만 보여주면 무슨 일이 있었는지 알 수 없다. "20개로 맞춤" 처럼
 * 센 결과를 먼저 말하고 증감을 괄호에 넣는다.
 */
export function QtyDelta({ row }: { row: MovementRow }) {
  const delta = row.qty_delta ?? 0
  const sign = delta > 0 ? '+' : ''
  const tone = delta > 0 ? 'text-in' : delta < 0 ? 'text-out' : 'text-ink-muted'

  if (row.type === 'stocktake') {
    return (
      <span className="text-ink text-sm" data-numeric>
        {formatQty(row.counted_qty)}개로 맞춤{' '}
        <span className={tone}>
          ({sign}
          {formatQty(delta)})
        </span>
      </span>
    )
  }

  return (
    <span className={`text-sm font-medium ${tone}`} data-numeric>
      {sign}
      {formatQty(delta)}
    </span>
  )
}
