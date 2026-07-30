import Link from 'next/link'
import { Plus, X } from 'lucide-react'

import { Card } from '@/components/ui/card'
import { getDevice } from '@/lib/server-device'
import { createClient } from '@/lib/supabase/server'

import { MovementCards } from './movement-cards'
import { MovementTable } from './movement-table'
import { MovementToolbar } from './movement-toolbar'
import {
  kstDayEnd,
  kstDayStart,
  LIST_LIMIT,
  movementHref,
  parseMovementQuery,
  type MovementRow,
} from './query'

export const metadata = { title: '입출고' }

export default async function MovementsPage({
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
  if (query.from) list = list.gte('occurred_at', kstDayStart(query.from))
  if (query.to) list = list.lt('occurred_at', kstDayEnd(query.to))

  const [device, result] = await Promise.all([getDevice(), list])

  const fetched = (result.data ?? []) as MovementRow[]
  const hasNext = fetched.length > LIST_LIMIT
  const rows = hasNext ? fetched.slice(0, LIST_LIMIT) : fetched
  const filtered = query.type !== 'all' || Boolean(query.from || query.to)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-ink text-lg font-semibold tracking-tight">입출고</h1>
        <Link
          href="/movements/new"
          className="bg-primary text-primary-ink hover:bg-primary-hover h-touch inline-flex items-center justify-center gap-2 rounded-lg px-4 text-[0.9375rem] font-medium transition-colors select-none"
        >
          <Plus size={18} aria-hidden />
          등록
        </Link>
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
              ? '기간이나 종류를 바꿔 보세요.'
              : '위쪽 “등록”으로 입고를 넣으면 여기에 쌓입니다. 상품 등록 때 넣은 기초 재고도 입고로 남습니다.'}
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
