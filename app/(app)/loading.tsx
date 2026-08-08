import { Card } from '@/components/ui/card'

/**
 * 개별 loading.tsx 가 없는 모든 화면의 공용 뼈대.
 *
 * 이게 없으면 링크를 눌러도 서버 응답이 올 때까지 화면이 아무 반응이 없다 —
 * 함수가 먼 리전에 있던 시절 0.5~1초를 "죽었나?" 로 보내던 자리다. 특정
 * 화면과 모양을 맞출 수는 없으므로(여러 화면이 같이 쓴다) 제목 + 카드
 * 몇 장의 중립적인 자리만 잡는다. /stock·/movements·/stats 는 각자의
 * loading.tsx 가 이보다 우선한다.
 */
export default function AppLoading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="불러오는 중">
      <div className="bg-surface-sunken h-7 w-24 animate-pulse rounded" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1].map((i) => (
          <Card key={i} className="px-4 py-3">
            <div className="bg-surface-sunken h-3 w-16 animate-pulse rounded" />
            <div className="bg-surface-sunken mt-2 h-6 w-24 animate-pulse rounded" />
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <Card key={i} className="h-20 animate-pulse p-4" />
        ))}
      </div>
    </div>
  )
}
