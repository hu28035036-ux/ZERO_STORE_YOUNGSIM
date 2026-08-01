import Link from 'next/link'

import { StockBadge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { formatWon } from '@/lib/constants'

import type { StockRow } from './query'

/**
 * 휴대폰용 재고 목록.
 *
 * 한 칸에 상품명·옵션·재고·가격까지 다 넣으면 글자가 작아져서 계산대에서
 * 못 읽는다. 이름과 재고 배지를 위쪽에 크게 두고 금액은 아래로 내린다.
 */
export function StockCards({ rows }: { rows: StockRow[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => (
        <li key={row.variant_id}>
          {/* 카드 전체가 링크다. 계산대에서 엄지로 누르는 화면이라 표적이 클수록
              좋고, 줄 안에 따로 "수정" 버튼을 두면 그 버튼이 더 작아진다. */}
          <Link href={`/stock/${row.product_id}/edit`} className="block">
            <Card className="hover:border-border-strong flex flex-col gap-2 p-4 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-ink truncate text-[0.9375rem] font-medium">
                    {row.product_name}
                  </p>
                  {row.option_label ? (
                    <p className="text-ink-muted mt-0.5 truncate text-sm">
                      {row.option_label}
                    </p>
                  ) : null}
                </div>
                <StockBadge
                  qty={row.stock_qty ?? 0}
                  threshold={row.low_stock_threshold ?? 0}
                  unit={row.unit}
                />
              </div>

              <div className="text-ink-muted flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                <span className="text-ink font-medium" data-numeric>
                  {formatWon(row.sale_price)}
                </span>
                <span data-numeric>원가 {formatWon(row.cost_price)}</span>
                {/* 마진율은 판매가가 0 이면 뜻이 없다. 뷰가 0 을 주므로 그때는 숨긴다. */}
                {(row.sale_price ?? 0) > 0 ? (
                  <span
                    data-numeric
                    className={
                      (row.unit_margin ?? 0) < 0 ? 'text-loss font-medium' : undefined
                    }
                  >
                    마진 {row.margin_rate}%
                  </span>
                ) : null}
              </div>

              {row.category_name || row.barcode ? (
                <div className="text-ink-subtle flex flex-wrap gap-x-3 text-xs">
                  {row.category_name ? <span>{row.category_name}</span> : null}
                  {row.barcode ? <span data-numeric>{row.barcode}</span> : null}
                </div>
              ) : null}
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  )
}
