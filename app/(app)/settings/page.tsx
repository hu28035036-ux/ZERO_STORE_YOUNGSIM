import { NotBuiltYet } from '@/components/ui/not-built-yet'

export const metadata = { title: '설정' }

export default function SettingsPage() {
  return (
    <NotBuiltYet
      title="설정"
      plan="가게 이름, 재고 부족 기준, 카테고리와 거래처 관리. 재고 캐시가 원장과 어긋났을 때 recalc_stock() 을 부르는 버튼도 여기 둡니다."
    />
  )
}
