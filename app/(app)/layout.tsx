import { DesktopShell } from '@/components/shell/desktop-shell'
import { MobileShell } from '@/components/shell/mobile-shell'
import { SignOutButton } from '@/components/shell/sign-out-button'
import { getDisplayName, requireUser } from '@/lib/auth'
import { getDevice } from '@/lib/server-device'
import { createClient } from '@/lib/supabase/server'

/**
 * 로그인한 사람만 들어오는 구역.
 *
 * proxy 에도 같은 검사가 있지만 여기가 진짜 경계다. 레이아웃에서 한 번 막으면
 * 이 아래 모든 페이지가 함께 막힌다.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireUser()

  const [device, userName, storeName] = await Promise.all([
    getDevice(),
    getDisplayName(),
    getStoreName(),
  ])

  // 두 셸을 다 렌더링하고 CSS 로 숨기는 게 아니라, 서버에서 한쪽만 만든다.
  // 계산대 화면에 안 보이는 사이드바 마크업까지 실어 보낼 이유가 없다.
  if (device === 'mobile') {
    return (
      <MobileShell storeName={storeName} signOut={<SignOutButton />}>
        {children}
      </MobileShell>
    )
  }

  return (
    <DesktopShell
      storeName={storeName}
      userName={userName}
      onSignOut={<SignOutButton />}
    >
      {children}
    </DesktopShell>
  )
}

async function getStoreName() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('app_settings')
    .select('store_name')
    .maybeSingle()
  return data?.store_name ?? '영심 스토어'
}
