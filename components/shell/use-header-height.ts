'use client'

import { useEffect, type RefObject } from 'react'

/**
 * 셸 상단 바(제목 + 탭)의 실제 높이를 문서에 `--app-header-h` 로 싣는다.
 *
 * 화면 안에서 스크롤해도 따라오는 막대(재고 검색칸)는 이 바로 아래에 붙어야 한다.
 * top-0 이면 sticky 상단 바 밑으로 기어 들어가 가려진다. 숫자를 박지 않고 재는
 * 이유: 높이가 rem 이라 브라우저 글자 크기 설정에 따라 달라지고, 두 셸의 높이도
 * 서로 다르다. 재기 전(하이드레이션 전)에는 변수가 없어 그 막대가 붙지 않을 뿐
 * 가려지지는 않는다.
 */
export function useHeaderHeightVar(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const root = document.documentElement
    const apply = () => root.style.setProperty('--app-header-h', `${el.offsetHeight}px`)
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(el)
    return () => {
      observer.disconnect()
      root.style.removeProperty('--app-header-h')
    }
  }, [ref])
}
