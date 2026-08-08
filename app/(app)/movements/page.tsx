import Link from 'next/link'
import { Boxes, ChevronRight, FileUp, ScrollText, Search } from 'lucide-react'

import { Card } from '@/components/ui/card'
import { likePattern, productSearchFilter } from '@/lib/search'
import { createClient } from '@/lib/supabase/server'

import { MovementForm, type SupplierOption, type VariantTarget } from './movement-form'
import { QuickList } from './quick-list'
import type { QuickTarget } from './quick-row'
import { ScanSearchButton } from './scan-search-button'

export const metadata = { title: '입출고' }

/**
 * 입출고의 메인 = 등록 화면. 기록 목록은 /movements/history 다.
 *
 * 원래는 목록이 메인이고 등록이 한 단계 아래였는데, 실제 사용은 등록이
 * 압도적이라("기록은 보고 싶을 때만") 자리를 맞바꿨다 — 2026-08-08 사용자
 * 결정. nav 의 "입출고"를 누르면 바로 찾기 칸이 나온다.
 */

const SEARCH_LIMIT = 20
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function MovementsPage({
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
    if (pattern) lookup = lookup.or(productSearchFilter(pattern))
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

  // 큰 폼은 ?variant= 로 콕 집어 들어왔을 때만 연다. 검색 결과의 줄 자체가
  // 빠른 등록 폼이라, 한 건일 때도 목록에 남는 쪽이 손이 덜 간다.
  const target = wanted ? rows[0] : null

  // 스캔·검색이 한 건으로 떨어졌으면 그 줄 수량 칸이 포커스를 가진다. 이때는
  // 검색칸의 autoFocus 를 꺼야 한다 — 둘 다 걸면 검색칸이 이긴다(실제로 그랬다).
  const single = rows.length === 1 && Boolean(q)

  const supplierOptions: SupplierOption[] = (suppliers.data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
  }))

  const targets: QuickTarget[] = rows.map((row) => ({
    variantId: row.variant_id!,
    productName: row.product_name ?? '',
    optionLabel: row.option_label,
    stockQty: row.stock_qty ?? 0,
    threshold: row.low_stock_threshold ?? 0,
    salePrice: Number(row.sale_price ?? 0),
    unit: row.unit || '개',
  }))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-ink text-lg font-semibold tracking-tight">입출고</h1>
        <div className="flex items-center gap-2">
          <Link
            href="/movements/history"
            className="border-border-strong text-ink hover:bg-surface-sunken h-touch inline-flex items-center justify-center gap-2 rounded-lg border px-4 text-[0.9375rem] font-medium transition-colors select-none"
          >
            <ScrollText size={18} aria-hidden />
            기록
          </Link>
          <Link
            href="/movements/import"
            className="border-border-strong text-ink hover:bg-surface-sunken h-touch inline-flex items-center justify-center gap-2 rounded-lg border px-4 text-[0.9375rem] font-medium transition-colors select-none"
          >
            <FileUp size={18} aria-hidden />
            파일로 입고
          </Link>
        </div>
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
          {/* 한 박스에 여러 맛이 섞여 오는 상품은 여기서 한 줄씩 넣으면 열 번을
              반복해야 한다. 그 경로가 따로 있다는 것을 이 자리에서 알려준다 —
              찾기 칸을 지나친 뒤에는 다시 안 올라온다. */}
          <Link
            href="/kits"
            className="border-border-base hover:border-border-strong hover:bg-surface-sunken flex items-center gap-3 rounded-card border p-4 transition-colors"
          >
            <Boxes className="text-ink-muted h-5 w-5 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="text-ink block text-sm font-medium">
                한 박스에 여러 맛이 섞여 왔나요?
              </span>
              <span className="text-ink-subtle block text-xs">
                곤약젤리 버라이어티팩처럼 섞여 오는 상품은 박스 묶음으로 한 번에 넣습니다
              </span>
            </span>
            <ChevronRight className="text-ink-subtle h-4 w-4 shrink-0" aria-hidden />
          </Link>

          <Card className="p-4">
            <form action="/movements" className="flex gap-2">
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
                  // 스캐너는 코드를 치고 엔터를 누른다. 다만 결과가 한 건으로
                  // 떨어진 화면에서는 그 줄의 수량 칸이 포커스를 가져간다.
                  autoFocus={!single}
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

          {rows.length > 0 || q ? (
            <p className="text-ink-muted text-sm">
              줄에서 바로 수량을 넣어 등록하세요. 단가·거래처·박스·지난 날짜는
              “자세히”에서, 계속 볼 상품은 “고정”에 체크하세요.
            </p>
          ) : null}

          <QuickList
            rows={targets}
            q={q}
            hitLimit={rows.length === SEARCH_LIMIT}
            searchLimit={SEARCH_LIMIT}
          />
        </>
      )}
    </div>
  )
}
