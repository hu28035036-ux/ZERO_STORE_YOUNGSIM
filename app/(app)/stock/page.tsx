import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Boxes, FileUp, Plus, Tag, TriangleAlert, Wallet } from 'lucide-react'

import { buttonClass } from '@/components/ui/button'
import { Card, StatTile } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { Pager } from '@/components/ui/pager'
import { formatQty, formatWon } from '@/lib/constants'
import { pageCount } from '@/lib/pagination'
import { getDevice } from '@/lib/server-device'
import { createClient } from '@/lib/supabase/server'

import { ArchivedTable } from './archived-table'
import { fetchArchivedPage, fetchStockPage } from './list'
import { PAGE_SIZE, parseStockQuery, STOCK_LIST_ID, stockHref, type StockQuery } from './query'
import { StockCards } from './stock-cards'
import { StockTable } from './stock-table'
import { StockToolbar } from './stock-toolbar'

export const metadata = { title: '재고' }

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const query = parseStockQuery(await searchParams)
  const supabase = await createClient()

  const [valuation, lowCount] = await Promise.all([
    supabase.from('v_stock_valuation').select('*').maybeSingle(),
    supabase.from('v_low_stock').select('*', { count: 'exact', head: true }),
  ])
  const low = lowCount.count ?? 0

  const header = (
    <>
      <PageHeader
        eyebrow="INVENTORY"
        title="재고"
        description="상품별 수량과 가격을 빠르게 확인하세요."
        actions={
          <>
            {/* Button 이 아니라 Link 다. 새 화면으로 가는 동작은 링크여야
                길게 눌러 새 탭으로 열거나 뒤로 가기가 정상 동작한다. */}
            <Link href="/stock/import" className={buttonClass('secondary')}>
              <FileUp size={18} aria-hidden />
              파일로 등록
            </Link>
            <Link href="/stock/new" className={buttonClass('black')}>
              <Plus size={18} aria-hidden />
              상품 등록
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="재고 품목"
          value={formatQty(valuation.data?.variant_count)}
          unit="개"
          hint={`총 ${formatQty(valuation.data?.total_qty)}점`}
          icon={Boxes}
        />
        <StatTile
          label="재고 자산 (원가)"
          value={formatWon(valuation.data?.total_cost_value)}
          icon={Wallet}
        />
        <StatTile
          label="판매가 환산"
          value={formatWon(valuation.data?.total_retail_value)}
          icon={Tag}
          className="max-lg:hidden"
        />
        <StatTile
          label="부족·품절"
          value={`${formatQty(low)}`}
          unit="개"
          tone={low > 0 ? 'low' : 'neutral'}
          hint={low > 0 ? '채워 넣을 것이 있습니다' : '모두 넉넉합니다'}
          icon={TriangleAlert}
        />
      </div>

      {/* 상품 수정 화면의 삭제에서 넘어온 안내. 필터와 무관하게 한 번만 보여준다. */}
      {query.archivedName ? (
        <Card className="px-5 py-3">
          <p className="text-in text-sm">
            {query.archivedName} 을(를) 삭제했습니다. 재고 목록에서 숨겼고 기록은
            남아 있습니다.
          </p>
        </Card>
      ) : null}
    </>
  )

  if (query.filter === 'archived') {
    const [device, archived] = await Promise.all([getDevice(), fetchArchivedPage(query)])
    if (!archived.error) keepPageInRange(query, archived.total)
    const view = device === 'mobile' ? 'mobile' : 'desktop'

    return (
      <div className="flex flex-col gap-6">
        {header}
        <StockToolbar query={query} />

        {archived.error ? (
          <Card className="p-5">
            <p className="text-danger text-sm font-medium">삭제된 상품을 불러오지 못했습니다.</p>
            <p className="text-ink-muted mt-1.5 text-sm">{archived.error}</p>
          </Card>
        ) : archived.rows.length === 0 ? (
          <Card className="p-5">
            <p className="text-ink text-sm font-medium">삭제한 상품이 없습니다.</p>
            <p className="text-ink-muted mt-1.5 text-sm">
              재고 표에서 상품을 삭제하면 여기서 되살릴 수 있습니다.
            </p>
          </Card>
        ) : (
          <div id={STOCK_LIST_ID} className="flex flex-col gap-3">
            <ArchivedTable key={`${query.q}|${query.page}`} rows={archived.rows} device={view} />
            <Pager
              base={stockHref(query, { page: 1 })}
              page={query.page}
              total={archived.total}
              pageSize={PAGE_SIZE}
              device={view}
              listId={STOCK_LIST_ID}
              label="삭제한 상품 목록 쪽"
            />
          </div>
        )}
      </div>
    )
  }

  const [device, listResult] = await Promise.all([getDevice(), fetchStockPage(query)])
  if (!listResult.error) keepPageInRange(query, listResult.total)
  const view = device === 'mobile' ? 'mobile' : 'desktop'

  const rows = listResult.rows
  const narrowed = Boolean(query.q) || query.filter !== 'all'

  return (
    <div className="flex flex-col gap-6">
      {header}

      <StockToolbar query={query} />

      {listResult.error ? (
        <Card className="p-5">
          <p className="text-danger text-sm font-medium">재고를 불러오지 못했습니다.</p>
          <p className="text-ink-muted mt-1.5 text-sm">{listResult.error}</p>
        </Card>
      ) : rows.length === 0 ? (
        <Card className="p-5">
          <p className="text-ink text-sm font-medium">
            {narrowed ? '조건에 맞는 재고가 없습니다.' : '아직 등록한 상품이 없습니다.'}
          </p>
          <p className="text-ink-muted mt-1.5 text-sm">
            {narrowed
              ? '검색어나 필터를 바꿔 보세요.'
              : '위쪽 “상품 등록”으로 첫 상품을 넣으면 여기에 나타납니다.'}
          </p>
        </Card>
      ) : (
        <div id={STOCK_LIST_ID} className="flex flex-col gap-3">
          {view === 'mobile' ? (
            <StockCards rows={rows} />
          ) : (
            // key 에 쪽까지 넣는다. 체크해 둔 선택이 다음 쪽으로 따라가면 화면에 없는 상품이
            // "N개 선택"에 섞여 같이 지워진다.
            <StockTable
              key={`${query.q}|${query.filter}|${query.sort}|${query.desc}|${query.page}`}
              rows={rows}
              query={query}
            />
          )}
          <Pager
            base={stockHref(query, { page: 1 })}
            page={query.page}
            total={listResult.total}
            pageSize={PAGE_SIZE}
            device={view}
            listId={STOCK_LIST_ID}
            label="재고 목록 쪽"
          />
        </div>
      )}
    </div>
  )
}

/**
 * 없는 쪽이면 마지막 쪽으로 보낸다. 지워서 쪽 수가 줄었거나(마지막 쪽의 상품을 다 지운 뒤
 * 다시 그릴 때) 주소를 손으로 고친 경우다. 빈 쪽을 그대로 그리면 "조건에 맞는 재고가 없습니다"가
 * 떠서 재고가 사라진 줄 안다. redirect 는 예외를 던지므로 try 안에서 부르면 안 된다.
 */
function keepPageInRange(query: StockQuery, total: number) {
  const last = pageCount(total, PAGE_SIZE)
  if (query.page > last) redirect(stockHref(query, { page: last }))
}

