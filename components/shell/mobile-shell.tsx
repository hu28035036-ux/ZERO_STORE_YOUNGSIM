'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/cn'
import { isActive, TABS } from '@/lib/nav'

/**
 * 휴대폰 셸: 상단 제목 + 하단 탭.
 *
 * 탭을 아래에 두는 이유는 단순하다. 계산대에서는 한 손으로 폰을 쥐고
 * 엄지로만 조작한다. 화면 위쪽은 엄지가 닿지 않는다.
 */
export function MobileShell({
  storeName,
  signOut,
  children,
}: {
  storeName: string
  signOut: React.ReactNode
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="bg-surface border-border-base sticky top-0 z-10 flex items-center justify-between gap-3 border-b px-4 py-3">
        <h1 className="text-ink truncate text-base font-semibold">{storeName}</h1>
        {signOut}
      </header>

      {/* 하단 탭이 콘텐츠를 가리지 않도록 탭 높이 + 홈 인디케이터만큼 비운다. */}
      <main className="flex-1 px-4 py-4 pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
        {children}
      </main>

      <nav
        aria-label="주요 메뉴"
        className={cn(
          'bg-surface border-border-base fixed inset-x-0 bottom-0 z-20 border-t',
          // 아이폰 홈 인디케이터 영역을 피한다. 없으면 맨 아래 탭이 눌리지 않는다.
          'pb-[env(safe-area-inset-bottom)]',
        )}
      >
        <ul className="flex">
          {TABS.map((item) => {
            const active = isActive(pathname, item.href)
            const Icon = item.icon
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-touch-lg flex-col items-center justify-center gap-0.5',
                    active ? 'text-primary' : 'text-ink-subtle',
                  )}
                >
                  <Icon size={20} aria-hidden />
                  <span className="text-[0.6875rem] font-medium">{item.label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
