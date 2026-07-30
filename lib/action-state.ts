/**
 * 서버 액션이 화면에 돌려주는 결과.
 *
 * 성공도 말해야 한다. 설정 화면처럼 저장해도 화면이 거의 그대로인 곳에서는
 * 아무 반응이 없으면 눌린 건지 아닌지 알 수가 없다.
 */
export type ActionState =
  | null
  | { status: 'ok'; message: string }
  | { status: 'error'; message: string }

export function ok(message: string): ActionState {
  return { status: 'ok', message }
}

export function fail(message: string): ActionState {
  return { status: 'error', message }
}
