/**
 * 아이디 ↔ 이메일 변환.
 *
 * Supabase Auth 는 이메일로만 로그인한다. 그런데 이 앱을 쓰는 곳은 가게 계산대라
 * "cwyh5088@..." 을 매번 치는 것이 번거롭다. 그래서 화면에서는 아이디만 받고
 * 서버에서 고정 도메인을 붙여 이메일을 만든다. Auth 쪽에는 여전히 이메일이 저장되고
 * auth.users.email 이 곧 `<아이디>@<도메인>` 이 된다.
 *
 * 도메인을 바꾸면 기존 계정이 전부 로그인 불가가 된다 — auth.users.email 을 같이
 * 바꾸지 않는 한 만들어지는 이메일이 달라지기 때문이다. 바꿀 일이 있으면 DB 의
 * 이메일도 함께 옮겨야 한다.
 */
export const USERNAME_DOMAIN = 'zerostore.kr'

/**
 * 아이디를 로그인에 쓸 이메일로 만든다.
 *
 * 이미 @ 가 들어 있으면 그대로 둔다. 습관적으로 전체 주소를 치는 경우에
 * `id@도메인@도메인` 이 되는 것을 막고, 나중에 진짜 메일 주소를 쓰는 계정을
 * 만들더라도 이 함수를 거쳐 로그인할 수 있게 하려는 것이다.
 */
export function usernameToEmail(input: string): string {
  const v = input.trim().toLowerCase()
  return v.includes('@') ? v : `${v}@${USERNAME_DOMAIN}`
}
