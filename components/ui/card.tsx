import type { HTMLAttributes } from 'react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/cn'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'bg-surface border-border-base rounded-card border',
        className,
      )}
      {...props}
    />
  )
}

export function CardHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'border-border-base flex items-center justify-between gap-3 border-b px-5 py-4',
        className,
      )}
      {...props}
    />
  )
}

export function CardTitle({
  className,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2 className={cn('text-ink text-base font-semibold', className)} {...props} />
  )
}

export function CardDescription({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-ink-muted mt-0.5 text-xs', className)} {...props} />
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...props} />
}

/**
 * 숫자 하나를 크게 보여주는 타일. 통계 화면 상단과 재고 요약에 쓴다.
 *
 * `tone` 은 값 자체의 성격이다. 마진이 음수면 loss, 재고 부족이면 low.
 * 색만 바뀌는 게 아니라 라벨 텍스트가 이미 뜻을 말하고 있어야 한다.
 */
export function StatTile({
  label,
  value,
  unit,
  hint,
  icon: Icon,
  tone = 'neutral',
  className,
}: {
  label: string
  /** 문자열이거나, 홈처럼 0 부터 올라가는 `<CountUp>`. */
  value: React.ReactNode
  /** 값 뒤에 작게 붙는 단위. formatWon 처럼 값에 이미 단위가 있으면 비운다. */
  unit?: string
  /** 라벨 오른쪽 작은 픽토그램. 네 개가 나란히 설 때 무슨 숫자인지 먼저 잡아준다. */
  icon?: LucideIcon
  /** 증감 표시처럼 아이콘이 붙는 경우가 있어 노드를 받는다. */
  hint?: React.ReactNode
  tone?: 'neutral' | 'profit' | 'loss' | 'low'
  className?: string
}) {
  const toneClass = {
    neutral: 'text-ink',
    profit: 'text-profit',
    loss: 'text-loss',
    low: 'text-low',
  }[tone]

  return (
    <Card className={cn('px-5 py-4', className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-ink-muted text-xs font-medium">{label}</div>
        {Icon ? (
          <span
            aria-hidden
            className="bg-surface-sunken text-ink-subtle inline-flex h-7 w-7 items-center justify-center rounded-lg"
          >
            <Icon size={15} />
          </span>
        ) : null}
      </div>
      {/*
        여기에는 data-numeric 을 붙이지 않는다. 자릿수를 고정하면 표에서는
        세로로 줄이 맞아 읽기 좋지만, 이렇게 혼자 큰 숫자에서는 글자 사이가
        벌어져 성기게 보인다. 자릿수 정렬은 여러 줄이 겹쳐 있을 때만 쓸모가 있다.
      */}
      <div
        className={cn(
          // 휴대폰 두 열 카드에서 "12,513,589원" 이 두 줄로 꺾였다 — 좁을 땐 한 단계 작게.
          'mt-2 text-xl leading-tight font-semibold tracking-tight whitespace-nowrap sm:text-[1.625rem]',
          toneClass,
        )}
      >
        {value}
        {unit ? (
          <span className="text-ink-muted ml-1 text-sm font-medium tracking-normal">
            {unit}
          </span>
        ) : null}
      </div>
      {hint ? <div className="text-ink-subtle mt-1 text-xs">{hint}</div> : null}
    </Card>
  )
}
