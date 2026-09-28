'use client'

import Link, { useLinkStatus } from 'next/link'
import { Fragment, useEffect, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { cn } from '@/lib/cn'
import { formatQty } from '@/lib/constants'
import { pageCount, pageItems } from '@/lib/pagination'

import { PAGE_SIZE, STOCK_LIST_ID, stockHref, type StockQuery } from './query'

/**
 * 이 링크들로 넘어가는 쪽. 새 쪽이 그려지면 목록 첫 줄로 올리고 비운다.
 *
 * 링크의 기본 스크롤은 "Page 가 화면에 보이면 자리를 그대로 둔다"라서, 목록 맨 아래에서
 * "다음"을 누르면 새 쪽의 맨 아래에 그대로 떨어진다 — 그 쪽 첫 줄을 보려면 매번 거슬러
 * 올라가야 한다. 그래서 링크의 스크롤은 끄고(scroll={false}) 새 쪽이 그려진 뒤 직접 올린다.
 * 뒤로 가기·새로고침은 이 값이 비어 있어 브라우저가 기억한 자리 그대로다.
 */
let arriving: number | null = null

function scrollToListTop() {
  const list = document.getElementById(STOCK_LIST_ID)
  if (!list) return
  // 첫 줄이 상단 바 밑에 붙어 있는 검색 막대(stock-toolbar.tsx)에 가리지 않게 그 아래로 온다.
  const bar = document.querySelector<HTMLElement>('[data-stock-toolbar]')
  const covered = bar ? (parseFloat(getComputedStyle(bar).top) || 0) + bar.offsetHeight : 0
  // 16px = 막대 카드와 목록 사이의 원래 간격(page 의 gap-6 에서 막대 칸의 아래 여백 py-2 를 뺀 것).
  const top = window.scrollY + list.getBoundingClientRect().top - covered - 16
  window.scrollTo({ top: Math.max(0, top) })
}

const BOX = 'inline-flex h-10 items-center justify-center gap-1 rounded-lg text-sm font-medium'

/**
 * 한 줄에 보이는 번호 수. PC 10 은 사용자가 정한 값이다(2026-09-28, lib/pagination.ts 의 규칙).
 * 휴대폰은 10개와 마지막 번호가 360px 한 줄에 들어가려면 칸이 손가락보다 좁아져(약 26px) 5개로
 * 같은 규칙을 쓴다 — 5개 + "…" + 마지막 + 이전·다음이 36px 칸으로 328px 에 딱 들어간다.
 */
const NUMBERS = { mobile: 5, desktop: 10 } as const

/**
 * 재고 목록 쪽 넘김. 2026-09-28 사용자 요청으로 30개씩 이어 붙이던 무한 스크롤을 대신한다.
 *
 * 쪽 번호는 주소(?page=)에 있고 전부 그냥 링크다 — 길게 눌러 새 탭으로 열기와 뒤로 가기가
 * 그대로 동작한다. 번호 줄의 길이는 쪽마다 달라지지만(끝 쪽에 가면 "… 15"가 빠진다) 이전은
 * 왼쪽 끝·다음은 오른쪽 끝에 못 박아서, "다음"을 같은 자리에서 연달아 누를 수 있다.
 */
export function StockPager({
  query,
  total,
  device,
}: {
  query: StockQuery
  total: number
  device: 'mobile' | 'desktop'
}) {
  const pages = pageCount(total, PAGE_SIZE)
  const page = Math.min(query.page, pages)
  const mobile = device === 'mobile'

  useEffect(() => {
    const target = arriving
    arriving = null
    if (target === page) scrollToListTop()
  }, [page])

  const from = (page - 1) * PAGE_SIZE + 1
  const to = Math.min(page * PAGE_SIZE, total)
  // 번호 칸 폭. 휴대폰 36px 는 위 NUMBERS 주석의 폭 계산에 맞춘 값이다.
  const cell = mobile ? 'min-w-9 px-1.5' : 'min-w-10 px-2'

  function pageLink(n: number, className: string, children: ReactNode, label: string | undefined) {
    return (
      <Link
        href={stockHref(query, { page: n })}
        scroll={false}
        onNavigate={() => {
          arriving = n
        }}
        aria-label={label}
        className={cn(BOX, 'transition-colors', className)}
      >
        <Pending>{children}</Pending>
      </Link>
    )
  }

  function step(dir: 'prev' | 'next') {
    const n = dir === 'prev' ? page - 1 : page + 1
    const text = dir === 'prev' ? '이전' : '다음'
    const icon = dir === 'prev' ? <ChevronLeft size={18} aria-hidden /> : <ChevronRight size={18} aria-hidden />
    // 휴대폰은 화살표만 — 글자까지 넣으면 번호 칸이 들어갈 자리가 없다.
    const inner = mobile ? icon : dir === 'prev' ? <>{icon}{text}</> : <>{text}{icon}</>
    // 이전·다음이 주 동작이라 번호보다 눈에 띄게 테두리를 둔다(입출고 기록의 이전·다음과 같은 꼴).
    const shape = cn('shrink-0 border', mobile ? 'w-9' : 'px-3')
    if (n < 1 || n > pages) {
      // 누를 수 없는 자리. 자리는 지켜 번호 줄이 옆으로 밀리지 않게 하고, 읽기 프로그램은 건너뛴다.
      return (
        <span aria-hidden className={cn(BOX, shape, 'border-border-base text-ink-subtle')}>
          {inner}
        </span>
      )
    }
    return pageLink(
      n,
      cn(shape, 'bg-surface text-ink border-border-strong hover:bg-surface-sunken'),
      inner,
      mobile ? `${text} 쪽` : undefined,
    )
  }

  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <p className="text-ink-subtle text-xs" data-numeric>
        {pages > 1
          ? `${formatQty(total)}개 중 ${formatQty(from)}–${formatQty(to)}`
          : `${formatQty(total)}개`}
      </p>
      {pages > 1 ? (
        // flex-wrap: 360px 보다 좁은 화면이나 아주 좁은 PC 창에서 번호 줄이 페이지 밖으로 밀지 않게.
        <nav
          aria-label="재고 목록 쪽"
          className="flex w-full max-w-3xl flex-wrap items-center justify-between gap-1"
          data-numeric
        >
          {step('prev')}
          <div className={cn('flex items-center justify-center', mobile ? 'gap-0.5' : 'gap-1')}>
            {pageItems(page, pages, NUMBERS[device]).map((item, i) =>
              item === 'gap' ? (
                <span
                  key={`gap-${i}`}
                  aria-hidden
                  className={cn('text-ink-subtle inline-flex justify-center', mobile ? 'w-5' : 'w-6')}
                >
                  …
                </span>
              ) : item === page ? (
                <span
                  key={item}
                  aria-current="page"
                  className={cn(BOX, cell, 'bg-ink-strong text-ink-inverted font-semibold')}
                >
                  {item}
                </span>
              ) : (
                <Fragment key={item}>
                  {pageLink(item, cn(cell, 'text-ink-muted hover:bg-surface hover:text-ink'), item, `${item}쪽`)}
                </Fragment>
              ),
            )}
          </div>
          {step('next')}
        </nav>
      ) : null}
    </div>
  )
}

/**
 * 누른 링크가 새 쪽을 받는 동안 흐리게. 미리 받아 둔 쪽이면 이 단계가 없어서 안 보인다
 * (Next.js 의 useLinkStatus 설명 그대로) — 느릴 때만 보이는 표시다.
 */
function Pending({ children }: { children: ReactNode }) {
  const { pending } = useLinkStatus()
  return (
    <span className={cn('inline-flex items-center gap-1', pending && 'animate-pulse opacity-50')}>
      {children}
    </span>
  )
}
