import { Card } from '@/components/ui/card'

export default function MovementsLoading() {
  return (
    <div
      className="flex flex-col gap-4"
      aria-busy="true"
      aria-label="입출고 내역 불러오는 중"
    >
      <div className="bg-surface-sunken h-7 w-20 animate-pulse rounded" />

      <div className="flex gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-surface-sunken h-9 w-16 animate-pulse rounded-full" />
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Card key={i} className="h-28 animate-pulse p-4" />
        ))}
      </div>
    </div>
  )
}
