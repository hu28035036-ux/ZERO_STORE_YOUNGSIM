'use client'

import { useActionState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'

import { login, type LoginState } from './actions'

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    login,
    null,
  )

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />

      <Input
        label="이메일"
        name="email"
        type="email"
        // 계산대에서 아이디를 매번 치지 않도록 자동완성을 살려둔다.
        autoComplete="username"
        autoCapitalize="none"
        required
        placeholder="you@example.com"
      />

      <Input
        label="비밀번호"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />

      {/* aria-live 로 오류가 뜰 때 스크린리더가 읽게 한다. */}
      <p aria-live="polite" className="min-h-5 text-sm">
        {state?.error ? <span className="text-danger">{state.error}</span> : null}
      </p>

      <Button type="submit" size="lg" full disabled={pending}>
        {pending ? '확인 중…' : '로그인'}
      </Button>
    </form>
  )
}
