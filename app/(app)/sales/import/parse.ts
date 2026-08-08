/**
 * 판매기록 파일 파싱 — 순수 함수만. 브라우저와 서버 액션이 같이 쓴다.
 *
 * 파일은 서버로 보내지 않는다(서버 액션 body 1MB 상한). 브라우저가 여기서
 * "글자로 된 표"까지만 만들고, 어느 상품의 재고를 깎을지는 전부 서버가 정한다.
 */

/** 표의 셀 하나. read-excel-file 의 Row 값과 CSV 문자열을 같이 받는다. */
export type Cell = string | number | boolean | Date | null

/**
 * CSV 바이트 → 문자열.
 *
 * 한국 윈도우 엑셀의 "CSV(쉼표로 분리)"는 UTF-8 이 아니라 CP949(EUC-KR)다.
 * UTF-8 로만 읽으면 상품명이 통째로 �� 가 되는데, 화면에는 "찾는 상품이
 * 없습니다"로만 보여서 원인을 절대 못 찾는다. fatal 로 먼저 읽어보고 던지면
 * EUC-KR 로 다시 읽는다. (EUC-KR 디코더는 웬만한 바이트열을 다 받아들이므로
 * 순서를 바꾸면 UTF-8 파일이 EUC-KR 로 잘못 읽힌다 — 순서가 중요하다.)
 */
export function decodeCsvBytes(buffer: ArrayBuffer): string {
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    text = new TextDecoder('euc-kr').decode(buffer)
  }
  // BOM 은 첫 헤더 이름에 붙어 열 자동 추측을 조용히 깨뜨린다.
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

/**
 * 구분자 추정: 헤더 줄(따옴표 밖)에서 가장 많이 나온 것.
 * 한국 POS 내보내기는 쉼표 외에 탭·세미콜론도 흔하다.
 */
function guessDelimiter(firstLine: string): string {
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 }
  let quoted = false
  for (const ch of firstLine) {
    if (ch === '"') quoted = !quoted
    else if (!quoted && ch in counts) counts[ch] += 1
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
}

/**
 * 구분자 파일(CSV/TSV) → 2차원 배열.
 *
 * 라이브러리를 안 쓰고 직접 짠 이유: 필요한 것이 따옴표·이스케이프·필드 안
 * 줄바꿈뿐이라 60줄이면 끝나고, 의존성 하나가 공급망 검사(minimumReleaseAge)
 * 대상 하나를 더 만든다. 따옴표 규칙은 RFC 4180 을 따른다 — "" 는 " 하나.
 */
export function parseDelimited(text: string): string[][] {
  if (!text.trim()) return []

  const firstNewline = text.indexOf('\n')
  const delimiter = guessDelimiter(
    firstNewline === -1 ? text : text.slice(0, firstNewline),
  )

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        field += ch
      }
      continue
    }

    if (ch === '"') {
      quoted = true
    } else if (ch === delimiter) {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      rows.push(row)
      row = []
    } else {
      field += ch
    }
  }
  // 마지막 줄이 개행 없이 끝나는 파일이 흔하다.
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  // 완전히 빈 줄은 표가 아니다. 엑셀 내보내기가 끝에 빈 줄을 흘리곤 한다.
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

/**
 * HTML 로 위장한 표 판별.
 *
 * 한국 발주·POS 시스템의 ".xls" 내보내기는 진짜 엑셀이 아니라 <table> HTML 인
 * 경우가 많다(실제 건별 주문현황 파일이 그랬다). 확장자로 자르면 멀쩡한 표를
 * 못 받으므로 내용으로 판별한다.
 */
export function looksLikeHtmlTable(text: string): boolean {
  return /<table[\s>]/i.test(text.slice(0, 4096))
}

