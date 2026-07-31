import {
  BarChart3,
  Boxes,
  ClipboardList,
  Home,
  ReceiptText,
  Settings,
  type LucideIcon,
} from 'lucide-react'

export type NavItem = {
  href: string
  label: string
  icon: LucideIcon
  /** 모바일 하단 탭에 넣을지. 탭은 5개를 넘기면 손가락으로 못 짚는다. */
  tab?: boolean
  /**
   * 하단 탭에서만 쓰는 짧은 라벨. 탭 글자는 0.6875rem 에 다섯 칸이라
   * "판매 기록" 같은 네 글자+공백은 줄이 넘어간다. 없으면 label 을 쓴다.
   */
  tabLabel?: string
}

/**
 * 모바일과 데스크톱이 같은 목록을 쓴다. 배치만 다르다.
 *
 * 순서는 재고 파악 중심이다. 이 앱의 목적은 계산이 아니라 "지금 몇 개
 * 남았는지"라서 재고가 판매보다 앞이다. 홈은 하단 탭에서 뺐다 — 요약 숫자는
 * 큰 화면에서 보는 것이고, 휴대폰에서는 재고 확인이 첫 동작이다.
 */
export const NAV: NavItem[] = [
  { href: '/', label: '홈', icon: Home },
  { href: '/stock', label: '재고', icon: Boxes, tab: true },
  { href: '/sales', label: '판매 기록', icon: ReceiptText, tab: true, tabLabel: '판매' },
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
