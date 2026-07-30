/**
 * 좁은 화면에서만 보이는 필드 라벨.
 *
 * 넓은 화면에는 위에 머리글 줄이 한 번 있으므로 줄마다 라벨을 반복하면 표가
 * 읽히지 않는다. 좁은 화면에는 머리글이 없으니 라벨이 있어야 한다.
 * 어느 쪽이든 입력에는 aria-label 이 붙으므로 스크린리더는 항상 읽을 수 있다.
 */
export function Cell({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-ink-muted text-xs sm:hidden">{label}</span>
      {children}
    </div>
  )
}

/** 사용자가 친 숫자에서 쉼표와 단위를 걷어낸다. 빈 칸은 0 이다. */
export function toInt(value: string): number {
  const n = Number(value.replace(/[^\d]/g, ''))
  return Number.isFinite(n) ? n : 0
}
