import 'server-only'

import { redirect } from 'next/navigation'
import { cache } from 'react'

import { createClient } from '@/lib/supabase/server'

/**
 * 화면에 넘겨도 되는 최소 사용자 정보.
 *
 * JWT 클레임을 통째로 내려보내면 세션 ID 같은 것까지 클라이언트 번들에 실린다.
 * 필요한 것만 골라 담는다.
 */
export type SessionUser = {
  id: string
  email: string | null
}

/**
 * 현재 로그인 사용자. 없으면 null.
 *
 * React 의 cache() 로 감싸서 한 번의 렌더 패스 안에서는 몇 번을 불러도
 * 검증이 한 번만 돈다. 레이아웃과 페이지와 여러 컴포넌트가 각자 부르는 구조라
 * 이게 없으면 같은 요청에서 검증이 여러 번 반복된다.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient()

  // getClaims() 는 서명을 검증한다. getSession() 의 user 는 쿠키에서 그대로 읽은
  // 값이라 위조가 가능하므로 인가 판단에 쓰면 안 된다.
  const { data, error } = await supabase.auth.getClaims()
  if (error || !data?.claims) return null

  return {
    id: data.claims.sub,
    email: data.claims.email ?? null,
  }
})

/**
 * 로그인 필수 경계.
 *
 * proxy 에도 같은 검사가 있지만 그건 최적화이지 방어선이 아니다.
 * 서버 액션은 별도 라우트가 아니라 액션이 놓인 경로로 가는 POST 라서,
 * matcher 를 손대거나 액션을 다른 라우트로 옮기는 것만으로 proxy 검사가
 * 조용히 사라질 수 있다. 데이터를 만지는 쪽에서 매번 다시 확인한다.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) redirect('/login')
  return user
}

/** 처리자 이름 표시용. 없으면 이메일 아이디 부분으로 대신한다. */
export const getDisplayName = cache(async (): Promise<string | null> => {
  const user = await getSessionUser()
  if (!user) return null

  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .maybeSingle()

  return data?.display_name ?? user.email?.split('@')[0] ?? null
})
