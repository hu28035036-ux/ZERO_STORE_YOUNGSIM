/**
 * 쪽 번호 줄 계산. 화면(재고 목록의 StockPager)은 이 결과를 그리기만 한다.
 *
 * 규칙은 사용자가 정했다(2026-09-28): 번호 `size` 개(PC 10)를 보이고, 마지막 쪽이 그 안에 없으면
 * 오른쪽 끝에 "…"와 함께 붙인다(1~10 … 15). 누른 쪽이 가운데 칸(10개면 여섯째)에 오도록 번호가 따라
 * 움직이는데, 처음 쪽들은 1부터·마지막 쪽들은 마지막 10쪽에서 멈춘다 — 15쪽이면 1~6쪽은 1~10,
 * 11~15쪽은 6~15 가 그대로다. "…"는 숨는 쪽이 있을 때만 쓴다(14쪽까지 보이면 15 를 바로 붙인다).
 */
export type PageItem = number | 'gap'

/** 쪽 수. 비어 있어도 1쪽이다 — "0쪽 중 1쪽" 같은 줄을 만들지 않는다. */
export function pageCount(total: number, size: number): number {
  return Math.max(1, Math.ceil(total / size))
}

export function pageItems(current: number, total: number, size: number): PageItem[] {
  if (total <= size) return range(1, total)

  const page = Math.min(Math.max(current, 1), total)
  const start = Math.min(Math.max(page - Math.floor(size / 2), 1), total - size + 1)
  const end = start + size - 1
  const items: PageItem[] = range(start, end)
  if (end < total - 1) items.push('gap', total)
  else if (end === total - 1) items.push(total)
  return items
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i)
}
