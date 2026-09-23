'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatQty } from '@/lib/constants'

import { loadMoreQuick } from './actions'

import { QuickRow, type QuickTarget } from './quick-row'

/**
 * 빠른 등록 목록 = 고정한 상품 + 검색 결과.
 *
 * 검색은 GET 이동이라 할 때마다 목록이 통째로 바뀐다 — 여러 상품을 연달아
 * 손보는 사람은 방금 보던 줄이 사라져서 불편하다는 리포트. 체크(고정)한 줄을
 * sessionStorage 에 들고 있다가 검색 결과 위에 계속 얹는다.
 *
 * sessionStorage 인 이유: 페이지 이동마다 이 컴포넌트가 새로 만들어져 React
 * 상태로는 못 버티고, localStorage 면 다음날까지 남아 "어제 고정"이 아침
 * 화면을 차지한다. 탭을 닫으면 비워지는 쪽이 작업 목록의 수명과 맞다.
 *
 * 고정 줄의 재고 숫자는 스냅샷이다 — 세 경로로 최신을 유지한다:
 * 검색 결과에 같은 상품이 오면 서버 값으로 교체, 등록 성공 시 잔여 재고로
 * 교체(onApplied), 그 외에는 마지막으로 본 값.
 */

const STORAGE_KEY = 'zerostore.quick-pins.v1'

const PAGE_SIZE = 30

export function QuickList({
  initialRows,
  total,
  q,
}: {
  initialRows: QuickTarget[]
  total: number
  q: string
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

  const [pins, setPins] = useState<QuickTarget[]>([])
  const [loaded, setLoaded] = useState(false)

  // 서버 렌더와 첫 클라이언트 렌더는 고정 0개로 같아야 한다(hydration) —
  // 저장된 고정은 마운트 뒤에 불러올 수밖에 없다. useState 초기값에서 읽으면
  // 서버 HTML 과 첫 렌더가 어긋난다. 마운트 직후 한 번의 리렌더는 그 대가다.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setPins(JSON.parse(raw) as QuickTarget[])
    } catch {
      // 사파리 프라이빗 모드 등. 고정을 기억만 못 할 뿐이다.
    }
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (!loaded) return
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pins))
    } catch {
      // 저장 실패는 편의 저하일 뿐이다.
    }
  }, [pins, loaded])

  function toggle(target: QuickTarget) {
    setPins((prev) =>
      prev.some((p) => p.variantId === target.variantId)
        ? prev.filter((p) => p.variantId !== target.variantId)
        : [...prev, target],
    )
  }

  function applied(variantId: string, after: number) {
    setPins((prev) =>
      prev.map((p) => (p.variantId === variantId ? { ...p, stockQty: after } : p)),
    )
  }

  const pinnedIds = new Set(pins.map((p) => p.variantId))
  const results = rows.filter((r) => !pinnedIds.has(r.variantId))
  // 고정 줄의 재고 스냅샷은 렌더 때 서버 값(진실)으로 갈아끼운다 — 검색 결과에
  // 같은 상품이 오면 저장본보다 그쪽이 최신이다. 상태로 동기화하지 않는 이유:
  // effect 로 setState 를 되풀이하는 구조는 한 렌더 사슬이 늘 뿐 얻는 게 없다.
  const displayPins = pins.map(
    (p) => rows.find((r) => r.variantId === p.variantId) ?? p,
  )
  // 스캔·검색이 한 건으로 떨어졌으면 다음 동작은 수량 입력이다 — 고정 여부와
  // 무관하게 그 한 줄의 수량 칸으로 커서를 보낸다.
  const focusId = q && rows.length === 1 ? rows[0].variantId : null

  return (
    <div className="flex flex-col gap-4">
      {pins.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-ink-muted px-1 text-xs font-semibold tracking-wide">고정한 상품 {pins.length}</h2>
            <button
              type="button"
              onClick={() => setPins([])}
              className="text-ink-muted hover:text-ink text-sm"
            >
              모두 해제
            </button>
          </div>
          <ul className="flex flex-col gap-2">
            {displayPins.map((p) => (
              <li key={p.variantId}>
                <QuickRow
                  target={p}
                  pinned
                  onTogglePin={() => toggle(p)}
                  onApplied={(after) => applied(p.variantId, after)}
                  autoFocus={focusId === p.variantId}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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
      ) : rows.length === 0 && pins.length === 0 ? (
        <Card className="p-5">
          <p className="text-ink-muted text-sm leading-relaxed">
            상품명이나 바코드로 먼저 찾으세요. 바코드 스캐너로 찍어도 됩니다.
          </p>
        </Card>
      ) : results.length > 0 ? (
        <section className="flex flex-col gap-3">
          {pins.length > 0 ? (
            <h2 className="text-ink-muted px-1 text-xs font-semibold tracking-wide">검색 결과</h2>
          ) : null}
          <ul className="flex flex-col gap-2">
            {results.map((row) => (
              <li key={row.variantId}>
                <QuickRow
                  target={row}
                  onTogglePin={() => toggle(row)}
                  autoFocus={focusId === row.variantId}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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