/**
 * HTML <table> → 2차원 배열. 정규식 기반 순수 함수 — DOMParser 는 서버에
 * 없어서 못 쓴다. 표 안에 표가 든 문서는 다루지 않는다(이 계열 내보내기에는
 * 없고, 생기면 그 파일로 규칙을 다시 세운다).
 *
 * colspan 은 빈 칸으로 펼친다 — 병합된 머리글 줄("주문정보" 같은 묶음 제목)
 * 아래의 진짜 헤더 줄과 열 번호가 어긋나지 않게 하기 위해서다. 셀 안의
 * <button> 같은 태그는 글자만 남긴다.
 */
export function parseHtmlTable(text: string): string[][] {
  const rows: string[][] = []
  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  const cellRe = /<t([hd])\b([^>]*)>([\s\S]*?)<\/t\1>/gi

  let tr: RegExpExecArray | null
  while ((tr = trRe.exec(text))) {
    const row: string[] = []
    cellRe.lastIndex = 0
    let cell: RegExpExecArray | null
    while ((cell = cellRe.exec(tr[1]))) {
      const span = Number(/colspan\s*=\s*["']?(\d+)/i.exec(cell[2])?.[1] ?? 1)
      const value = decodeHtmlText(cell[3])
      row.push(value)
      for (let i = 1; i < span; i++) row.push('')
    }
    if (row.some((c) => c !== '')) rows.push(row)
  }
  return rows
}

function decodeHtmlText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 금액 문자열 → 정수 원.
 *
 * "1,600" "1,600원" "₩1,600" "1600.0" 전부 1600 으로. 음수·읽을 수 없는 값은
 * null — 조용히 0 으로 만들면 매출이 0 인 채 반영되고 나중에 출처를 못 찾는다.
 */
export function toMoney(raw: Cell): number | null {
  if (raw == null || raw instanceof Date || typeof raw === 'boolean') return null
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw >= 0 ? Math.round(raw) : null
  }
  const cleaned = raw.replace(/[^\d.\-]/g, '')
  if (!cleaned || cleaned === '-' || cleaned === '.') return null
  const n = Number(cleaned)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n)
}

/** 수량 문자열 → 양의 정수. "2개" "2.0" 은 2, 0·음수·소수는 null. */
export function toQuantity(raw: Cell): number | null {
  const n = toMoney(raw)
  if (n == null || n < 1) return null
  return n
}

/**
 * 날짜 셀 → 'YYYY-MM-DD'.
 *
 * 엑셀 Date 는 시간대가 없는 값이라 시간대 변환에 태우면 안 된다 —
 * toLocaleDateString 등을 거치면 라이브러리가 UTC 자정으로 만든 Date 가
 * KST 에서 전날이 되어 매출이 하루 밀린다. getUTC* 를 그대로 읽어 조립한다.
 *
 * 문자열은 한국에서 실제로 보이는 표기만 받는다:
 * 2026-07-29 · 2026.07.29 · 2026. 7. 29. · 2026/07/29 · 2026년 7월 29일 · 20260729
 * 연도 없는 "7/29" 는 받지 않는다 — 어느 해인지 추측하면 조용히 틀린다.
 */
export function normalizeDate(raw: Cell): string | null {
  if (raw == null || typeof raw === 'boolean') return null

  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null
    return build(raw.getUTCFullYear(), raw.getUTCMonth() + 1, raw.getUTCDate())
  }

  const s = String(raw).trim()
  if (!s) return null

  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(s)
  if (compact) return build(+compact[1], +compact[2], +compact[3])

  const m = /^(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})\s*[.일]?\s*$/.exec(s)
  if (m) return build(+m[1], +m[2], +m[3])

  return null
}

function build(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  // 2월 30일 같은 달력에 없는 날을 걸러낸다. UTC 라운드트립이 값을 밀면 무효.
  const t = new Date(Date.UTC(y, mo - 1, d))
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) {
    return null
  }
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** 셀을 매칭·표시용 문자열로. Date 는 날짜로, 숫자는 그대로 문자열로. */
export function cellToText(raw: Cell): string {
  if (raw == null) return ''
  if (raw instanceof Date) return normalizeDate(raw) ?? ''
  return String(raw).trim()
}
