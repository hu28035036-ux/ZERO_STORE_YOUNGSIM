import { normalizeDate } from '../sales/import/parse'

/**
 * 빠른 등록 줄의 달력에서 골라 "자세히"로 들고 들어온 등록 날짜 (?date=).
 *
 * URL 에 실려 다니는 값이라 그대로 믿지 않는다. 앞날짜를 받아 주면 큰 폼은 그
 * 날로 등록한다고 보여주는데 서버 액션은 거부하고, 달력에 없는 날(2월 30일)은
 * Postgres 가 날짜로 못 읽어 등록이 통째로 실패한다. 해석 단계에서 오늘로
 * 되돌린다. 달력 검사는 판매 임포트의 normalizeDate 를 같이 쓴다 — 같은 검사를
 * 두 벌 두면 한쪽만 고쳐지는 날이 온다.
 */
export function parseEntryDate(raw: string | string[] | undefined, today: string): string {
  const date = typeof raw === 'string' ? normalizeDate(raw) : null
  return date && date <= today ? date : today
}

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']

/**
 * "9월 26일 (토)". Intl 로 만들지 않는 이유: 이 글자는 서버 렌더와 브라우저가
 * 똑같이 그려야 하는데(hydration), 둘의 ICU 가 괄호·띄어쓰기를 다르게 낼 수 있다.
 * 요일은 UTC 로 계산한다 — 날짜 문자열만 다루므로 서버 시간대와 무관해야 한다.
 */
export function entryDateLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return `${m}월 ${d}일 (${WEEKDAY[dow]})`
}

/** "9/26". 줄의 달력 버튼 옆에 붙는다 — 휴대폰 한 줄에 요일까지는 안 들어간다. */
export function entryDateShort(date: string): string {
  const [, m, d] = date.split('-').map(Number)
  return `${m}/${d}`
}
