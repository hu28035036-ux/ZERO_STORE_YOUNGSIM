'use client'

import { usePathname } from 'next/navigation'

import { TABS } from '@/lib/nav'

import { Brand, TabNav } from './desktop-shell'

/**
 * 휴대폰 셸: 상단 제목 + 상단 탭 (2026-09-21 2차 리디자인, A2).
 *
 * 하단 탭에서 상단 탭으로 옮겼다. 사용자가 목업에서 위·아래 셸이 같은 탭
 * 모양을 쓰는 쪽을 골랐고, 판매 적기·박스 입고처럼 화면 아래에 큰 CTA 가
 * 고정되는 화면에서 하단 탭과 CTA 가 겹쳐 손가락이 헷갈리는 문제도 사라진다.
 * 대신 스크롤해도 탭이 따라오도록 헤더 전체를 sticky 로 둔다.
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
      <header className="bg-surface/90 border-border-base sticky top-0 z-10 border-b backdrop-blur">
        <div className="flex h-12 items-center justify-between gap-3 px-4">
          {/*
            가게 이름은 제목이 아니라 상표다. h1 로 두면 각 화면이 이미 갖고 있는
            제목과 h1 이 둘이 되고, 화면 제목("재고", "통계")이 문서의 최상위 제목
            자리를 빼앗긴다.
          */}
          <Brand storeName={storeName} />
          {signOut}
        </div>
        <TabNav pathname={pathname} items={TABS} compact />
      </header>

      {/* 하단 탭이 없어졌으므로 아래 여백은 sticky CTA 가 있는 화면이 스스로 잡는다. */}
      <main className="flex-1 px-4 py-4 pb-8">{children}</main>
    </div>
  )
}
