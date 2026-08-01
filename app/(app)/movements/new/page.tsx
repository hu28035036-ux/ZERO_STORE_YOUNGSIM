import Link from 'next/link'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'

import { StockBadge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { formatWon } from '@/lib/constants'
import { likePattern, nameSkuBarcodeFilter } from '@/lib/search'
import { createClient } from '@/lib/supabase/server'

import { MovementForm, type SupplierOption, type VariantTarget } from './movement-form'
import { ScanSearchButton } from './scan-search-button'

export const metadata = { title: '입출고 등록' }

const SEARCH_LIMIT = 20
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function NewMovementPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const q = (typeof sp.q === 'string' ? sp.q : '').trim().slice(0, 40)
  const wanted = typeof sp.variant === 'string' && UUID.test(sp.variant) ? sp.variant : null

  const supabase = await createClient()

  // 고른 변형이 있으면 그것만, 없으면 검색 결과를 받는다.
  let lookup = supabase
    .from('v_variant_stock')
    .select('*')
    .eq('is_active', true)
    .eq('product_active', true)
    .order('product_name')
    .order('option_label', { nullsFirst: true })
    .limit(SEARCH_LIMIT)

  if (wanted) {
    lookup = lookup.eq('variant_id', wanted)
  } else {
    const pattern = likePattern(q)
    // 검색어가 없으면 최근에 손댄 것부터 몇 개 보여준다. 빈 화면보다 낫다.
    if (pattern) lookup = lookup.or(nameSkuBarcodeFilter(pattern))
  }

  const [found, suppliers] = await Promise.all([
    lookup,
    supabase
      .from('suppliers')
      .select('id, name')
      .eq('is_active', true)
      .order('name'),
  ])

  const rows = found.data ?? []

  // 바코드를 찍으면 보통 한 건만 걸린다. 그때는 목록을 한 번 더 누르게 하지 않고
  // 바로 폼으로 넘어간다. 이름 검색이 한 건만 맞아도 마찬가지로 그게 정답이다.
  const target = wanted || rows.length === 1 ? rows[0] : null

  const supplierOptions: SupplierOption[] = (suppliers.data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
  }))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link
          href="/movements"
          aria-label="입출고로 돌아가기"
          className="text-ink-muted hover:bg-surface-sunken hover:text-ink -ml-2 inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors"
        >
          <ChevronLeft size={20} aria-hidden />
        </Link>
        <h1 className="text-ink text-lg font-semibold tracking-tight">입출고 등록</h1>
      </div>

      {target ? (
        <MovementForm
          target={
            {
              variantId: target.variant_id!,
              productName: target.product_name ?? '',
              optionLabel: target.option_label,
              stockQty: target.stock_qty ?? 0,
              costPrice: target.cost_price ?? 0,
              unit: target.unit ?? '개',
              unitsPerPack: target.units_per_pack,
              purchaseUnitName: target.purchase_unit_name,
            } satisfies VariantTarget
          }
          suppliers={supplierOptions}
        />
      ) : (
        <>
          <Card className="p-4">
            <form action="/movements/new" className="flex gap-2">
              {/* min-w-0: 버튼이 두 개(찾기 + 카메라)로 늘면서 flex 기본 최소폭이
                  콘텐츠 크기인 채로 있으면 좁은 화면에서 이 칸이 밀려 잘릴 수 있다
                  (커밋 ac46d4b 와 같은 종류의 사고). 자리가 모자라면 입력칸이
                  줄어들게 한다. */}
              <div className="relative min-w-0 flex-1">
                <Search
                  size={18}
                  aria-hidden
                  className="text-ink-subtle pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
                />
                <input
                  type="search"
                  name="q"
                  defaultValue={q}
                  // 스캐너는 코드를 치고 엔터를 누른다. 폼이 그대로 제출되면
                  // 한 건만 맞을 때 바로 등록 화면으로 넘어간다.
                  autoFocus
                  placeholder="상품명 · 바코드로 찾기"
                  aria-label="상품 찾기"
                  autoCapitalize="none"
                  autoComplete="off"
                  className="bg-surface text-ink border-border-strong placeholder:text-ink-subtle focus:border-primary h-touch w-full rounded-lg border pr-3 pl-10 text-base outline-none"
                />
              </div>
              <button
                type="submit"
                className="bg-primary text-primary-ink hover:bg-primary-hover h-touch inline-flex items-center rounded-lg px-4 text-[0.9375rem] font-medium transition-colors"
              >
                찾기
              </button>
              {/* type="button" 이라 폼 제출을 가로채지 않는다 — 클릭하면 카메라
                  오버레이만 열리고, 실제 조회는 스캔 후 ?q= 이동으로 일어난다. */}
              <ScanSearchButton />
            </form>
          </Card>

          {q && rows.length === 0 ? (
            <Card className="p-5">
              <p className="text-ink text-sm font-medium">찾는 상품이 없습니다.</p>
              <p className="text-ink-muted mt-1.5 text-sm">
                아직 등록하지 않았다면{' '}
                <Link href="/stock/new" className="text-primary underline">
                  상품 등록
                </Link>
                부터 하세요.
              </p>
            </Card>
          ) : rows.length === 0 ? (
            <Card className="p-5">
              <p className="text-ink-muted text-sm leading-relaxed">
                상품명이나 바코드로 먼저 찾으세요. 바코드 스캐너로 찍어도 됩니다.
              </p>
            </Card>
          ) : (
            <ul className="flex flex-col gap-2">
              {rows.map((row) => (
                <li key={row.variant_id}>
                  <Link
                    href={`/movements/new?variant=${row.variant_id}`}
                    className="block"
                  >
                    <Card className="hover:bg-surface-sunken flex items-center justify-between gap-3 p-4 transition-colors">
                      <div className="min-w-0">
                        <p className="text-ink truncate text-[0.9375rem] font-medium">
                          {row.product_name}
                        </p>
                        <p className="text-ink-muted truncate text-sm">
                          {row.option_label ? `${row.option_label} · ` : ''}
                          {formatWon(row.sale_price)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <StockBadge
                          qty={row.stock_qty ?? 0}
                          threshold={row.low_stock_threshold ?? 0}
                          unit={row.unit}
                        />
                        <ChevronRight
                          size={18}
                          aria-hidden
                          className="text-ink-subtle"
                        />
                      </div>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {rows.length === SEARCH_LIMIT ? (
            <p className="text-ink-muted text-center text-sm">
              {SEARCH_LIMIT}개까지만 보여주고 있습니다. 검색어를 더 좁혀 주세요.
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}
