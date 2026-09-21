'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'

import { StockBadge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/cn'
import { formatWon } from '@/lib/constants'

import { posSubtitle, SORTS, sortHref, type SortKey, type StockQuery, type StockRow } from './query'
import { BulkDeleteBar, RowDeleteCell } from './stock-delete-controls'

/** 정렬 가능한 머리글 한 칸. 정렬은 서버가 하고 여기는 링크만 그린다. */
function SortHead({
  keyName,
  query,
  align = 'left',
}: {
  keyName: SortKey
  query: StockQuery
  align?: 'left' | 'right'
}) {
  const on = query.sort === keyName
  const Arrow = query.desc ? ArrowDown : ArrowUp

  return (
    <th
      scope="col"
      // 스크린리더가 현재 정렬 상태를 읽게 한다.
      aria-sort={on ? (query.desc ? 'descending' : 'ascending') : 'none'}
      className={cn('px-4 py-3 font-medium', align === 'right' ? 'text-right' : 'text-left')}
    >
      <Link
        href={sortHref(query, keyName)}
        className={cn(
          'hover:text-ink inline-flex items-center gap-1',
          on ? 'text-ink' : 'text-ink-muted',
        )}
      >
        {SORTS[keyName].label}
        {on ? <Arrow size={14} aria-hidden /> : null}
      </Link>
    </th>
  )
}

/**
 * 재고 표.
 *
 * 선택 삭제는 표 위 배너 + 각 행 체크박스가 한 세트라 상태(selected)를 여기
 * 한 군데(클라이언트 컴포넌트)에서 들고 있는다. 정렬 링크는 그냥 <Link> 라
 * 클라이언트 컴포넌트 안에서도 그대로 동작하고 URL 계약은 바뀌지 않는다.
 */
export function StockTable({ rows, query }: { rows: StockRow[]; query: StockQuery }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // 방금 삭제한 개수. 행이 사라진 자리에는 문구를 못 남기니 표 위에 띄운다.
  const [notice, setNotice] = useState<string | null>(null)

  const selectableIds = rows.map((r) => r.product_id).filter((id): id is string => Boolean(id))
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id))

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected((prev) => (prev.size > 0 ? new Set() : new Set(selectableIds)))
  }

  function reportDeleted(count: number) {
    setSelected(new Set())
    setNotice(
      `${count}개를 삭제했습니다. 재고 목록에서 숨겼고 기록은 남아 있습니다.`,
    )
  }

  const selectedIds = [...selected]

  return (
    <div className="flex flex-col gap-3">
      {notice ? (
        <Card className="px-5 py-3">
          <p className="text-in text-sm">{notice}</p>
        </Card>
      ) : null}

      {selectedIds.length > 0 ? (
        <BulkDeleteBar
          ids={selectedIds}
          onClear={() => setSelected(new Set())}
          onSuccess={reportDeleted}
        />
      ) : null}

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[58rem] text-sm">
          <thead className="bg-surface-sunken text-ink-muted text-xs font-medium">
            <tr>
              <th scope="col" aria-sort={query.sort === 'name' ? (query.desc ? 'descending' : 'ascending') : 'none'} className="w-[30%] min-w-[14rem] px-4 py-3 pl-5 text-left">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    aria-label="전체 선택"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="border-border-strong size-4 rounded"
                  />
                  <Link
                    href={sortHref(query, 'name')}
                    className={cn(
                      'hover:text-ink inline-flex items-center gap-1',
                      query.sort === 'name' ? 'text-ink' : 'text-ink-muted',
                    )}
                  >
                    {SORTS.name.label}
                    {query.sort === 'name' ? (
                      query.desc ? <ArrowDown size={14} aria-hidden /> : <ArrowUp size={14} aria-hidden />
                    ) : null}
                  </Link>
                </div>
              </th>
              <th scope="col" className="px-4 py-3 text-left font-medium whitespace-nowrap">
                옵션
              </th>
              <th scope="col" className="px-4 py-3 text-left font-medium whitespace-nowrap">
                카테고리
              </th>
              <th scope="col" className="px-4 py-3 text-left font-medium whitespace-nowrap">
                바코드
              </th>
              <SortHead keyName="qty" query={query} align="right" />
              <SortHead keyName="price" query={query} align="right" />
              <th scope="col" className="px-4 py-3 text-right font-medium whitespace-nowrap">
                원가
              </th>
              <SortHead keyName="margin" query={query} align="right" />
              <SortHead keyName="value" query={query} align="right" />
              <th scope="col" className="px-4 py-3 pr-5 text-right font-medium whitespace-nowrap">
                관리
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const productId = row.product_id
              return (
                <tr
                  key={row.variant_id}
                  className="border-border-base hover:bg-surface-sunken/60 border-b last:border-0"
                >
                  <td className="px-4 py-3.5 pl-5">
                    <div className="flex items-start gap-2">
                      {productId ? (
                        <input
                          type="checkbox"
                          aria-label={`${row.product_name} 선택`}
                          checked={selected.has(productId)}
                          onChange={() => toggle(productId)}
                          className="border-border-strong mt-0.5 size-4 shrink-0 rounded"
                        />
                      ) : (
                        <span className="size-4 shrink-0" aria-hidden />
                      )}
                      <div className="min-w-0">
                        <Link
                          href={`/stock/${row.product_id}/edit`}
                          className="text-ink hover:text-primary text-sm font-semibold"
                        >
                          {row.product_name}
                        </Link>
                        {/* 열을 새로 늘리지 않고 이름 칸 둘째 줄로 넣는다. */}
                        {posSubtitle(row) ? (
                          <p className="text-ink-subtle mt-0.5 text-xs font-normal">
                            POS {posSubtitle(row)}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="text-ink-muted px-4 py-3.5 whitespace-nowrap">
                    {row.option_label ?? '—'}
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <div className="text-ink-muted">{row.category_name ?? '—'}</div>
                    {/* 카테고리와 유통을 한 열로 합쳐 열 수를 줄인다 — 유통은
                        카테고리 아래 작은 글씨로. */}
                    {row.channel ? (
                      <div className="text-ink-subtle text-xs">{row.channel}</div>
                    ) : null}
                  </td>
                  <td className="text-ink-subtle px-4 py-3.5 text-xs whitespace-nowrap" data-numeric>
                    {row.barcode ?? '—'}
                  </td>
                  <td className="px-4 py-3.5 text-right whitespace-nowrap">
                    <StockBadge
                      qty={row.stock_qty ?? 0}
                      threshold={row.low_stock_threshold ?? 0}
                      unit={row.unit}
                    />
                  </td>
                  <td className="text-ink px-4 py-3.5 text-right whitespace-nowrap" data-numeric>
                    {formatWon(row.sale_price)}
                  </td>
                  <td className="text-ink-muted px-4 py-3.5 text-right whitespace-nowrap" data-numeric>
                    {formatWon(row.cost_price)}
                  </td>
                  <td
                    className={cn(
                      'px-4 py-3.5 text-right whitespace-nowrap',
                      (row.unit_margin ?? 0) < 0 ? 'text-loss font-medium' : 'text-ink-muted',
                    )}
                    data-numeric
                  >
                    {(row.sale_price ?? 0) > 0 ? `${row.margin_rate}%` : '—'}
                  </td>
                  <td className="text-ink px-4 py-3.5 text-right whitespace-nowrap" data-numeric>
                    {formatWon(row.stock_value)}
                  </td>
                  <td className="px-4 py-3.5 pr-5 text-right whitespace-nowrap">
                    {productId ? (
                      <RowDeleteCell
                        productId={productId}
                        productName={row.product_name ?? '상품'}
                        onSuccess={() => reportDeleted(1)}
                      />
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>
    </div>
  )
}
