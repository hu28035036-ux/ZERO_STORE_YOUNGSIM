import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'

import { toCategoryOptions } from '../../categories'
import { EditProductForm, type EditVariant } from './edit-form'

export const metadata = { title: '상품 수정' }

export default async function EditProductPage({
  params,
}: {
  // Next.js 16 에서 params 는 Promise 다.
  params: Promise<{ productId: string }>
}) {
  const { productId } = await params
  const supabase = await createClient()

  const [product, rows, categories] = await Promise.all([
    supabase
      .from('products')
      .select('id, name, category_id, description')
      .eq('id', productId)
      .maybeSingle(),
    // 변형 값과 재고·원가를 한 번에 받으려고 뷰를 쓴다. 옵션 라벨도 뷰가 만든다.
    supabase
      .from('v_variant_stock')
      .select(
        'variant_id, option_label, sale_price, low_stock_threshold, barcode, stock_qty, cost_price',
      )
      .eq('product_id', productId),
    supabase.from('categories').select('id, name, parent_id'),
  ])

  if (!product.data) notFound()

  const options = toCategoryOptions(categories.data ?? [])

  const variants: EditVariant[] = (rows.data ?? []).map((v) => ({
    variantId: v.variant_id!,
    label: v.option_label ?? '옵션 없음',
    salePrice: String(v.sale_price ?? 0),
    lowStockThreshold: String(v.low_stock_threshold ?? 0),
    barcode: v.barcode ?? '',
    stockQty: v.stock_qty ?? 0,
    costPrice: Number(v.cost_price ?? 0),
  }))

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
        <h1 className="text-ink text-lg font-semibold tracking-tight">상품 수정</h1>
      </div>

      <EditProductForm
        productId={product.data.id}
        initialName={product.data.name}
        initialCategoryId={product.data.category_id ?? ''}
        initialDescription={product.data.description ?? ''}
        categories={options}
        initialVariants={variants}
      />
    </div>
  )
}
