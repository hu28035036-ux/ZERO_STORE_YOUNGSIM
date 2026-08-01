import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'

import { toCategoryOptions } from '../categories'
import { ProductImportFlow } from './import-flow'

export const metadata = { title: '상품 파일로 등록' }

/**
 * 본사 발주 시트(초도·신제품) 일괄 등록. 파일 읽기부터 확정까지 전부
 * 클라이언트 상태기계(ProductImportFlow)가 맡고, 서버는 중복 확인·확정
 * 액션으로만 관여한다 — 판매 임포트와 같은 구도.
 */
export default async function ProductImportPage() {
  const supabase = await createClient()

  const [categories, settings] = await Promise.all([
    supabase.from('categories').select('id, name, parent_id'),
    supabase.from('app_settings').select('default_low_stock').maybeSingle(),
  ])

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
        <h1 className="text-ink text-lg font-semibold tracking-tight">
          상품 파일로 등록
        </h1>
      </div>

      <ProductImportFlow
        categories={toCategoryOptions(categories.data ?? [])}
        defaultLowStock={settings.data?.default_low_stock ?? 0}
      />
    </div>
  )
}
