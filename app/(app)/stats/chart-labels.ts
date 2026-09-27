/**
 * 매출 추이 막대 밑 날짜를 몇 칸마다 적을지 — daily-chart.tsx 가 쓴다.
 *
 * 막대 개수로 정하면 안 된다. 휴대폰에서 칸은 22~40px 인데 날짜 글자는 일 30px · 주 36~40px ·
 * 월 44~51px 라, "8개 넘으면 하나 걸러"로는 12달 월간에서 달 이름끼리 겹쳤고 7달 월간은
 * 걸러 주지 않아 "202…"로 잘렸다(2026-09-27 점검). 칸 폭과 글자 폭으로 정한다.
 */

/** 글자 폭(px)이 들어가려면 몇 칸마다 적어야 하나. 폭을 아직 못 쟀으면(0) 1. */
export function labelStep(labelPx: number, columnPx: number): number {
  if (columnPx <= 0) return 1
  return Math.max(1, Math.ceil(labelPx / columnPx))
}

/**
 * 적을 칸 번호. 처음과 끝은 적는다 — 기간의 양 끝이 보여야 그래프가 어디서 어디까지인지
 * 읽힌다. 끝이 바로 앞 라벨과 step 보다 가까우면 그 앞 라벨을 뺀다(겹치지 않게). 끝이 처음과
 * 붙을 만큼 짧으면 처음만 적는다.
 */
export function labelIndices(n: number, step: number): Set<number> {
  const shown = new Set<number>()
  if (n <= 0) return shown
  for (let i = 0; i < n; i += step) shown.add(i)
  const last = n - 1
  if (!shown.has(last)) {
    const prev = last - (last % step)
    if (last - prev < step) {
      if (prev === 0) return shown
      shown.delete(prev)
    }
    shown.add(last)
  }
  return shown
}
