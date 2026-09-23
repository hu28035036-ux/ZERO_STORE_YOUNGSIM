'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/cn'
import { isActive, NAV } from '@/lib/nav'

/**
 * 데스크톱 셸: 상단 바 + 탭 내비 + 본문 (2026-09-21 2차 리디자인, A2 Vercel 식).
 *
 * 사이드바를 없앤 이유: 재고 표가 이 앱의 중심인데 사이드바 224px 가 표의
 * 가로폭을 먹어 상품명이 두 줄로 꺾였다. 메뉴는 여섯 개뿐이라 위로 올려도
 * 한 줄에 다 들어간다. 활성 탭은 검정 밑줄 — 색이 아니라 위치로 말한다.
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

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="bg-surface-nav border-border-base sticky top-0 z-20 border-b">
        <div className="mx-auto flex h-14 w-full max-w-[1280px] items-center justify-between px-7">
          <div className="flex min-w-0 items-center gap-3">
            <Brand storeName={storeName} />
            <p className="text-ink-subtle ml-3 hidden items-center gap-2 text-xs sm:flex">
              <span aria-hidden>/</span>
              <span className="text-ink font-semibold">{current?.label ?? '홈'}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <TodayLabel />
            {onSignOut}
            <span
              aria-hidden
              className="bg-primary-soft text-primary inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold"
            >
              {(userName ?? '사용자').trim().charAt(0) || '사'}
            </span>
          </div>
        </div>
        <TabNav pathname={pathname} />
      </header>

      <main className="mx-auto w-full max-w-[1280px] min-w-0 flex-1 px-7 py-7">{children}</main>
    </div>
  )
}

export function Brand({ storeName }: { storeName: string }) {
  return (
    <Link href="/" className="flex min-w-0 items-center gap-2.5">
      {/* 로고 자리. 이미지가 없으니 가게 첫 글자. 검정 사각형이 상단 바의 닻이 된다. */}
      <span
        aria-hidden
        className="bg-ink-strong text-ink-inverted inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm font-bold"
      >
        {storeName.trim().charAt(0) || 'Z'}
      </span>
      <span className="text-ink truncate text-sm font-bold">{storeName}</span>
      <span className="text-ink-subtle hidden text-[0.625rem] tracking-[0.2em] sm:inline">
        ZERO STORE
      </span>
    </Link>
  )
}

/**
 * 탭 내비. 모바일 셸도 같은 것을 쓴다 — 목업에서 위·아래 두 셸이 같은 탭을
 * 쓰기로 했다(A2). 활성은 검정 밑줄, hover 는 6% 상태 레이어.
 */
export function TabNav({
  pathname,
  items = NAV,
  compact = false,
}: {
  pathname: string
  items?: typeof NAV
  compact?: boolean
}) {
  return (
    <nav
      aria-label="주요 메뉴"
      className={cn('mx-auto w-full max-w-[1280px]', compact ? 'px-1' : 'overflow-x-auto px-4')}
    >
      {/* compact(휴대폰)는 탭 다섯 개를 같은 폭으로 나눠 390px 에 다 넣는다. 가로
          스크롤로 두면 마지막 탭(설정)이 있는 줄도 모르고 지나간다 — 실제로 잘렸다. */}
      <ul className={cn('flex', compact ? 'w-full' : 'gap-0.5')}>
        {items.map((item) => {
          const active = isActive(pathname, item.href)
          const Icon = item.icon
          return (
            <li key={item.href} className={compact ? 'min-w-0 flex-1' : 'shrink-0'}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex items-center rounded-t-lg font-medium transition-colors',
                  compact
                    ? 'h-11 flex-col justify-center gap-0.5 px-0 text-[0.6875rem]'
                    : 'h-11 gap-2 px-3 text-sm',
                  'hover:bg-ink/[0.06] active:bg-ink/[0.12]',
                  active ? 'text-ink-strong font-semibold' : 'text-ink-muted',
                  // 밑줄. 색이 아니라 자리로 "여기" 를 말한다.
                  'after:bg-ink-strong after:absolute after:-bottom-px after:h-0.5 after:origin-center after:scale-x-0 after:transition-transform after:duration-200',
                  compact ? 'after:inset-x-3' : 'after:inset-x-2',
                  active && 'after:scale-x-100',
                )}
              >
                <Icon size={compact ? 16 : 18} aria-hidden />
                {compact ? (item.tabLabel ?? item.label) : item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

/**
 * 상단 바의 오늘 날짜. 서버가 아니라 브라우저 시계로 만든다 — 한 화면을 며칠씩
 * 켜 두는 매장 PC 에서 서버 렌더 시각이 굳어 있으면 어제 날짜가 남는다.
 */
function TodayLabel() {
  const label = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  })
  return (
    <span className="text-ink-subtle hidden text-xs md:inline" suppressHydrationWarning>
      {label}
    </span>
  )
}
