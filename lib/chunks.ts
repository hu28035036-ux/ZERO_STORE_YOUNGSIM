/**
 * PostgREST `in()` 에 넣을 목록을 안전한 크기로 자르는 두 함수.
 *
 * `in()` 은 필터가 URL 쿼리스트링으로 나간다. 목록이 길면 요청이 통째로
 * 실패하는데, supabase-js 는 그것을 예외가 아니라 `{ error }` 로 돌려주므로
 * **`{ data }` 만 받으면 실패가 "일치 없음"으로 조용히 둔갑한다.** 그래서 자르는
 * 것과 error 를 보는 것은 늘 한 쌍이다 — 자르기만 하고 error 를 안 보면
 * 다른 이유로 실패했을 때 같은 사고가 난다.
 *
 * 상품 임포트와 판매 임포트가 같이 쓴다. 두 파일에 복사해 두면 한쪽만 고쳐지는
 * 날이 온다 (실제로 그랬다 — 판매 쪽이 개수 기준인 채로 남아 있었다).
 */

/** 개수로 자른다. 코드·UUID 처럼 길이가 고르고 ASCII 인 값에 쓴다. */
export function chunks<T>(list: T[], size = 200): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

/**
 * 개수가 아니라 인코딩된 길이로 끊는다. 한글은 percent 인코딩에서 글자당
 * 9바이트가 되어, 한글 상품명 200개면 URL 이 3만 자를 넘겨 요청 자체가
 * 실패한다 — 그런데 { data } 만 받으면 실패가 "일치 없음"으로 조용히
 * 둔갑한다. 실제로 상품 임포트 화면의 이름 중복 감지가 그렇게 통째로 죽어
 * 있었고, 판매 임포트의 이름 매칭도 같은 상태였다.
 *
 * 한글 상품명에는 반드시 이쪽을 써라. 개수 기준은 ASCII 값 전용이다.
 */
export function chunksByEncodedLength(list: string[], budget = 6_000): string[][] {
  const out: string[][] = []
  let cur: string[] = []
  let len = 0
  for (const v of list) {
    const cost = encodeURIComponent(v).length + 3 // 따옴표·쉼표 몫
    if (cur.length > 0 && len + cost > budget) {
      out.push(cur)
      cur = []
      len = 0
    }
    cur.push(v)
    len += cost
  }
  if (cur.length > 0) out.push(cur)
  return out
}
