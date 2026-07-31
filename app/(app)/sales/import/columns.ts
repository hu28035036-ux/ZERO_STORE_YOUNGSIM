/**
 * 열 지정 — "이 열이 바코드, 저 열이 수량"을 정하는 일.
 *
 * 파일 양식이 정해져 있지 않아서(포스기마다, 사람마다 다르다) 업로드한 표의
 * 열을 앱의 뜻에 손으로 잇는 단계가 필요하다. 헤더 이름으로 최대한 자동
 * 추측하고, 같은 모양의 파일은 지난 지정을 기억해서 다음부터는 그냥 올리기만
 * 하면 되게 한다.
 */

export type ColumnKey =
  | 'barcode'
  | 'name'
  | 'option'
  | 'qty'
  | 'price'
  | 'amount'
  | 'date'

/** 열 뜻 → 파일의 몇 번째 열인지. 없으면 그 뜻은 파일에 없는 것. */
export type ColumnMap = Partial<Record<ColumnKey, number>>

export const COLUMN_LABEL: Record<ColumnKey, string> = {
  barcode: '바코드',
  name: '상품명',
  option: '옵션',
  qty: '수량',
  price: '단가',
  amount: '금액(합계)',
  date: '판매일',
}

export const COLUMN_HINT: Record<ColumnKey, string> = {
  barcode: '있으면 정확히 한 상품으로 맞습니다',
  name: '바코드가 없거나 못 찾은 줄은 이름으로 찾습니다',
  option: '같은 이름이 여러 개일 때 옵션으로 좁힙니다',
  qty: '판 개수',
  price: '한 개 가격. 없으면 금액÷수량 또는 등록 판매가를 씁니다',
  amount: '줄 합계. 단가가 없을 때 수량으로 나눠 씁니다',
  date: '없으면 화면에서 날짜 하나를 고릅니다',
}

/**
 * 헤더 이름 정규화: 소문자, 공백·괄호·단위 제거.
 * "판매수량(개)" 와 "판매 수량" 이 같은 것으로 읽히게 한다.
 */
export function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[\s_\-.:'"‘’“”]/g, '')
}

/**
 * 자동 추측 사전. 정규화된 헤더가 여기 있으면 그 뜻으로 잇는다.
 * 앞선 항목이 우선이다 — "판매금액" 이 amount 와 price 둘 다에 걸리면 안 되므로
 * 구체적인 말을 먼저 적는다.
 */
const GUESS: [ColumnKey, string[]][] = [
  ['barcode', ['바코드', 'barcode', '바코드번호', 'code', 'jan', 'ean', 'upc']],
  ['name', ['상품명', '상품', '품명', '제품명', '상품이름', 'name', 'product', 'item', '품목', '품목명']],
  ['qty', ['수량', '판매수량', '개수', '판매개수', 'qty', 'quantity', '갯수']],
  ['amount', ['금액', '합계', '판매금액', '매출', '매출액', '합계금액', 'amount', 'total', '총액']],
  ['price', ['단가', '판매단가', '판매가', '가격', 'price', 'unitprice']],
  ['date', ['날짜', '판매일', '판매일자', '일자', '거래일', '거래일자', 'date', '영업일']],
  ['option', ['옵션', '규격', '사이즈', 'option', '옵션명']],
]

export function guessMapping(headers: string[]): ColumnMap {
  const map: ColumnMap = {}
  const used = new Set<number>()

  for (const [key, words] of GUESS) {
    for (let i = 0; i < headers.length; i++) {
      if (used.has(i)) continue
      if (words.includes(normalizeHeader(headers[i]))) {
        map[key] = i
        used.add(i)
        break
      }
    }
  }
  return map
}

/**
 * 헤더 서명: 같은 모양의 파일인지 알아보는 열쇠.
 * 정규화한 헤더를 이어 붙인 것이라 열 순서가 바뀌면 다른 파일로 본다 —
 * 순서가 바뀌었는데 지난 지정을 그대로 쓰면 수량이 단가 자리에 들어간다.
 */
export function headerSignature(headers: string[]): string {
  return headers.map(normalizeHeader).join('')
}

/**
 * 매핑 기억은 localStorage 다. DB 에 두려면 테이블·RPC·RLS·타입 재생성이 전부
 * 따라오는데, 매핑은 기기별·파일모양별 소모품이고 임포트는 어차피 PC 에서
 * 하는 일이라 기기별 저장으로 충분하다. 나중에 여러 기기에서 공유해야 하면
 * app_settings(단일 행)에 jsonb 한 칸으로 옮기면 된다.
 */
const STORAGE_KEY = 'zerostore.sales-import.mapping.v1'

type SavedMapping = { signature: string; map: ColumnMap }

export function loadSavedMapping(signature: string): ColumnMap | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const saved = JSON.parse(raw) as SavedMapping
    return saved.signature === signature ? saved.map : null
  } catch {
    // 사파리 프라이빗 모드 등 localStorage 가 막힌 환경. 기억만 못 할 뿐이다.
    return null
  }
}

export function saveMapping(signature: string, map: ColumnMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ signature, map }))
  } catch {
    // 저장 실패는 기능 저하가 아니라 편의 저하다. 조용히 넘어간다.
  }
}
