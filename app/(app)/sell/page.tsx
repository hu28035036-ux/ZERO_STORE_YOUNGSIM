import { StatTile } from '@/components/ui/card'
import { formatQty, formatWon, todayInSeoul } from '@/lib/constants'
import { getDevice } from '@/lib/server-device'
import { createClient } from '@/lib/supabase/server'

import { SellTerminal } from './sell-terminal'

export const metadata = { title: '판매' }

export default async function SellPage() {
  const supabase = await createClient()
  const today = todayInSeoul()

  const [device, todaySales] = await Promise.all([
    getDevice(),
    // v_daily_sales 는 KST 로 날짜를 자른다. 여기서도 KST 오늘을 그대로 넘긴다.
    supabase.from('v_daily_sales').select('*').eq('sale_date', today).maybeSingle(),
  ])

  const sales = todaySales.data

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="오늘 매출" value={formatWon(sales?.revenue)} />
        <StatTile
          label="판매 건수"
          value={`${formatQty(sales?.order_count)}건`}
          hint={`${formatQty(sales?.qty_sold)}점`}
        />
        <StatTile
          label="오늘 마진"
          value={formatWon(sales?.margin)}
          tone={(sales?.margin ?? 0) < 0 ? 'loss' : 'profit'}
        />
      </div>

      <SellTerminal device={device} />
    </div>
  )
}
