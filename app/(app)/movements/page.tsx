import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Boxes, ChevronRight, FileUp, ScrollText, Search } from 'lucide-react'

import { buttonClass } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { Pager } from '@/components/ui/pager'
import { todayInSeoul } from '@/lib/constants'
import { pageCount, parsePage, withPage } from '@/lib/pagination'
import { getDevice } from '@/lib/server-device'
import { createClient } from '@/lib/supabase/server'

import { parseEntryDate } from './entry-date'
import { MovementForm, type SupplierOption, type VariantTarget } from './movement-form'
import { QUICK_LIST_ID, quickListHref } from './query'
import { fetchQuickPage, QUICK_PAGE_SIZE } from './quick-fetch'
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function MovementsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const q = (typeof sp.q === 'string' ? sp.q : '').trim().slice(0, 40)
  const wanted = typeof sp.variant === 'string' && UUID.test(sp.variant) ? sp.variant : null
  const page = parsePage(sp.page)
  const today = todayInSeoul()
  // 줄의 달력에서 지난 날짜를 골라 둔 채 "자세히"로 들어오면 큰 폼의 발생일이 그 날이다.
  const date = parseEntryDate(sp.date, today)

  const supabase = await createClient()

  // ?variant= 로 콕 집어 들어왔으면 그 한 건만 큰 폼으로 연다. 아니면 목록의 한 쪽(30줄)을
  // 받는다(quick-fetch.ts). 쪽 넘김은 아래 Pager 다.
  const [device, picked, listPage, suppliers] = await Promise.all([
    getDevice(),
    wanted
      ? supabase
          .from('v_variant_stock')
          .select('*')
          .eq('is_active', true)
          .eq('product_active', true)
          .eq('variant_id', wanted)
          .maybeSingle()
      : Promise.resolve(null),
    wanted ? Promise.resolve(null) : fetchQuickPage(q, page),
    supabase
      .from('suppliers')
      .select('id, name')
      .eq('is_active', true)
      .order('name'),
  ])

  const target = picked?.data ?? null
  const targets: QuickTarget[] = listPage?.rows ?? []
  const total = listPage?.total ?? 0

  // 없는 쪽이면 마지막 쪽으로 보낸다(stock/page.tsx 의 keepPageInRange 와 같은 이유 — 빈 쪽이면
  // "상품명이나 바코드로 먼저 찾으세요"가 떠서 목록이 사라진 줄 안다). redirect 는 예외를 던진다.
  if (listPage && !listPage.error) {
    const last = pageCount(total, QUICK_PAGE_SIZE)
    if (page > last) redirect(withPage(quickListHref(q), last))
  }

  // 스캔·검색이 한 건으로 떨어졌으면 그 줄 수량 칸이 포커스를 가진다. 이때는
  // 검색칸의 autoFocus 를 꺼야 한다 — 둘 다 걸면 검색칸이 이긴다(실제로 그랬다).
  // 쪽의 줄 수가 아니라 전체 건수로 본다 — 31건의 2쪽은 한 줄이지만 한 건으로 떨어진 게 아니다.
  const single = total === 1 && Boolean(q)

  const supplierOptions: SupplierOption[] = (suppliers.data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
  }))

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="STOCK MOVEMENTS"
        title="입출고"
        description="상품을 찾아 줄에서 바로 수량을 등록하세요."
        actions={
          <>
            <Link href="/movements/history" className={buttonClass('secondary')}>
              <ScrollText size={18} aria-hidden />
              기록
            </Link>
            <Link href="/movements/import" className={buttonClass('black')}>
              <FileUp size={18} aria-hidden />
              파일로 입고
            </Link>
          </>
        }
      />

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
          defaultDate={date < today ? date : undefined}
        />
      ) : (
        <>
          {/* 한 박스에 여러 맛이 섞여 오는 상품은 여기서 한 줄씩 넣으면 열 번을
              반복해야 한다. 그 경로가 따로 있다는 것을 이 자리에서 알려준다 —
              찾기 칸을 지나친 뒤에는 다시 안 올라온다. */}
          <Link
            href="/kits"
            className="bg-primary-soft text-primary hover:bg-primary-soft/70 flex items-center gap-3 rounded-xl px-5 py-4 transition-colors"
          >
            <Boxes className="h-5 w-5 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">
                한 박스에 여러 맛이 섞여 왔나요?
              </span>
              <span className="block text-xs opacity-80">
                곤약젤리 버라이어티팩처럼 섞여 오는 상품은 박스 묶음으로 한 번에 넣습니다
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
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
                  // 360px 휴대폰에서 글자가 들어갈 자리가 좁다 — type=search 는 지우기(×) 자리를 늘
                  // 비워 둔다(약 15px). 그래서 문구를 줄이고, 돋보기 여백(pl-10)과 찾기 버튼
                  // 여백(px-4)도 한 단 줄여 "상품명·바코드"가 다 들어가게 했다.
                  placeholder="상품명·바코드"
                  aria-label="상품 찾기"
                  autoCapitalize="none"
                  autoComplete="off"
                  // transition 을 하나로 합쳐 둔 이유: transition-colors 와 transition-shadow 는 둘 다
                  // transition-property 라 같이 달면 한쪽이 덮여, 포커스 배경 전환이나 hover 그림자
                  // 전환 중 하나가 소리 없이 사라진다.
                  className="bg-surface-sunken text-ink placeholder:text-ink-subtle focus:border-primary focus:bg-surface h-12 w-full rounded-xl border border-transparent pr-3 pl-10 text-base outline-none transition-[color,background-color,border-color,box-shadow] enabled:hover:not-focus:shadow-field-hover"
                />
              </div>
              <button
                type="submit"
                className="bg-primary text-primary-ink hover:bg-primary-hover inline-flex h-12 items-center rounded-xl px-4 text-[0.9375rem] font-medium transition-[background-color,transform] duration-150 select-none active:scale-[0.97]"
              >
                찾기
              </button>
              {/* type="button" 이라 폼 제출을 가로채지 않는다 — 클릭하면 카메라
                  오버레이만 열리고, 실제 조회는 스캔 후 ?q= 이동으로 일어난다. */}
              <ScanSearchButton />
            </form>
          </Card>

          {targets.length > 0 || q ? (
            <p className="text-ink-subtle px-1 text-xs">
              줄에서 바로 수량을 넣어 등록하세요. 지난 날짜는 줄의 달력에서 고르고,
              단가·거래처·박스는 “자세히”에서 넣습니다.
            </p>
          ) : null}

          <div id={QUICK_LIST_ID} className="flex flex-col gap-4">
            <QuickList rows={targets} q={q} today={today} single={single} />
            {targets.length > 0 ? (
              <Pager
                base={quickListHref(q)}
                page={page}
                total={total}
                pageSize={QUICK_PAGE_SIZE}
                device={device === 'mobile' ? 'mobile' : 'desktop'}
                listId={QUICK_LIST_ID}
                label="입출고 상품 목록 쪽"
              />
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}
