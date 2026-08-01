import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'

import { Card } from '@/components/ui/card'
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

  const [product, rows, categories, channelRows] = await Promise.all([
    supabase
      .from('products')
      .select('id, name, category_id, channel, description')
      .eq('id', productId)
      .maybeSingle(),
    // 변형 값과 재고·원가를 한 번에 받으려고 뷰를 쓴다. 옵션 라벨도 뷰가 만든다.
    supabase
      .from('v_variant_stock')
      .select(
        'variant_id, option_label, sale_price, low_stock_threshold, barcode, stock_qty, cost_price, units_per_pack',
      )
      .eq('product_id', productId),
    supabase.from('categories').select('id, name, parent_id'),
    // PostgREST 에는 distinct 가 없다. 상품 수백 개 규모라 다 받아 여기서 거른다.
    supabase.from('products').select('channel').not('channel', 'is', null),
  ])

  const header = (
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
  )

  // "없음"과 "실패"를 반드시 가른다. maybeSingle() 은 조회가 진짜 실패해도
  // (네트워크 끊김, RLS 거부, PostgREST 오류) product.data 를 null 로 준다.
  // 이 둘을 안 가르면 진짜 오류가 "이 상품은 없습니다" 404 로 둔갑해서,
  // 원인을 못 찾고 엉뚱한 데서 헤매게 된다 — 로그인 실패 문구가 네트워크
  // 장애를 비밀번호 탓으로 돌렸던 사고(73d896e)와 같은 종류의 함정이다.
  const loadError = product.error ?? rows.error
  if (loadError) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <Card className="p-5">
          <p className="text-danger text-sm font-medium">상품을 불러오지 못했습니다.</p>
          <p className="text-ink-muted mt-1.5 text-sm">{loadError.message}</p>
        </Card>
      </div>
    )
  }

  // 조회 자체는 성공했는데 행이 없는 경우만 진짜 404 다.
  if (!product.data) notFound()

  // 카테고리 조회 실패는 화면을 막을 이유가 아니다. product/rows 와 달리
  // "이 상품을 못 열었다"가 아니라 카테고리 선택지가 줄어드는 정도라, 조용히
  // 빈 목록으로 넘어가도 수정 자체는 할 수 있다.
  const options = toCategoryOptions(categories.data ?? [])

  const variants: EditVariant[] = (rows.data ?? []).map((v) => ({
    variantId: v.variant_id!,
    label: v.option_label ?? '옵션 없음',
    salePrice: String(v.sale_price ?? 0),
    lowStockThreshold: String(v.low_stock_threshold ?? 0),
    unitsPerPack: v.units_per_pack != null ? String(v.units_per_pack) : '',
    barcode: v.barcode ?? '',
    stockQty: v.stock_qty ?? 0,
    costPrice: Number(v.cost_price ?? 0),
  }))

  const channels = [
    ...new Set((channelRows.data ?? []).map((r) => r.channel).filter((v): v is string => !!v)),
  ].sort((a, b) => a.localeCompare(b, 'ko'))

  return (
    <div className="flex flex-col gap-4">
      {header}

      <EditProductForm
        productId={product.data.id}
        initialName={product.data.name}
        initialCategoryId={product.data.category_id ?? ''}
        initialChannel={product.data.channel ?? ''}
        initialDescription={product.data.description ?? ''}
        categories={options}
        channels={channels}
        initialVariants={variants}
      />
    </div>
  )
}
