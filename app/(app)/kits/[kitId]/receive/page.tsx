import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
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
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link
          href="/kits"
          aria-label="박스 목록으로"
          className="text-ink-muted hover:bg-surface-sunken hover:text-ink -ml-2 inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-ink truncate text-xl font-semibold tracking-tight">
            {kit.data.name}
          </h1>
          <p className="text-ink-subtle text-xs">박스 입고</p>
        </div>
      </div>

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
