import { NotBuiltYet } from '@/components/ui/not-built-yet'

export const metadata = { title: '재고' }

export default function StockPage() {
  return (
    <NotBuiltYet
      title="재고"
      plan="v_variant_stock 을 그대로 씁니다. 휴대폰에서는 카드 목록, 데스크톱에서는 정렬 가능한 표로 같은 데이터를 보여줍니다."
    />
  )
}
