import type { ButtonHTMLAttributes } from 'react'

import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const VARIANT: Record<Variant, string> = {
  primary:
    'bg-primary text-primary-ink hover:bg-primary-hover active:bg-primary-hover',
  secondary:
    'bg-surface text-ink border border-border-strong hover:bg-surface-sunken',
  ghost: 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
  danger: 'bg-danger text-danger-ink hover:bg-danger-hover',
}

const SIZE: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  // 기본값이 44px 다. 계산대에서 쓰는 화면이라 데스크톱 기준으로 줄이지 않는다.
  md: 'h-touch px-4 text-[0.9375rem] gap-2',
  // 판매 확정처럼 한 손으로 크게 누르는 동작
  lg: 'h-touch-lg px-6 text-base gap-2',
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  full?: boolean
}

export function Button({
  variant = 'primary',
  size = 'md',
  full = false,
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      // 기본값이 submit 이라 폼 안에 아무 버튼이나 두면 의도치 않게 제출된다.
      // 이 앱은 폼 하나에 버튼이 여러 개(추가/삭제/저장) 붙는 화면이 많다.
      type={type}
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-medium',
        'transition-colors select-none',
        'disabled:pointer-events-none disabled:opacity-50',
        VARIANT[variant],
        SIZE[size],
        full && 'w-full',
        className,
      )}
      {...props}
    />
  )
}
