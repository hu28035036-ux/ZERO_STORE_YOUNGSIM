import { logout } from '@/app/login/actions'
import { Button } from '@/components/ui/button'

/**
 * 서버 액션을 form 으로 부르기 때문에 클라이언트 컴포넌트가 아니다.
 * JS 가 아직 안 붙은 상태에서도 로그아웃이 동작한다.
 */
export function SignOutButton() {
  return (
    <form action={logout}>
      <Button type="submit" variant="ghost" size="sm">
        로그아웃
      </Button>
    </form>
  )
}
