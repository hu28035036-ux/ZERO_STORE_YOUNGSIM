// 환경변수는 한 곳에서만 읽는다.
//
// 값이 없으면 런타임에 "Invalid API key" 같은 엉뚱한 메시지로 터진다.
// 여기서 미리 끊어 무엇을 안 넣었는지 바로 알려준다.

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `환경변수 ${name} 가 없습니다. .env.example 을 참고해 .env.local 에 넣으세요.`,
    )
  }
  return value
}

// NEXT_PUBLIC_ 변수는 빌드 타임에 문자열로 치환된다.
// process.env[name] 처럼 동적으로 접근하면 치환이 안 되므로 반드시 전체 이름을 쓴다.
export const SUPABASE_URL = required(
  'NEXT_PUBLIC_SUPABASE_URL',
  process.env.NEXT_PUBLIC_SUPABASE_URL,
)

// 레거시 anon JWT 가 아니라 신형 publishable 키(sb_publishable_...).
// 둘 다 공개되어도 안전한 키이고, 실제 권한은 RLS 가 결정한다.
export const SUPABASE_PUBLISHABLE_KEY = required(
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
)
