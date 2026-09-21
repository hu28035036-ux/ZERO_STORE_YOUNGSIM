'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/cn'
import { isActive, NAV } from '@/lib/nav'

/**
 * 데스크톱 셸: 왼쪽 사이드바 + 상단 바 + 본문.
 *
 * 여기서는 홈을 포함한 전체 메뉴를 편다. 큰 화면에서는 요약 대시보드가
 * 실제로 쓸모가 있고, 세로 공간이 남아서 항목을 줄일 이유도 없다.
 *
 * 상단 바(2026-09 리디자인)는 "내 매장 / 재고" 같은 현재 위치와 오늘 날짜만
 * 보여준다. 검색이나 알림 같은 걸 넣지 않는 이유: 이 앱의 검색은 화면마다
 * 대상이 다르고(재고는 상품, 기록은 내역), 전역 검색 하나로 뭉치면 어느 결과가
 * 나올지 예측이 안 된다.
 */
export function DesktopShell({
  storeName,
  userName,
  children,
  onSignOut,
}: {
  storeName: string
  userName: string | null
  children: React.ReactNode
  onSignOut: React.ReactNode
}) {
  const pathname = usePathname()
  const current = NAV.find((item) => isActive(pathname, item.href))
  const initial = (userName ?? '사용자').trim().charAt(0) || '사'

  return (
    <div className="flex min-h-full flex-1">
      <aside className="bg-surface-nav border-border-base sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r px-4 pt-7 pb-5">
        <div className="flex items-center gap-3 px-2 pb-7">
          {/* 로고 자리. 이미지가 없으니 가게 첫 글자로 대신한다 — 사이드바 맨 위가
              글자만 있으면 메뉴의 한 항목처럼 보여서 "여기가 시작"이라는 표시가 필요하다. */}
          <span
            aria-hidden
            className="bg-primary text-primary-ink inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg font-semibold"
          >
            {storeName.trim().charAt(0) || 'Z'}
          </span>
          <div className="min-w-0">
            <div className="text-ink truncate text-sm font-semibold">{storeName}</div>
            <div className="text-ink-subtle mt-0.5 text-[0.625rem] tracking-[0.2em]">
              ZERO STORE
            </div>
          </div>
        </div>

        <p className="text-ink-subtle px-3 pb-2 text-[0.625rem] font-bold tracking-[0.18em]">
          WORKSPACE
        </p>
        <nav aria-label="주요 메뉴" className="flex-1">
          <ul className="flex flex-col gap-1">
            {NAV.map((item) => {
              const active = isActive(pathname, item.href)
              const Icon = item.icon
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
                      active
                        ? 'bg-primary-soft text-primary font-semibold'
                        : 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
                    )}
                  >
                    <Icon size={18} aria-hidden />
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="border-border-base flex items-center gap-2 border-t px-1 pt-4">
          <span
            aria-hidden
            className="bg-surface-sunken text-primary inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
          >
            {initial}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-ink truncate text-sm">{userName ?? '사용자'}</div>
            <div className="text-ink-subtle truncate text-[0.625rem] whitespace-nowrap">매장 관리자</div>
          </div>
          {onSignOut}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-border-base bg-surface/70 flex h-14 shrink-0 items-center justify-between border-b px-8 backdrop-blur">
          <p className="text-ink-muted flex items-center gap-2 text-xs">
            <span>내 매장</span>
            <span aria-hidden>/</span>
            <span className="text-ink font-medium">{current?.label ?? '홈'}</span>
          </p>
          <TodayLabel />
        </header>
        <main className="mx-auto w-full max-w-[1500px] min-w-0 flex-1 px-8 py-7">
          {children}
        </main>
      </div>
    </div>
  )
}

/**
 * 상단 바의 오늘 날짜. 서버가 아니라 브라우저 시계로 만든다 — 한 화면을 며칠씩
 * 켜 두는 매장 PC 에서 서버 렌더 시각이 굳어 있으면 어제 날짜가 남는다.
 * 서버와 브라우저의 날짜가 자정 근처에 어긋날 수 있어 하이드레이션 경고는 끈다.
 */
function TodayLabel() {
  const label = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })
  return (
    <span className="text-ink-subtle text-xs" suppressHydrationWarning>
      {label}
    </span>
  )
}
