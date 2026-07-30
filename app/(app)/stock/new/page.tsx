import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'

import { toCategoryOptions } from '../categories'
import { ProductForm } from './product-form'

export const metadata = { title: '상품 등록' }

export default async function NewProductPage() {
  const supabase = await createClient()

  const [categories, settings] = await Promise.all([
    supabase.from('categories').select('id, name, parent_id'),
    supabase.from('app_settings').select('default_low_stock').maybeSingle(),
  ])

  const options = toCategoryOptions(categories.data ?? [])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link
          href="/stock"
          aria-label="재고로 돌아가기"
          className="text-ink-muted hover:bg-surface-sunken hover:text-ink -ml-2 inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors"
        >
          <ChevronLeft size={20} aria-hidden />
        </Link>
        <h1 className="text-ink text-lg font-semibold tracking-tight">상품 등록</h1>
      </div>

      <ProductForm
        categories={options}
        defaultLowStock={settings.data?.default_low_stock ?? 0}
      />
    </div>
  )
}
