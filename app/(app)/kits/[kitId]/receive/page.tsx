import { notFound } from 'next/navigation'

import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/page-header'
import { todayInSeoul } from '@/lib/constants'

import { ReceiveForm } from './receive-form'

export const metadata = { title: '박스 입고' }

export default async function ReceiveKitPage({
  params,
}: {
  params: Promise<{ kitId: string }>
}) {
  const { kitId } = await params
  const supabase = await createClient()

  const [kit, items, suppliers] = await Promise.all([
    supabase.from('kits').select('id, name, note').eq('id', kitId).maybeSingle(),
    supabase.from('v_kit_items').select('*').eq('kit_id', kitId).order('sort_order'),
    supabase.from('suppliers').select('id, name').eq('is_active', true).order('name'),
  ])

  if (!kit.data) notFound()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="BOX RECEIVING"
        title={kit.data.name}
        description="박스 하나를 맛별 입고 전표 여러 장으로 폅니다. 실제로 다르게 왔으면 그 줄만 고치세요."
        backHref="/kits"
        backLabel="박스 목록으로"
      />

      <ReceiveForm
        kitId={kit.data.id}
        kitName={kit.data.name}
        items={items.data ?? []}
        suppliers={suppliers.data ?? []}
        today={todayInSeoul()}
      />
    </div>
  )
}
