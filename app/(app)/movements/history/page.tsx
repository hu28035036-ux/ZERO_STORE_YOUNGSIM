import Link from 'next/link'
import { ChevronLeft, X } from 'lucide-react'

import { Card } from '@/components/ui/card'
import { likePattern } from '@/lib/search'
import { getDevice } from '@/lib/server-device'
import { createClient } from '@/lib/supabase/server'

import { MovementCards } from '../movement-cards'
import { MovementTable } from '../movement-table'
import { MovementToolbar } from '../movement-toolbar'
import {
  kstDayEnd,
  kstDayStart,
  LIST_LIMIT,
  movementHref,
  parseMovementQuery,
  type MovementRow,
} from '../query'

export const metadata = { title: '입출고 기록' }

/**
 * 입출고 기록 목록. 등록 화면(/movements)이 이 구역의 메인이고, 여기는
 * "보고 싶을 때" 들어오는 화면이다 — 사용자가 쓰는 빈도가 등록 쪽이 압도적이라
 * 자리를 맞바꿨다(2026-08-08).
 */
export default async function MovementHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const query = parseMovementQuery(await searchParams)
  const supabase = await createClient()

  const offset = query.page * LIST_LIMIT

  let list = supabase
    .from('v_movements')
    .select('*')
    .order('occurred_at', { ascending: false })
    // 같은 시각에 여러 건이 들어가면 정렬이 흔들려 페이지를 넘길 때 같은 행이
    // 두 번 나오거나 통째로 빠진다. id 로 못을 박는다.
    .order('id', { ascending: false })
    // 한 줄 더 받아서 다음 쪽이 있는지 본다. count 쿼리를 따로 치는 것보다 싸다.
    .range(offset, offset + LIST_LIMIT)

  if (query.type !== 'all') list = list.eq('type', query.type)
  if (query.variantId) list = list.eq('variant_id', query.variantId)
  const pattern = likePattern(query.q)
  if (pattern) {
    // lib/search.ts 의 productSearchFilter 는 v_variant_stock 전용이다 —
    // pos_name·barcode 열이 이 뷰에는 없어서 그대로 쓰면 400 이 난다.
    list = list.or(
      `product_name.ilike.${pattern},option_label.ilike.${pattern},sku.ilike.${pattern}`,
    )
  }
  if (query.from) list = list.gte('occurred_at', kstDayStart(query.from))
  if (query.to) list = list.lt('occurred_at', kstDayEnd(query.to))

  const [device, result] = await Promise.all([getDevice(), list])

  const fetched = (result.data ?? []) as MovementRow[]
  const hasNext = fetched.length > LIST_LIMIT
  const rows = hasNext ? fetched.slice(0, LIST_LIMIT) : fetched
  const filtered =
    query.type !== 'all' || Boolean(query.from || query.to) || Boolean(pattern)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link
          href="/movements"
          aria-label="입출고 등록으로 돌아가기"
          className="text-ink-muted hover:bg-surface-sunken hover:text-ink -ml-2 inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors"
        >
          <ChevronLeft size={20} aria-hidden />
        </Link>
        <h1 className="text-ink text-lg font-semibold tracking-tight">입출고 기록</h1>
      </div>

      {query.variantId ? (
        <Card className="flex items-center justify-between gap-3 px-4 py-3">
          <p className="text-ink-muted text-sm">
            <span className="text-ink font-medium">
              {rows[0]?.product_name ?? '선택한 상품'}
            </span>
            {rows[0]?.option_label ? ` · ${rows[0].option_label}` : ''} 의 내역만 보고
            있습니다.
          </p>
          <Link
            href={movementHref(query, { variantId: null, page: 0 })}
            className="text-ink-muted hover:text-ink inline-flex items-center gap-1 text-sm whitespace-nowrap"
          >
            <X size={14} aria-hidden />
            해제
          </Link>
        </Card>
      ) : null}

      <MovementToolbar query={query} />

      {result.error ? (
        <Card className="p-5">
          <p className="text-danger text-sm font-medium">내역을 불러오지 못했습니다.</p>
          <p className="text-ink-muted mt-1.5 text-sm">{result.error.message}</p>
        </Card>
      ) : rows.length === 0 ? (
        <Card className="p-5">
          <p className="text-ink text-sm font-medium">
            {filtered || query.variantId
              ? '조건에 맞는 내역이 없습니다.'
              : '아직 입출고 내역이 없습니다.'}
          </p>
          <p className="text-ink-muted mt-1.5 text-sm">
            {filtered || query.variantId
              ? '검색어·기간·종류를 바꿔 보세요.'
              : '입출고 화면에서 등록하면 여기에 쌓입니다. 상품 등록 때 넣은 기초 재고도 입고로 남습니다.'}
          </p>
        </Card>
      ) : device === 'mobile' ? (
        <MovementCards rows={rows} />
      ) : (
        <MovementTable rows={rows} />
      )}

      {rows.length > 0 && (query.page > 0 || hasNext) ? (
        <div className="flex items-center justify-between gap-3">
          {query.page > 0 ? (
            <Link
              href={movementHref(query, { page: query.page - 1 })}
              className="bg-surface text-ink border-border-strong hover:bg-surface-sunken h-touch inline-flex items-center rounded-lg border px-4 text-sm font-medium"
            >
              이전
            </Link>
          ) : (
            <span />
          )}
          <span className="text-ink-muted text-sm">{query.page + 1}쪽</span>
          {hasNext ? (
            <Link
              href={movementHref(query, { page: query.page + 1 })}
              className="bg-surface text-ink border-border-strong hover:bg-surface-sunken h-touch inline-flex items-center rounded-lg border px-4 text-sm font-medium"
            >
              다음
            </Link>
          ) : (
            <span />
          )}
        </div>
      ) : null}
    </div>
  )
}
