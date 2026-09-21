import Link from 'next/link'
import { Boxes, FileUp, Plus, Tag, TriangleAlert, Wallet } from 'lucide-react'

import { buttonClass } from '@/components/ui/button'
import { Card, StatTile } from '@/components/ui/card'
import { PageHeader } from '@/components/ui/page-header'
import { formatQty, formatWon } from '@/lib/constants'
import { getDevice } from '@/lib/server-device'
import { createClient } from '@/lib/supabase/server'

import { ArchivedTable, type ArchivedProduct } from './archived-table'
import {
  LIST_LIMIT,
  likePattern,
  productSearchFilter,
  parseStockQuery,
  SORTS,
  type StockRow,
} from './query'
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
            <Link href="/stock/new" className={buttonClass('primary')}>
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
    const pattern = likePattern(query.q)
    let archivedList = supabase
      .from('v_archived_products')
      .select('*')
      .order('archived_at', { ascending: false })
      .limit(LIST_LIMIT)
    if (pattern) archivedList = archivedList.ilike('product_name', pattern)

    const archivedResult = await archivedList
    const archivedRows = (archivedResult.data ?? []) as ArchivedProduct[]

    return (
      <div className="flex flex-col gap-6">
        {header}
        <StockToolbar query={query} />

        {archivedResult.error ? (
          <Card className="p-5">
            <p className="text-danger text-sm font-medium">삭제된 상품을 불러오지 못했습니다.</p>
            <p className="text-ink-muted mt-1.5 text-sm">{archivedResult.error.message}</p>
          </Card>
        ) : archivedRows.length === 0 ? (
          <Card className="p-5">
            <p className="text-ink text-sm font-medium">삭제한 상품이 없습니다.</p>
            <p className="text-ink-muted mt-1.5 text-sm">
              재고 표에서 상품을 삭제하면 여기서 되살릴 수 있습니다.
            </p>
          </Card>
        ) : (
          <ArchivedTable rows={archivedRows} />
        )}
      </div>
    )
  }

  let list = supabase
    .from('v_variant_stock')
    .select('*')
    // 판매 중지한 상품·변형은 재고 목록에서 뺀다. 되살리는 것은 이 화면의
    // "삭제됨" 탭 몫이다.
    .eq('is_active', true)
    .eq('product_active', true)
    .limit(LIST_LIMIT)

  if (query.filter === 'low') list = list.eq('is_low_stock', true)
  if (query.filter === 'negative') list = list.eq('is_negative', true)

  const pattern = likePattern(query.q)
  if (pattern) {
    // 상품명·POS 메뉴명·SKU·바코드를 한 번에 훑는다. 물건을 손에 들고 찾을 때
    // 넷 중 무엇으로 찾을지는 그때그때 다르고, 매장 사람이 아는 이름은 발주명이
    // 아니라 POS 메뉴명 쪽인 경우가 많다.
    list = list.or(productSearchFilter(pattern))
  }

  list = list.order(SORTS[query.sort].column, { ascending: !query.desc })
  if (query.sort !== 'name') list = list.order('product_name')
  // 같은 상품 안에서는 옵션 순. 옵션 없는 변형(label = null)이 맨 위로 온다.
  list = list.order('option_label', { nullsFirst: true })

  const [device, listResult] = await Promise.all([getDevice(), list])

  const rows = (listResult.data ?? []) as StockRow[]
  const narrowed = Boolean(query.q) || query.filter !== 'all'

  return (
    <div className="flex flex-col gap-6">
      {header}

      <StockToolbar query={query} />

      {listResult.error ? (
        <Card className="p-5">
          <p className="text-danger text-sm font-medium">재고를 불러오지 못했습니다.</p>
          <p className="text-ink-muted mt-1.5 text-sm">{listResult.error.message}</p>
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
      ) : device === 'mobile' ? (
        <StockCards rows={rows} />
      ) : (
        <StockTable rows={rows} query={query} />
      )}

      {/* 잘렸으면 잘렸다고 말한다. 조용히 자르면 이게 전부인 줄 알게 된다. */}
      {rows.length === LIST_LIMIT ? (
        <p className="text-ink-muted text-center text-sm">
          {LIST_LIMIT}개까지만 보여주고 있습니다. 검색어로 좁혀 주세요.
        </p>
      ) : null}
    </div>
  )
}
