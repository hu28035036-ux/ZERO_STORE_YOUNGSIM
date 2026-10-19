import type { Metadata } from 'next'

import { BrandLogo } from '@/components/shell/brand-logo'
import { Card } from '@/components/ui/card'

import { LoginForm } from './login-form'

export const metadata: Metadata = { title: '로그인' }

export default async function LoginPage({
  searchParams,
}: {
  // Next.js 15 부터 searchParams 는 Promise 다.
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          {/* 상단 바(32px)보다 크게 둔다. 이 화면에서는 로고가 첫인상인데, 선이 가는 그림이라
              작으면 무슨 그림인지 안 읽힌다. */}
          <BrandLogo size={56} className="mb-4" />
          <p className="text-primary text-[0.6875rem] font-bold tracking-[0.18em]">ZERO STORE</p>
          <h1 className="text-ink mt-1.5 text-2xl font-semibold tracking-tight">
            영심 스토어 재고 관리
          </h1>
          <p className="text-ink-muted mt-1.5 text-sm">아이디와 비밀번호로 로그인하세요.</p>
        </div>

        <Card className="p-6">
          <LoginForm next={next ?? '/'} />
        </Card>

        <p className="text-ink-subtle mt-4 text-center text-xs">
          계정은 관리자가 만들어 드립니다.
        </p>
      </div>
    </main>
  )
}
