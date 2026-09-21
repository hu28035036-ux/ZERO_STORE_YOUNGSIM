
import { KitForm } from '../kit-form'
import { PageHeader } from '@/components/ui/page-header'

export const metadata = { title: '박스 만들기' }

export default function NewKitPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="STORE SETTINGS"
        title="박스 만들기"
        description="박스 이름과 안에 든 상품, 보통 몇 개씩 드는지를 적어 둡니다."
        backHref="/kits"
        backLabel="박스 목록으로"
      />
      <KitForm kitId={null} initialName="" initialNote="" initialItems={[]} />
    </div>
  )
}
