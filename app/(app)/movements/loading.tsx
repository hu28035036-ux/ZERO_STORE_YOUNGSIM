import { Card } from '@/components/ui/card'

/** 입출고(등록 화면)를 불러오는 동안의 뼈대 — 찾기 칸과 결과 줄 자리를 잡는다. */
export default function MovementsLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="입출고 불러오는 중">
      <div className="flex items-center justify-between gap-3">
        <div className="bg-surface-sunken h-7 w-16 animate-pulse rounded" />
        <div className="flex gap-2">
          <div className="bg-surface-sunken h-touch w-20 animate-pulse rounded-lg" />
          <div className="bg-surface-sunken h-touch w-28 animate-pulse rounded-lg" />
        </div>
      </div>

      <Card className="p-4">
        <div className="bg-surface-sunken h-touch animate-pulse rounded-lg" />
      </Card>

      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="h-28 animate-pulse p-4" />
        ))}
      </div>
    </div>
  )
}
