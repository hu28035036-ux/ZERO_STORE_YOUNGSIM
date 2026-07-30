'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { createClient } from '@/lib/supabase/server'

// 가입 화면은 없다. 같이 쓰는 사람만 들어오는 가게 앱이라
// 계정은 Supabase 대시보드에서 초대로 만든다. 열어두면 관리할 일만 는다.
const schema = z.object({
  email: z.email({ error: '이메일 형식이 아닙니다' }),
  password: z.string().min(1, { error: '비밀번호를 입력하세요' }),
})

export type LoginState = { error: string } | null

/**
 * 로그인 후 돌아갈 경로를 안전하게 고른다.
 *
 * proxy 가 붙여준 ?next= 를 그대로 믿고 리다이렉트하면 오픈 리다이렉트가 된다.
 * (`/login?next=https://피싱사이트` 링크를 문자로 뿌리는 수법)
 * 슬래시 하나로 시작하는 내부 경로만 통과시킨다. `//evil.com` 은 프로토콜 상대
 * URL 이라 외부로 나가므로 함께 막는다.
 */
function safeNext(next: FormDataEntryValue | null): string {
  if (typeof next !== 'string') return '/'
  if (!next.startsWith('/') || next.startsWith('//')) return '/'
  return next
}

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = schema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)

  if (error) {
    // 어느 쪽이 틀렸는지 알려주지 않는다. 알려주면 가입된 이메일 목록을
    // 알아내는 데 쓸 수 있다.
    return { error: '이메일 또는 비밀번호가 올바르지 않습니다' }
  }

  // 레이아웃까지 무효화해야 셸에 박힌 사용자 이름이 새로 그려진다.
  revalidatePath('/', 'layout')

  // redirect() 는 내부적으로 예외를 던져 흐름을 끊는다. try/catch 안에 두면
  // 그 예외를 삼켜서 리다이렉트가 조용히 사라진다.
  redirect(safeNext(formData.get('next')))
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}
