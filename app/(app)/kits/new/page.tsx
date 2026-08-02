import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

import { KitForm } from '../kit-form'

export const metadata = { title: '박스 만들기' }

export default function NewKitPage() {
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
        <h1 className="text-ink text-xl font-semibold tracking-tight">박스 만들기</h1>
      </div>
      <KitForm kitId={null} initialName="" initialNote="" initialItems={[]} />
    </div>
  )
}
