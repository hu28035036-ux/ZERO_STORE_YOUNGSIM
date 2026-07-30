import { Card } from '@/components/ui/card'

/**
 * 아직 만들지 않은 화면.
 *
 * 그럴듯한 껍데기를 그려두는 대신 "없다"고 분명히 말한다.
 * 가짜 표가 들어 있으면 나중에 이게 진짜 동작하는 화면인지 아닌지
 * 매번 눌러봐야 알게 된다.
 */
export function NotBuiltYet({ title, plan }: { title: string; plan: string }) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-ink text-lg font-semibold tracking-tight">{title}</h1>
      <Card className="p-5">
        <p className="text-ink text-sm font-medium">아직 만들지 않은 화면입니다.</p>
        <p className="text-ink-muted mt-1.5 text-sm leading-relaxed">{plan}</p>
      </Card>
    </div>
  )
}
