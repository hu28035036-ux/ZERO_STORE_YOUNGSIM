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

/**
 * 원가처럼 소수가 있을 수 있는 값. toInt 로 받으면 "2772.5" 가 27725 로
 * 읽힌다 — 낱개 환산(÷입수)과 이동평균이 만드는 소수를 그대로 살려야 한다.
 * 저장 컬럼이 numeric(12,2) 라 2자리로 굳힌다.
 */
export function toCost(value: string): number {
  const n = Number(value.replace(/[^\d.]/g, ''))
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}

/** 소수 원가까지 그대로 보여주는 원화. formatWon 은 반올림해 버려서 못 쓴다. */
export function wonExact(n: number): string {
  return `${n.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원`
}

/**
 * 박스 기준으로 친 값을 낱개로. 박스 모드가 아니거나 그 줄에 입수(≥2)가
 * 없으면 친 그대로다 — 입수 없는 줄까지 나누면 0 으로 뭉개진다.
 * 판매가는 원 단위 반올림, 원가는 소수 2자리, 수량은 ×입수.
 */
export function toUnitValues(
  raw: { salePrice: string; unitCost: string; qty: string; pack: string },
  boxMode: boolean,
): { sale: number; cost: number; qty: number; converted: boolean } {
  const pack = toInt(raw.pack)
  if (!boxMode || pack < 2) {
    return {
      sale: toInt(raw.salePrice),
      cost: toCost(raw.unitCost),
      qty: toInt(raw.qty),
      converted: false,
    }
  }
  return {
    sale: Math.round(toInt(raw.salePrice) / pack),
    cost: Math.round((toCost(raw.unitCost) / pack) * 100) / 100,
    qty: toInt(raw.qty) * pack,
    converted: true,
  }
}

/**
 * 변형 줄 아래의 마진 안내. 판매가·원가가 둘 다 있어야 뜻이 있다.
 * 역마진은 색만이 아니라 글로도 말한다 (negative 플래그로 색을 고른다).
 */
export function marginLine(
  sale: number,
  cost: number,
): { text: string; negative: boolean } | null {
  if (sale <= 0 || cost <= 0) return null
  const margin = Math.round((sale - cost) * 100) / 100
  const rate = Math.round(((sale - cost) / sale) * 1000) / 10
  if (margin < 0) {
    return {
      text: `판매가가 원가보다 낮습니다 (${wonExact(margin)} · ${rate}%)`,
      negative: true,
    }
  }
  return { text: `마진 ${wonExact(margin)} (${rate}%)`, negative: false }
}
