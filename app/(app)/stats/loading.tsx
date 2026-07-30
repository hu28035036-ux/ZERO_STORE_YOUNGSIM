import { Card } from '@/components/ui/card'

export default function StatsLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="통계 불러오는 중">
      <div className="bg-surface-sunken h-7 w-20 animate-pulse rounded" />

      <div className="flex gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-surface-sunken h-9 w-20 animate-pulse rounded-full" />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="px-4 py-3">
            <div className="bg-surface-sunken h-3 w-12 animate-pulse rounded" />
            <div className="bg-surface-sunken mt-2 h-6 w-24 animate-pulse rounded" />
          </Card>
        ))}
      </div>

      <Card className="h-56 animate-pulse" />
      <Card className="h-64 animate-pulse" />
    </div>
  )
}
