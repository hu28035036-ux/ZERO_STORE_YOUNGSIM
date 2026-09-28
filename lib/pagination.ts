/**
 * 쪽 번호 줄 계산. 화면(components/ui/pager.tsx — 재고·입출고 목록)은 이 결과를 그리기만 한다.
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

// ---------------------------------------------------------------------------
// 주소의 쪽 번호(?page=) — 재고·입출고 목록이 같이 쓴다. 1부터 센다(화면 번호와 같아 ±1 환산이
// 없다). 입출고 기록 화면(movements/query.ts)은 예전부터 0부터 세는 다른 규칙이라 이것을 안 쓴다.
// ---------------------------------------------------------------------------

/**
 * 주소로 받는 쪽 번호의 상한. 그대로 두면 ?page=99999999999999999999 가 offset 3e+21 같은
 * 표기가 되어 DB 가 범위를 못 읽고 오류 화면이 뜬다. 30만 행이면 이 가게에 넉넉하다.
 */
const MAX_PAGE = 10_000

export function parsePage(raw: string | string[] | undefined): number {
  // 숫자만 받는다. Number() 에 맡기면 "1e3"·"2.5" 도 쪽 번호가 된다.
  const page = typeof raw === 'string' && /^[1-9]\d*$/.test(raw) ? Number(raw) : 1
  return Math.min(page, MAX_PAGE)
}

/** 1쪽 주소(쪽 번호 없는 주소)에 쪽을 붙인다. 1쪽은 주소에 남기지 않는다. */
export function withPage(base: string, page: number): string {
  if (page <= 1) return base
  return `${base}${base.includes('?') ? '&' : '?'}page=${page}`
}

/**
 * 쪽 수보다 먼 쪽을 달라고 했나. 그때 PostgREST 는 빈 목록이 아니라 416(PGRST103)을 주고,
 * postgrest-js 는 오류 응답에서 개수(count)를 안 싣는다 — 그대로 두면 "불러오지 못했습니다"가
 * 뜬다. 부르는 쪽은 1쪽을 다시 받아 개수를 얻고, 화면이 그 개수로 마지막 쪽으로 보낸다.
 * 딱 끝(offset = 개수)은 416 이 아니라 빈 목록이 온다.
 */
export function isPastTheEnd(status: number, error: { code?: string } | null): boolean {
  return status === 416 || error?.code === 'PGRST103'
}
