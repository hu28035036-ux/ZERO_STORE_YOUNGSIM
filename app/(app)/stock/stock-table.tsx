import Link from 'next/link'
import { ArrowDown, ArrowUp } from 'lucide-react'

import { StockBadge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/cn'
import { formatWon } from '@/lib/constants'

import { SORTS, sortHref, type SortKey, type StockQuery, type StockRow } from './query'

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
      className={cn(
        'px-3 py-2 font-medium',
        align === 'right' ? 'text-right' : 'text-left',
      )}
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

export function StockTable({
  rows,
  query,
}: {
  rows: StockRow[]
  query: StockQuery
}) {
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[52rem] text-sm">
        <thead className="border-border-base text-ink-muted border-b text-xs">
          <tr>
            <SortHead keyName="name" query={query} />
            <th scope="col" className="px-3 py-2 text-left font-medium">
              옵션
            </th>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              카테고리
            </th>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              유통
            </th>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              바코드
            </th>
            <SortHead keyName="qty" query={query} align="right" />
            <SortHead keyName="price" query={query} align="right" />
            <th scope="col" className="px-3 py-2 text-right font-medium">
              원가
            </th>
            <SortHead keyName="margin" query={query} align="right" />
            <SortHead keyName="value" query={query} align="right" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.variant_id}
              className="border-border-base hover:bg-surface-sunken border-b last:border-0"
            >
              <td className="px-3 py-2.5 font-medium">
                <Link
                  href={`/stock/${row.product_id}/edit`}
                  className="text-ink hover:text-primary"
                >
                  {row.product_name}
                </Link>
              </td>
              <td className="text-ink-muted px-3 py-2.5">{row.option_label ?? '—'}</td>
              <td className="text-ink-muted px-3 py-2.5">{row.category_name ?? '—'}</td>
              <td className="text-ink-muted px-3 py-2.5">{row.channel ?? '—'}</td>
              <td className="text-ink-subtle px-3 py-2.5 text-xs" data-numeric>
                {row.barcode ?? '—'}
              </td>
              <td className="px-3 py-2.5 text-right">
                <StockBadge
                  qty={row.stock_qty ?? 0}
                  threshold={row.low_stock_threshold ?? 0}
                  unit={row.unit}
                />
              </td>
              <td className="text-ink px-3 py-2.5 text-right" data-numeric>
                {formatWon(row.sale_price)}
              </td>
              <td className="text-ink-muted px-3 py-2.5 text-right" data-numeric>
                {formatWon(row.cost_price)}
              </td>
              <td
                className={cn(
                  'px-3 py-2.5 text-right',
                  (row.unit_margin ?? 0) < 0 ? 'text-loss font-medium' : 'text-ink-muted',
                )}
                data-numeric
              >
                {(row.sale_price ?? 0) > 0 ? `${row.margin_rate}%` : '—'}
              </td>
              <td className="text-ink px-3 py-2.5 text-right" data-numeric>
                {formatWon(row.stock_value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
