import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * 클래스 합치기.
 *
 * twMerge 가 있어야 `cn('px-4', props.className)` 에서 호출부의 `px-6` 이 이긴다.
 * 단순 문자열 연결이면 둘 다 남아서 CSS 순서가 승자를 정하게 되고,
 * 그때부터 컴포넌트 바깥에서 여백 하나 바꾸는 게 도박이 된다.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
