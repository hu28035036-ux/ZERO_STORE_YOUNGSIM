'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/cn'
import { isActive, NAV } from '@/lib/nav'

/**
 * 데스크톱 셸: 왼쪽 사이드바 + 본문.
 *
 * 여기서는 홈을 포함한 전체 메뉴를 편다. 큰 화면에서는 요약 대시보드가
 * 실제로 쓸모가 있고, 세로 공간이 남아서 항목을 줄일 이유도 없다.
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

  return (
    <div className="flex min-h-full flex-1">
      <aside className="bg-surface border-border-base flex w-60 shrink-0 flex-col border-r">
        <div className="border-border-base border-b px-5 py-4">
          <div className="text-ink text-sm font-semibold">{storeName}</div>
          <div className="text-ink-subtle mt-0.5 text-xs">ZERO STORE</div>
        </div>

        <nav aria-label="주요 메뉴" className="flex-1 p-3">
          <ul className="flex flex-col gap-0.5">
            {NAV.map((item) => {
              const active = isActive(pathname, item.href)
              const Icon = item.icon
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex h-10 items-center gap-2.5 rounded-lg px-3 text-sm font-medium transition-colors',
                      active
                        ? 'bg-primary-soft text-primary'
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

        <div className="border-border-base flex items-center justify-between gap-2 border-t px-3 py-3">
          <span className="text-ink-muted truncate text-sm">{userName ?? '사용자'}</span>
          {onSignOut}
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-6">{children}</main>
    </div>
  )
}
