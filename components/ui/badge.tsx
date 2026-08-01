import { cn } from '@/lib/cn'
import { MOVEMENT_LABEL, MOVEMENT_TONE, type MovementType } from '@/lib/constants'

type Tone = 'neutral' | 'in' | 'out' | 'low' | 'danger'

const TONE: Record<Tone, string> = {
  neutral: 'bg-surface-sunken text-ink-muted border-border-base',
  in: 'bg-in-soft text-in border-in/25',
  out: 'bg-out-soft text-out border-out/25',
  low: 'bg-low-soft text-low border-low/25',
  danger: 'bg-danger-soft text-danger border-danger/25',
}

export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: Tone
  className?: string
  children: React.ReactNode
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap',
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/** 입출고 종류 배지. 라벨 매핑을 화면마다 다시 쓰지 않도록 묶어둔다. */
export function MovementBadge({ type }: { type: MovementType }) {
  const tone = MOVEMENT_TONE[type]
  return (
    <Badge tone={tone === 'in' ? 'in' : tone === 'out' ? 'out' : 'neutral'}>
      {MOVEMENT_LABEL[type]}
    </Badge>
  )
}

/**
 * 재고 상태 배지.
 *
 * 음수 재고를 따로 표시하는 게 핵심이다. DB 는 음수를 막지 않기로 했고
 * (입고를 깜빡한 상품이 계산대에서 판매 거부되는 것보다 낫다),
 * 대신 화면에서 확실히 눈에 띄어야 실사로 정리된다.
 *
 * 색만으로 구분하지 않는다. 배지에 항상 글자가 들어간다.
 */
export function StockBadge({
  qty,
  threshold,
  unit,
}: {
  qty: number
  threshold: number
  /** 상품의 세는 말. 안 넘기면 '개' — unit 이전의 호출부와 동작이 같다. */
  unit?: string | null
}) {
  if (qty < 0) return <Badge tone="danger">재고 음수 {qty}</Badge>
  if (qty === 0) return <Badge tone="low">품절</Badge>
  if (qty <= threshold) return <Badge tone="low">부족 {qty}</Badge>
  return <Badge tone="neutral">{qty}{unit || '개'}</Badge>
}
