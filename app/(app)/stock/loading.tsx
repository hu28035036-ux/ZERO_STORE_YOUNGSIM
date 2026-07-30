import { Card } from '@/components/ui/card'

/**
 * 재고를 불러오는 동안 보여줄 뼈대.
 *
 * 스피너 대신 실제 화면과 같은 자리에 회색 블록을 둔다. 목록이 도착했을 때
 * 요소가 자리를 옮기지 않아서 "화면이 튀는" 느낌이 줄어든다.
 */
export default function StockLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="재고 불러오는 중">
      <div className="bg-surface-sunken h-7 w-16 animate-pulse rounded" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i} className="px-4 py-3">
            <div className="bg-surface-sunken h-3 w-16 animate-pulse rounded" />
            <div className="bg-surface-sunken mt-2 h-6 w-24 animate-pulse rounded" />
          </Card>
        ))}
      </div>

      <div className="bg-surface-sunken h-touch animate-pulse rounded-lg" />

      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <Card key={i} className="h-24 animate-pulse p-4" />
        ))}
      </div>
    </div>
  )
}
