import type { HTMLAttributes } from 'react'

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
        'border-border-base flex items-center justify-between gap-3 border-b px-4 py-3',
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

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4', className)} {...props} />
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
  hint,
  tone = 'neutral',
  className,
}: {
  label: string
  value: string
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
    <Card className={cn('px-4 py-3', className)}>
      <div className="text-ink-muted text-xs font-medium">{label}</div>
      {/*
        여기에는 data-numeric 을 붙이지 않는다. 자릿수를 고정하면 표에서는
        세로로 줄이 맞아 읽기 좋지만, 이렇게 혼자 큰 숫자에서는 글자 사이가
        벌어져 성기게 보인다. 자릿수 정렬은 여러 줄이 겹쳐 있을 때만 쓸모가 있다.
      */}
      <div className={cn('mt-1 text-xl font-semibold tracking-tight', toneClass)}>
        {value}
      </div>
      {hint ? <div className="text-ink-subtle mt-0.5 text-xs">{hint}</div> : null}
    </Card>
  )
}
