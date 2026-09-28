import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * twMerge 에 이 앱이 만든 이름을 알려 준다 (app/globals.css 의 @theme).
 *
 * 기본 설정은 spacing 을 숫자로만, radius 를 정해진 크기 이름으로만 알아본다. 그래서
 * `h-touch` 를 높이로 못 알아보고 `cn('h-touch', 'h-12')` 에서 둘 다 남겨, CSS 선언
 * 순서가 이기는 쪽을 정했다 — 호출부가 준 높이가 조용히 무시돼 입출고 카메라 버튼과
 * 빠른 등록 수량 칸이 옆 버튼과 4px 어긋났다(2026-09-27). @theme 에 이름을 더하면
 * 여기에도 더해라.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      spacing: ['touch', 'touch-lg'],
      radius: ['card'],
      // 기본 설정은 shadow-<모르는 이름> 을 그림자 "색"으로 읽는다. 그러면 cn('shadow-field-hover',
      // 'shadow-black') 이 그림자를 지우고 'shadow-none' 과는 둘 다 남긴다(2026-09-28 확인).
      shadow: ['field-hover'],
    },
  },
})

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
