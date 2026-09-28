/**
 * 쪽 번호 줄 계산. 화면(재고 목록의 StockPager)은 이 결과를 그리기만 한다.
 *
 * 처음·끝·현재 쪽과 현재 쪽 양옆 `siblings` 쪽만 보이고 나머지는 "…"(gap)로 접는다 —
 * 425개면 15쪽이라 번호를 다 늘어놓으면 360px 휴대폰에 안 들어간다.
 *
 * 칸 수를 늘 같게 둔다(쪽이 칸보다 많으면 2·siblings + 5칸). 쪽마다 칸 수가 달라지면
 * 넘길 때마다 버튼이 옆으로 움직여, "다음"을 같은 자리에서 연달아 누를 수 없다.
 * "…"는 두 쪽 이상을 숨길 때만 쓴다 — 한 쪽만 숨길 거면 그 번호를 보이는 편이 낫다.
 */
export type PageItem = number | 'gap'

/** 쪽 수. 비어 있어도 1쪽이다 — "0쪽 중 1쪽" 같은 줄을 만들지 않는다. */
export function pageCount(total: number, size: number): number {
  return Math.max(1, Math.ceil(total / size))
}

export function pageItems(current: number, total: number, siblings: number): PageItem[] {
  const slots = 2 * siblings + 5
  if (total <= slots) return range(1, total)

  const page = Math.min(Math.max(current, 1), total)
  if (page <= siblings + 3) return [...range(1, slots - 2), 'gap', total]
  if (page >= total - siblings - 2) return [1, 'gap', ...range(total - slots + 3, total)]
  return [1, 'gap', ...range(page - siblings, page + siblings), 'gap', total]
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i)
}
