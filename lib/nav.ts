import {
  BarChart3,
  Boxes,
  ClipboardList,
  Home,
  ScanLine,
  Settings,
  type LucideIcon,
} from 'lucide-react'

export type NavItem = {
  href: string
  label: string
  icon: LucideIcon
  /** 모바일 하단 탭에 넣을지. 탭은 5개를 넘기면 손가락으로 못 짚는다. */
  tab?: boolean
}

/**
 * 모바일과 데스크톱이 같은 목록을 쓴다. 배치만 다르다.
 *
 * 순서는 계산대에서 쓰는 빈도순이다. 판매가 맨 앞이고 설정이 맨 뒤다.
 * 홈은 하단 탭에서 뺐다 — 휴대폰에서는 앱을 열면 바로 판매 화면으로 가는 게
 * 자연스럽고, 요약 숫자는 큰 화면에서 보는 것이다.
 */
export const NAV: NavItem[] = [
  { href: '/', label: '홈', icon: Home },
  { href: '/sell', label: '판매', icon: ScanLine, tab: true },
  { href: '/stock', label: '재고', icon: Boxes, tab: true },
  { href: '/movements', label: '입출고', icon: ClipboardList, tab: true },
  { href: '/stats', label: '통계', icon: BarChart3, tab: true },
  { href: '/settings', label: '설정', icon: Settings, tab: true },
]

export const TABS = NAV.filter((item) => item.tab)

/** 현재 경로가 그 항목에 속하는지. 하위 경로도 부모 탭이 켜지게 한다. */
export function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}
