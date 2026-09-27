'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatQty } from '@/lib/constants'

import { loadMoreQuick } from './actions'

import { QuickRow, type QuickTarget } from './quick-row'

/**
 * 빠른 등록 목록 = 검색 결과(없으면 첫 30개)를 스크롤하며 이어 받는다.
 */

const PAGE_SIZE = 30

export function QuickList({
  initialRows,
  total,
  q,
  today,
}: {
  initialRows: QuickTarget[]
  total: number
  q: string
  /** 서버의 KST 오늘. 줄의 달력이 앞날짜를 못 고르게 막는 상한이자 기본값이다. */
  today: string
}) {
  // 무한 스크롤 누적분. 서버가 첫 페이지를 새로 주면(등록 후 router.refresh)
  // 누적분을 버리고 다시 쌓는다 — 재고 화면(stock-infinite.tsx)과 같은 규칙.
  const [rows, setRows] = useState<QuickTarget[]>(initialRows)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const sentinelRef = useRef<HTMLDivElement>(null)
  const requestedRef = useRef<number>(initialRows.length)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRows(initialRows)
    requestedRef.current = initialRows.length
    setLoadError(null)
  }, [initialRows])

  const hasMore = rows.length < total

  function loadMore() {
    const offset = rows.length
    if (!hasMore || pending || requestedRef.current > offset) return
    requestedRef.current = offset + PAGE_SIZE
    startTransition(async () => {
      const res = await loadMoreQuick({ q, offset })
      if (res.error) {
        setLoadError(res.error)
        requestedRef.current = offset
        return
      }
      setRows((prev) => {
        const seen = new Set(prev.map((r) => r.variantId))
        return [...prev, ...res.rows.filter((r) => !seen.has(r.variantId))]
      })
    })
  }

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMore) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore()
      },
      // 바닥 한 화면쯤 전에 미리 받아 스크롤이 멈추지 않게 한다.
      { rootMargin: '600px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, rows.length, pending])

  // 스캔·검색이 한 건으로 떨어졌으면 다음 동작은 수량 입력이다 — 그 한 줄의
  // 수량 칸으로 커서를 보낸다.
  const focusId = q && rows.length === 1 ? rows[0].variantId : null

  return (
    <div className="flex flex-col gap-4">
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
            <li key={row.variantId}>
              <QuickRow target={row} today={today} autoFocus={focusId === row.variantId} />
            </li>
          ))}
        </ul>
      )}

      {rows.length > 0 ? (
        <>
          <div ref={sentinelRef} aria-hidden className="h-px" />
          <div className="flex flex-col items-center gap-2 py-1">
            <p className="text-ink-subtle text-xs" data-numeric>
              {formatQty(rows.length)} / {formatQty(total)}개
            </p>
            {loadError ? (
              <p role="alert" className="text-danger text-sm">
                {loadError}
              </p>
            ) : null}
            {hasMore ? (
              <Button variant="secondary" size="sm" onClick={loadMore} disabled={pending}>
                {pending ? '불러오는 중…' : `다음 ${PAGE_SIZE}개 더 보기`}
              </Button>
            ) : rows.length > PAGE_SIZE ? (
              <p className="text-ink-subtle text-xs">전체 목록을 다 보여드렸습니다.</p>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  )
}
