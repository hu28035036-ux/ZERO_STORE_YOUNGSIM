import Link from 'next/link'
import { Search } from 'lucide-react'

import { ScanButton } from '@/components/scanner/scan-button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/cn'

import { FILTER_LABEL, FILTERS, stockHref, type StockQuery } from './query'

/**
 * 검색과 필터.
 *
 * 자바스크립트 없이 도는 GET 폼이다. 한 글자마다 서버로 갔다 오는 즉시 검색은
 * 계산대 근처의 느린 회선에서 오히려 답답하고, 여기서는 다 치고 한 번 누르는
 * 쪽이 빠르다. 필터는 그냥 링크라 뒤로 가기도 그대로 동작한다.
 *
 * 목록을 내려도 이 막대는 상단 바 바로 아래에 붙어 따라온다 — 수십 개를 훑어
 * 내려간 뒤 다른 상품을 찾으려고 맨 위까지 다시 올라가야 했다.
 */
export function StockToolbar({ query }: { query: StockQuery }) {
  return (
    // 감싼 칸이 페이지 바탕색을 칠하는 이유: 붙어 있는 동안 카드의 둥근 모서리 틈과
    // 위아래로 목록이 비쳐 보인다. -my-2/py-2 는 붙었을 때 바탕색 여백을 두르면서
    // 붙기 전 자리(위아래 간격)는 원래대로 두려는 것이다.
    // z-30: sticky 는 쌓임 맥락을 만들어 이 안의 카메라 스캔 화면(fixed z-50)을 가둔다.
    // 데스크톱 상단 바(z-20)보다 낮으면 스캔 화면 위에 상단 바가 떠서 탭이 눌린다.
    // top 은 셸이 잰 상단 바 높이다(components/shell/use-header-height.ts).
    <div className="bg-surface-sunken sticky top-[var(--app-header-h)] z-30 -my-2 py-2">
      <Card className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <form action="/stock" className="flex w-full min-w-0 gap-2 sm:w-auto sm:flex-1">
          {/* 검색해도 보던 필터·정렬은 유지되어야 한다. */}
          {query.filter !== 'all' ? (
            <input type="hidden" name="filter" value={query.filter} />
          ) : null}
          {query.sort !== 'name' ? (
            <input type="hidden" name="sort" value={query.sort} />
          ) : null}
          {query.desc ? <input type="hidden" name="dir" value="desc" /> : null}

          {/* min-w-0: 카메라 버튼이 늘면서 좁은 화면에서 입력칸이 카드 밖으로
              밀리지 않게 한다 — 판매 화면 금액 잘림(ac46d4b)과 같은 사고 예방. */}
          <div className="relative min-w-0 max-w-md flex-1">
            <Search
              size={18}
              aria-hidden
              className="text-ink-subtle pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
            />
            <input
              type="search"
              name="q"
              defaultValue={query.q}
              // 360px 휴대폰에서 글자가 들어갈 자리가 약 110px 다. 더 길면 말줄임 없이
              // 뚝 잘려 "· 바코드"가 안 보였다(SKU 는 화면에서 안 쓰는 값이라 뺐다 — 검색은 그대로 훑는다).
              placeholder="상품명·바코드"
              aria-label="재고 검색"
              autoCapitalize="none"
              autoComplete="off"
              className="bg-surface text-ink border-border-strong placeholder:text-ink-subtle focus:border-primary h-11 w-full rounded-lg border pr-3 pl-10 text-base outline-none"
            />
          </div>
          {/* "이거 몇 개 남았지?" 를 물건을 들고 바로 확인하는 경로. 스캔값은
              이 GET 폼의 q 로 제출되어 보던 필터·정렬이 그대로 유지된다. */}
          <ScanButton inputName="q" />
          <button
            type="submit"
            className="bg-surface text-ink border-border-strong hover:bg-surface-sunken h-11 inline-flex shrink-0 items-center rounded-lg border px-4 text-[0.9375rem] font-medium transition-colors"
          >
            검색
          </button>
        </form>

        <div className="flex w-full gap-1.5 overflow-x-auto sm:w-auto">
          {FILTERS.map((f) => {
            const on = query.filter === f
            return (
              <Link
                key={f}
                href={stockHref(query, { filter: f })}
                aria-current={on ? 'true' : undefined}
                className={cn(
                  'inline-flex h-9 shrink-0 items-center rounded-lg px-3 text-sm font-medium transition-colors',
                  on
                    ? 'bg-ink-strong text-ink-inverted font-semibold'
                    : 'text-ink-muted hover:bg-surface-sunken',
                )}
              >
                {FILTER_LABEL[f]}
              </Link>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
