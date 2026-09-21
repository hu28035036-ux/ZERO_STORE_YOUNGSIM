import { PageHeader } from '@/components/ui/page-header'
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
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="INVENTORY"
        title="상품 파일로 등록"
        backHref="/stock"
        backLabel="재고로 돌아가기"
      />

      <ProductImportFlow
        categories={toCategoryOptions(categories.data ?? [])}
        defaultLowStock={settings.data?.default_low_stock ?? 0}
      />
    </div>
  )
}
