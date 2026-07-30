import { NotBuiltYet } from '@/components/ui/not-built-yet'

export const metadata = { title: '통계' }

export default function StatsPage() {
  return (
    <NotBuiltYet
      title="통계"
      plan="기간을 골라 stats_summary / stats_top_products / stats_by_category 를 부릅니다. 회전율은 추정치라 화면에도 그렇게 표기합니다."
    />
  )
}
