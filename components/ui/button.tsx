import type { ButtonHTMLAttributes } from 'react'

import { cn } from '@/lib/cn'

type Variant = 'primary' | 'black' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

/**
 * 색 역할(2026-09-21 목업 A2/B7/C6/C3 확정):
 * - primary: 코발트. 화면의 "완료 동작" (판매 확정·등록·저장·입고). 한 화면에 하나.
 * - black:   검정(Geist 식). 새 화면으로 가거나 목록을 만드는 보조 주요 동작 (상품 등록·파일로 입고·찾기).
 * - secondary/ghost: 나머지. danger 는 되돌릴 수 없는 것.
 * hover/pressed 는 색을 따로 고르지 않고 STATE_LAYER 가 현재 글자색을 6%/12% 덮는다.
 */
const VARIANT: Record<Variant, string> = {
  primary:
    'bg-primary text-primary-ink hover:bg-primary-hover active:bg-primary-active',
  black: 'bg-ink-strong text-ink-inverted hover:bg-ink-strong/90',
  secondary:
    'bg-surface text-ink border border-border-strong hover:border-ink-subtle',
  ghost: 'text-ink-muted hover:text-ink',
  danger: 'bg-danger text-danger-ink hover:bg-danger-hover',
}

const SIZE: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  // 기본값이 44px 다. 계산대에서 쓰는 화면이라 데스크톱 기준으로 줄이지 않는다.
  md: 'h-touch px-4 text-[0.9375rem] gap-2',
  // 판매 확정처럼 한 손으로 크게 누르는 동작. Toss CTA 꼴 — 더 둥글고 글자가 크다.
  lg: 'h-touch-lg px-6 text-base gap-2 rounded-2xl font-semibold',
}

/**
 * 누를 때의 반응. 색만 바뀜면 터치 화면에서는 "눌렸나?"가 불분명해서(손가락이 버튼을
 * 가린다) 살짝 작아지게 한다. 0.97 은 눈에 띄되 옵하지 않은 값 — 더 작으면 버튼이
 * 도망가는 것처럼 보인다. 포인터 없는 기기를 위해 범위를 묻지 않고 항상 준다.
 */
const PRESS =
  'transition-[transform,background-color,border-color,opacity] duration-150 select-none active:scale-[0.98]'

/**
 * 상태 레이어(Material 3 식). 버튼 위에 현재 글자색을 반투명으로 덮어 hover 6%,
 * pressed 12% 를 만든다. 변형마다 hover 색을 따로 정하지 않아도 검정·코발트·흰
 * 버튼이 같은 "눌림" 을 낸다. overflow-hidden 이 없으면 둥근 모서리 밖으로 샌다.
 */
const STATE_LAYER =
  'relative overflow-hidden after:pointer-events-none after:absolute after:inset-0 after:bg-current after:opacity-0 after:transition-opacity after:duration-150 hover:after:opacity-[0.06] active:after:opacity-[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface'

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  full?: boolean
}

/**
 * 버튼과 똑같이 생겨야 하는 <Link> 를 위한 클래스.
 *
 * Button 에 `as` prop 을 받게 고치는 쪽은 택하지 않았다. 그러면 이 컴포넌트가
 * 버튼이면서 링크인 두 얼굴을 갖게 되고, type='button' 기본값 같은 버튼 전용
 * 방어가 링크에도 딸려 온다. 모양만 필요하면 모양만 가져가면 된다.
 */
export function buttonClass(
  variant: Variant = 'primary',
  size: Size = 'md',
  full = false,
  className?: string,
) {
  return cn(
    'inline-flex items-center justify-center rounded-lg font-medium',
    PRESS,
    STATE_LAYER,
    VARIANT[variant],
    SIZE[size],
    full && 'w-full',
    className,
  )
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
        PRESS,
        STATE_LAYER,
        'disabled:pointer-events-none disabled:opacity-45 disabled:after:hidden',
        VARIANT[variant],
        SIZE[size],
        full && 'w-full',
        className,
      )}
      {...props}
    />
  )
}
