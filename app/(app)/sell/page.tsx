import { NotBuiltYet } from '@/components/ui/not-built-yet'

export const metadata = { title: '판매' }

export default function SellPage() {
  return (
    <NotBuiltYet
      title="판매"
      plan="바코드를 찍어 장바구니에 담고 한 번에 판매를 등록합니다. 저장은 record_sale() 하나로 끝나고, 영수증 단위로 묶여 객단가와 판매 건수가 통계에 잡힙니다."
    />
  )
}
