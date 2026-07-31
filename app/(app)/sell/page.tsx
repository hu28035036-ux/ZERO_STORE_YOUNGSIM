import { redirect } from 'next/navigation'

/**
 * 옛 계산대 주소. 판매가 "기록"으로 재편되면서 /sales 로 옮겼다.
 *
 * 북마크·홈 화면 아이콘이 이 주소를 물고 있을 수 있어 한 릴리스 동안만 남긴다.
 * 다음에 화면을 크게 손볼 때 지워라.
 */
export default function SellRedirect() {
  redirect('/sales')
}
