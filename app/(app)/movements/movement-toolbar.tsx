import Link from 'next/link'
import { Search } from 'lucide-react'

import { cn } from '@/lib/cn'

import {
  FILTER_LABEL,
  FILTER_TYPES,
  movementHref,
  type MovementQuery,
} from './query'

/**
 * 종류 칩과 기간.
 *
 * 재고 화면과 같이 JS 없는 링크와 GET 폼이다. 칩을 누르면 페이지 번호를 0 으로
 * 되돌린다 — 3페이지를 보다가 종류를 바꿨는데 여전히 3페이지면 대개 빈 화면이 뜬다.
 */
export function MovementToolbar({ query }: { query: MovementQuery }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 overflow-x-auto">
        {FILTER_TYPES.map((t) => {
          const on = query.type === t
          return (
            <Link
              key={t}
              href={movementHref(query, { type: t, page: 0 })}
              aria-current={on ? 'true' : undefined}
              className={cn(
                'inline-flex h-9 shrink-0 items-center rounded-full border px-3.5 text-sm font-medium transition-colors',
                on
                  ? 'bg-primary text-primary-ink border-primary'
                  : 'bg-surface text-ink-muted border-border-strong hover:bg-surface-sunken',
              )}
            >
              {FILTER_LABEL[t]}
            </Link>
          )
        })}
      </div>

      <form action="/movements/history" className="flex flex-wrap items-end gap-2">
        {query.type !== 'all' ? (
          <input type="hidden" name="type" value={query.type} />
        ) : null}
        {query.variantId ? (
          <input type="hidden" name="variant" value={query.variantId} />
        ) : null}

        {/* 검색과 기간이 같은 폼이다 — 어느 쪽을 제출해도 다른 조건이 유지된다.
            따로 폼을 두면 검색하는 순간 잡아둔 기간이 조용히 풀린다. */}
        <div className="relative min-w-0 flex-1 basis-56">
          <Search
            size={18}
            aria-hidden
            className="text-ink-subtle pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
          />
          <input
            type="search"
            name="q"
            defaultValue={query.q}
            placeholder="상품명으로 찾기"
            aria-label="내역에서 상품 찾기"
            autoCapitalize="none"
            autoComplete="off"
            className="bg-surface text-ink border-border-strong placeholder:text-ink-subtle focus:border-primary h-touch w-full rounded-lg border pr-3 pl-10 text-base outline-none"
          />
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-ink-muted text-xs">시작일</span>
          <input
            type="date"
            name="from"
            defaultValue={query.from}
            className="bg-surface text-ink border-border-strong focus:border-primary h-touch rounded-lg border px-3 text-base outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-ink-muted text-xs">종료일</span>
          <input
            type="date"
            name="to"
            defaultValue={query.to}
            className="bg-surface text-ink border-border-strong focus:border-primary h-touch rounded-lg border px-3 text-base outline-none"
          />
        </label>
        <button
          type="submit"
          className="bg-surface text-ink border-border-strong hover:bg-surface-sunken h-touch inline-flex items-center rounded-lg border px-4 text-[0.9375rem] font-medium transition-colors"
        >
          적용
        </button>
        {query.q || query.from || query.to ? (
          <Link
            href={movementHref(query, { q: '', from: '', to: '', page: 0 })}
            className="text-ink-muted hover:text-ink h-touch inline-flex items-center px-2 text-sm"
          >
            해제
          </Link>
        ) : null}
      </form>
    </div>
  )
}
