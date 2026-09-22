'use client'

import { useEffect, useRef, useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { formatQty } from '@/lib/constants'

import { loadMoreStock } from './actions'
import { PAGE_SIZE, type StockQuery, type StockRow } from './query'
import { StockCards } from './stock-cards'
import { StockTable } from './stock-table'

/**
 * 재고 목록의 무한 스크롤 껍데기.
 *
 * 첫 30개는 서버가 렌더해서 넘기고(검색엔진·첫 화면 속도), 그 뒤로는 바닥의
 * 감시선(sentinel)이 보일 때마다 다음 30개를 서버 액션으로 받아 붙인다.
 *
 * 화면 안에서 삭제하면 표가 revalidate 로 다시 그려지는데, 그때 넘어오는
 * initialRows 는 첫 페이지뿐이다. 그래서 initialRows 가 바뀌면 누적분을
 * 버리고 처음부터 다시 쌓는다 — 지운 뒤 스크롤 위치가 위로 가는 건 감수한다.
 * 삭제된 행을 누적분에서 골라내는 것보다 "서버가 준 게 진실"인 쪽이 안전하다.
 */
export function StockInfinite({
  initialRows,
  total,
  query,
  device,
}: {
  initialRows: StockRow[]
  total: number
  query: StockQuery
  device: 'mobile' | 'desktop'
}) {
  const [rows, setRows] = useState<StockRow[]>(initialRows)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const sentinelRef = useRef<HTMLDivElement>(null)
  // 같은 offset 을 두 번 요청하지 않기 위한 표식. IntersectionObserver 는
  // 데이터가 붙는 동안에도 계속 "보인다"고 알린다.
  const requestedRef = useRef<number>(initialRows.length)

  useEffect(() => {
    // 서버가 새 첫 페이지를 주면(삭제 후 revalidate) 누적분을 버린다. quick-list 와 같은
    // 이유로 효과 안 setState 를 허용한다 — props 에서 파생하되 사용자가 더 쌓은 것을 갖는 상태다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRows(initialRows)
    requestedRef.current = initialRows.length
    setError(null)
  }, [initialRows])

  const hasMore = rows.length < total

  function loadMore() {
    const offset = rows.length
    if (!hasMore || pending || requestedRef.current > offset) return
    requestedRef.current = offset + PAGE_SIZE
    startTransition(async () => {
      const res = await loadMoreStock({
        q: query.q,
        filter: query.filter,
        sort: query.sort,
        desc: query.desc,
        offset,
      })
      if (res.error) {
        setError(res.error)
        // 실패했으면 같은 offset 을 다시 시도할 수 있게 표식을 되돌린다.
        requestedRef.current = offset
        return
      }
      setRows((prev) => {
        // offset 페이지네이션이라 사이에 행이 지워지면 한 줄이 겹칠 수 있다.
        const seen = new Set(prev.map((r) => r.variant_id))
        return [...prev, ...res.rows.filter((r) => !seen.has(r.variant_id))]
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
      // 바닥에 닿기 한 화면쯤 전에 미리 받는다. 정확히 바닥에서 받으면
      // 스크롤이 멈추고 기다리는 순간이 매번 생긴다.
      { rootMargin: '600px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
    // loadMore 는 rows/pending 을 닫아 두므로 그것들이 바뀔 때마다 다시 건다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMore, rows.length, pending])

  return (
    <div className="flex flex-col gap-3">
      {device === 'mobile' ? (
        <StockCards rows={rows} />
      ) : (
        <StockTable rows={rows} query={query} />
      )}

      <div ref={sentinelRef} aria-hidden className="h-px" />

      <div className="flex flex-col items-center gap-2 py-2">
        <p className="text-ink-subtle text-xs" data-numeric>
          {formatQty(rows.length)} / {formatQty(total)}개
        </p>
        {error ? (
          <p role="alert" className="text-danger text-sm">
            {error}
          </p>
        ) : null}
        {hasMore ? (
          // 감시선이 안 잡히는 환경(스크롤이 안 생길 만큼 큰 화면 등)을 위한 수동 버튼.
          <Button variant="secondary" size="sm" onClick={loadMore} disabled={pending}>
            {pending ? '불러오는 중…' : `다음 ${PAGE_SIZE}개 더 보기`}
          </Button>
        ) : rows.length > PAGE_SIZE ? (
          <p className="text-ink-subtle text-xs">전체 목록을 다 보여드렸습니다.</p>
        ) : null}
      </div>
    </div>
  )
}
