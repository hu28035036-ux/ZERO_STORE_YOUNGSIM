import { NotBuiltYet } from '@/components/ui/not-built-yet'

export const metadata = { title: '입출고' }

export default function MovementsPage() {
  return (
    <NotBuiltYet
      title="입출고"
      plan="입고·출고·조정·실사 등록과 내역 조회입니다. 내역은 고칠 수 없고, 잘못 넣은 전표는 void_movement() 가 반대 전표를 넣어 상쇄합니다."
    />
  )
}
