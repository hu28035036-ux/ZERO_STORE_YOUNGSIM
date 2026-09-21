import { PageHeader } from '@/components/ui/page-header'
import { createClient } from '@/lib/supabase/server'

import { toCategoryOptions } from '../categories'
import { ProductForm } from './product-form'

export const metadata = { title: '상품 등록' }

export default async function NewProductPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const supabase = await createClient()

  // 판매 임포트의 "못 찾은 상품 → 상품 등록" 에서 넘어온 POS 메뉴명.
  // 배열로 오는 경우(같은 키가 두 번)는 버린다 — 어느 쪽이 맞는지 알 수 없는데
  // 하나를 골라 채우면 다음 임포트가 엉뚱한 이름으로 걸린다.
  const posNameParam = (await searchParams).posName
  const defaultPosName = typeof posNameParam === 'string' ? posNameParam.slice(0, 200) : ''

  const [categories, settings, channelRows] = await Promise.all([
    supabase.from('categories').select('id, name, parent_id'),
    supabase.from('app_settings').select('default_low_stock').maybeSingle(),
    // PostgREST 에는 distinct 가 없다. 상품 수백 개 규모라 다 받아 여기서 거른다.
    supabase.from('products').select('channel').not('channel', 'is', null),
  ])

  const options = toCategoryOptions(categories.data ?? [])
  const channels = [
    ...new Set((channelRows.data ?? []).map((r) => r.channel).filter((v): v is string => !!v)),
  ].sort((a, b) => a.localeCompare(b, 'ko'))

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="INVENTORY"
        title="상품 등록"
        backHref="/stock"
        backLabel="재고로 돌아가기"
      />

      <ProductForm
        categories={options}
        channels={channels}
        defaultLowStock={settings.data?.default_low_stock ?? 0}
        defaultPosName={defaultPosName}
      />
    </div>
  )
}
