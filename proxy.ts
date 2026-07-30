import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { DEVICE_COOKIE, DEVICE_HEADER, detectDevice, isDevice } from '@/lib/device'
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '@/lib/supabase/env'

// Next.js 16 부터 middleware 는 proxy 로 이름이 바뀌었다.
// 파일 이름이 middleware.ts 면 조용히 실행되지 않고, 그러면 세션 갱신이 멈춰
// 로그인이 몇 분 만에 풀리는 증상으로 나타난다. (기존 코드는 codemod 로 옮긴다:
//  npx @next/codemod@canary middleware-to-proxy .)

/** 로그인 없이 열 수 있는 경로 */
const PUBLIC_PATHS = ['/login', '/auth']

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )
}

export async function proxy(request: NextRequest) {
  // ---------------------------------------------------------------------------
  // 1. 기기 판별 결과를 요청 헤더에 실어 보낸다.
  //    쿠키(사용자가 직접 고른 값)가 있으면 그것이 UA 추정을 이긴다.
  // ---------------------------------------------------------------------------
  const override = request.cookies.get(DEVICE_COOKIE)?.value
  const device = isDevice(override)
    ? override
    : detectDevice(request.headers.get('user-agent'))

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set(DEVICE_HEADER, device)

  // NextResponse.next({ request: { headers } }) 여야 헤더가 앱 쪽으로 넘어간다.
  // NextResponse.next({ headers }) 는 브라우저로 나가는 응답 헤더라 쓸모가 없다.
  let response = NextResponse.next({ request: { headers: requestHeaders } })

  // ---------------------------------------------------------------------------
  // 2. 세션 갱신. proxy 가 존재하는 진짜 이유다.
  //    서버 컴포넌트는 쿠키를 쓸 수 없어서 갱신된 토큰을 저장할 데가 여기뿐이다.
  // ---------------------------------------------------------------------------
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        // 요청 쪽에도 반영해 둔다. 이 요청을 이어서 처리하는 코드가
        // 방금 갱신된 토큰을 보게 하기 위해서다.
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }

        response = NextResponse.next({ request: { headers: requestHeaders } })

        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }

        // 라이브러리가 넘겨주는 no-store 계열 헤더. 빠뜨리면 CDN 이 Set-Cookie 가
        // 붙은 응답을 캐시해서 남의 세션 토큰이 다른 사람에게 나갈 수 있다.
        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value)
        }
      },
    },
  })

  // getUser() 는 매 요청 Auth 서버로 왕복한다. getClaims() 는 비대칭 서명 키를 쓰면
  // JWKS 를 캐시해 로컬에서 검증한다. proxy 는 모든 요청에서 도니까 이쪽을 쓴다.
  // (대칭 키 프로젝트면 자동으로 getUser() 와 같은 왕복으로 내려간다)
  const { data } = await supabase.auth.getClaims()
  const signedIn = Boolean(data?.claims)

  // ---------------------------------------------------------------------------
  // 3. 통과 / 되돌리기
  // ---------------------------------------------------------------------------
  const { pathname } = request.nextUrl

  if (!signedIn && !isPublic(pathname)) {
    // 로그인 후 원래 가려던 곳으로 돌려보내기 위해 경로를 들려 보낸다.
    const target = new URL('/login', request.url)
    if (pathname !== '/') target.searchParams.set('next', pathname)
    return redirectKeepingCookies(target, response)
  }

  if (signedIn && pathname === '/login') {
    return redirectKeepingCookies(new URL('/', request.url), response)
  }

  return response
}

/**
 * 리다이렉트하면서 갱신된 인증 쿠키를 함께 들고 간다.
 *
 * 새 응답을 그냥 만들어 반환하면 위에서 setAll 이 심어둔 Set-Cookie 가 사라진다.
 * 그러면 토큰 갱신이 유실되고, 로그인하자마자 다시 로그인 화면으로 튕기는
 * 무한 루프가 된다. Supabase + Next 조합에서 가장 흔한 함정이다.
 */
function redirectKeepingCookies(target: URL, carrying: NextResponse) {
  const redirect = NextResponse.redirect(target)

  for (const cookie of carrying.cookies.getAll()) {
    redirect.cookies.set(cookie)
  }
  for (const [key, value] of carrying.headers) {
    if (key.toLowerCase().startsWith('cache-control') || key.toLowerCase() === 'pragma') {
      redirect.headers.set(key, value)
    }
  }

  return redirect
}

export const config = {
  matcher: [
    /*
     * 정적 파일만 빼고 전부 태운다. 인증은 넓게 거는 편이 안전하다.
     *
     * 주의: 서버 액션은 별도 경로가 아니라 그 액션이 놓인 라우트로 가는 POST 다.
     * 즉 여기서 제외한 경로는 서버 액션 호출도 함께 빠진다. proxy 를 최종
     * 방어선으로 삼지 말고 액션 안에서 반드시 다시 확인할 것 (lib/auth.ts).
     */
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|wasm)$).*)',
  ],
}
