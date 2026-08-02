import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'

import { ActionForm } from '@/components/ui/action-form'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/server'

import { archiveKit } from '../actions'
import { KitForm } from '../kit-form'

export const metadata = { title: '박스 고치기' }

export default async function EditKitPage({
  params,
}: {
  params: Promise<{ kitId: string }>
}) {
  const { kitId } = await params
  const supabase = await createClient()

  const [kit, items] = await Promise.all([
    supabase.from('kits').select('id, name, note').eq('id', kitId).maybeSingle(),
    supabase.from('v_kit_items').select('*').eq('kit_id', kitId).order('sort_order'),
  ])

  if (!kit.data) notFound()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link
          href="/kits"
          aria-label="박스 목록으로"
          className="text-ink-muted hover:bg-surface-sunken hover:text-ink -ml-2 inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-ink text-xl font-semibold tracking-tight">박스 고치기</h1>
      </div>

      <KitForm
        kitId={kit.data.id}
        initialName={kit.data.name}
        initialNote={kit.data.note ?? ''}
        initialItems={items.data ?? []}
      />

      <Card>
        <CardHeader>
          <CardTitle>목록에서 감추기</CardTitle>
          <p className="text-ink-muted text-sm">
            더 안 들어오는 박스는 감춰 두세요. 이미 넣은 입고 기록은 그대로 남습니다.
          </p>
        </CardHeader>
        <CardBody>
          <ActionForm
            action={archiveKit}
            submitLabel="감추기"
            submitVariant="ghost"
            confirmLabel="정말 감출까요?"
          >
            <input type="hidden" name="kitId" value={kit.data.id} />
          </ActionForm>
        </CardBody>
      </Card>
    </div>
  )
}
