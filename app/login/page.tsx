import type { Metadata } from 'next'

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
        <div className="mb-6 text-center">
          <h1 className="text-ink text-2xl font-semibold tracking-tight">
            ZERO STORE
          </h1>
          <p className="text-ink-muted mt-1 text-sm">영심 스토어 재고 관리</p>
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
