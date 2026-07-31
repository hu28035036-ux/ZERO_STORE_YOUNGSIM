import Link from 'next/link'
import { Search } from 'lucide-react'

import { ScanButton } from '@/components/scanner/scan-button'
import { cn } from '@/lib/cn'

import { FILTER_LABEL, FILTERS, stockHref, type StockQuery } from './query'

/**
 * 검색과 필터.
 *
 * 자바스크립트 없이 도는 GET 폼이다. 한 글자마다 서버로 갔다 오는 즉시 검색은
 * 계산대 근처의 느린 회선에서 오히려 답답하고, 여기서는 다 치고 한 번 누르는
 * 쪽이 빠르다. 필터는 그냥 링크라 뒤로 가기도 그대로 동작한다.
 */
export function StockToolbar({ query }: { query: StockQuery }) {
  return (
    <div className="flex flex-col gap-3">
      <form action="/stock" className="flex gap-2">
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
        <div className="relative min-w-0 flex-1">
          <Search
            size={18}
            aria-hidden
            className="text-ink-subtle pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
          />
          <input
            type="search"
            name="q"
            defaultValue={query.q}
            placeholder="상품명 · SKU · 바코드"
            aria-label="재고 검색"
            autoCapitalize="none"
            autoComplete="off"
            className="bg-surface text-ink border-border-strong placeholder:text-ink-subtle focus:border-primary h-touch w-full rounded-lg border pr-3 pl-10 text-base outline-none"
          />
        </div>
        {/* "이거 몇 개 남았지?" 를 물건을 들고 바로 확인하는 경로. 스캔값은
            이 GET 폼의 q 로 제출되어 보던 필터·정렬이 그대로 유지된다. */}
        <ScanButton inputName="q" />
        <button
          type="submit"
          className="bg-surface text-ink border-border-strong hover:bg-surface-sunken h-touch inline-flex shrink-0 items-center rounded-lg border px-4 text-[0.9375rem] font-medium transition-colors"
        >
          검색
        </button>
      </form>

      <div className="flex gap-2 overflow-x-auto">
        {FILTERS.map((f) => {
          const on = query.filter === f
          return (
            <Link
              key={f}
              href={stockHref(query, { filter: f })}
              aria-current={on ? 'true' : undefined}
              className={cn(
                'inline-flex h-9 shrink-0 items-center rounded-full border px-3.5 text-sm font-medium transition-colors',
                on
                  ? 'bg-primary text-primary-ink border-primary'
                  : 'bg-surface text-ink-muted border-border-strong hover:bg-surface-sunken',
              )}
            >
              {FILTER_LABEL[f]}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
