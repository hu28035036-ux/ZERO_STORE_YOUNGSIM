import Link from 'next/link'

import { Card } from '@/components/ui/card'

import { QuickRow, type QuickTarget } from './quick-row'

/**
 * 빠른 등록 목록 한 쪽 = 검색 결과(없으면 전체를 이름순으로) 30줄. 쪽 넘김은 page.tsx 가 붙이는
 * Pager 다 — 2026-09-28 에 이어 붙이던 무한 스크롤을 재고 목록과 같은 쪽 넘김으로 바꿨다.
 *
 * 무한 스크롤 때는 줄에서 등록한 뒤의 router.refresh() 가 누적분을 첫 30개로 되돌려, 스크롤해 내려가
 * 등록한 줄이 화면에서 사라졌다. 쪽 넘김에서는 새로 그려도 보던 쪽 그대로다.
 */
export function QuickList({
  rows,
  q,
  today,
  single,
}: {
  rows: QuickTarget[]
  q: string
  /** 서버의 KST 오늘. 줄의 달력이 앞날짜를 못 고르게 막는 상한이자 기본값이다. */
  today: string
  /** 검색 결과가 전체에서 딱 한 건인가(쪽의 줄 수가 아니라). */
  single: boolean
}) {
  // 스캔·검색이 한 건으로 떨어졌으면 다음 동작은 수량 입력이다 — 그 한 줄의
  // 수량 칸으로 커서를 보낸다.
  const focusId = single ? (rows[0]?.variantId ?? null) : null

  if (q && rows.length === 0) {
    return (
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
    )
  }

  if (rows.length === 0) {
    return (
      <Card className="p-5">
        <p className="text-ink-muted text-sm leading-relaxed">
          상품명이나 바코드로 먼저 찾으세요. 바코드 스캐너로 찍어도 됩니다.
        </p>
      </Card>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => (
        <li key={row.variantId}>
          <QuickRow target={row} today={today} autoFocus={focusId === row.variantId} />
        </li>
      ))}
    </ul>
  )
}
