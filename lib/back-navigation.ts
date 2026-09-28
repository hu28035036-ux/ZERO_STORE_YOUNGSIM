/**
 * 상단 바 "뒤로가기"의 행선지. 버튼(components/shell/back-button.tsx)은 이 답대로 움직이기만 한다.
 *
 * 이 탭에서 처음 연 화면(새 탭, 설치한 앱을 막 켠 때)에서 history.back() 은 아무 일도 안 해서
 * 버튼이 고장 난 것처럼 보인다 — 그때는 홈으로 간다. `canGoBack`(Navigation API)을 먼저 믿는
 * 이유: history.length 는 "앞으로" 칸까지 세서, 한 번 뒤로 간 뒤에는 돌아갈 곳이 없어도
 * 2 이상이다. 그 API 가 없는 브라우저에서만 길이로 가늠한다.
 */
export function backAction(env: { canGoBack?: boolean; historyLength: number }): 'back' | 'home' {
  if (typeof env.canGoBack === 'boolean') return env.canGoBack ? 'back' : 'home'
  return env.historyLength > 1 ? 'back' : 'home'
}
