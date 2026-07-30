import 'server-only'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

import type { Database } from '@/lib/database.types'

import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './env'

/**
 * 서버 렌더링 / 서버 액션용 Supabase 클라이언트.
 *
 * 요청마다 새로 만들어야 한다. 모듈 수준에 하나 만들어 재사용하면 다른 사용자의
 * 세션이 섞인다.
 */
export async function createClient() {
  // Next.js 16 에서 cookies() 는 비동기다.
  const cookieStore = await cookies()

  return createServerClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // 서버 컴포넌트에서는 쿠키를 쓸 수 없어 여기서 예외가 난다.
          // 토큰 갱신은 proxy.ts 가 이미 처리했으므로 무시해도 안전하다.
          // (proxy 가 없다면 이 침묵이 곧 무한 로그아웃 버그가 된다)
        }
      },
    },
  })
}
