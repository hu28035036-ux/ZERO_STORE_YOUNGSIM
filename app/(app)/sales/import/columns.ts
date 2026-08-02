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
 *
 * **두 층의 순서가 다 뜻을 갖는다.**
 * 1. 바깥(뜻)의 순서 — "판매금액" 이 amount 와 price 둘 다에 걸리면 안 되므로
 *    먼저 집어야 할 뜻을 위에 둔다. 한 열은 한 뜻에만 쓰인다(`used`).
 * 2. 안쪽(단어)의 순서 — 구체적인 말을 먼저 적는다. 한 뜻에 걸리는 헤더가
 *    시트에 둘 있을 때 어느 쪽을 고를지가 여기서 정해진다.
 *
 * 2번은 오래 거짓이었다. `words.includes(정규화된헤더)` 로 헤더를 바깥에서
 * 돌리면 단어 목록의 순서가 아무 영향을 못 주고 **시트에서 더 왼쪽에 있는
 * 헤더가 이긴다.** 상품 임포트 쪽에서 이 때문에 원가가 `매입가(vat+)` 가
 * 아니라 `매입(vat-)` 에 붙었다. guessMapping 이 단어를 바깥에서 도는 것은
 * 그래서다 — 이 구조를 되돌리면 그 버그가 그대로 돌아온다.
 *
 * 사전에 단어를 넣을 때는 **접두사가 겹치는 말을 피하고 전체 헤더 이름을
 * 그대로 적는다.** 예를 들어 `매출` 만 넣으면 지금은 완전 일치라 무해하지만,
 * 누군가 판정을 `startsWith` 로 바꾸는 순간 `실매출`(할인 후)·`순매출`(부가세
 * 제외)까지 amount 후보가 되어 매출이 조용히 낮게 박힌다.
 */
const GUESS: [ColumnKey, string[]][] = [
  ['barcode', ['바코드', 'barcode', '바코드번호', 'code', 'jan', 'ean', 'upc']],
  // '메뉴명' 은 이 매장 POS(메뉴별 매출현황)의 표기다. 앞으로도 같은 양식을 쓴다.
  ['name', ['상품명', '상품', '품명', '제품명', '상품이름', 'name', 'product', 'item', '품목', '품목명', '메뉴명']],
  ['qty', ['수량', '판매수량', '개수', '판매개수', 'qty', 'quantity', '갯수']],
  // '매출금액' 도 같은 POS 표기이고, 이 열이 **할인 전 정가 합계**다.
  // 옆에 있는 실매출·순매출·객단가는 전부 할인 후라 여기 넣으면 안 된다.
  // '매출' 은 뒤에 둔다 — 이 매장 시트에는 '매출' 이라는 열이 없고,
  // 앞에 두면 '매출금액' 보다 먼저 집으려 들어 뜻이 흐려진다.
  ['amount', ['매출금액', '금액', '합계', '판매금액', '매출액', '합계금액', 'amount', 'total', '총액', '매출']],
  // '객단가' 를 넣고 싶은 유혹이 생기는데 넣지 마라 — 할인 후 금액을 판매
  // '건수'로 나눈 값이라 단가처럼 생겼을 뿐 수량과 안 맞는다.
  ['price', ['단가', '판매단가', '판매가', '가격', 'price', 'unitprice']],
  ['date', ['날짜', '판매일', '판매일자', '일자', '거래일', '거래일자', 'date', '영업일']],
  ['option', ['옵션', '규격', '사이즈', 'option', '옵션명']],
]

export function guessMapping(headers: string[]): ColumnMap {
  const map: ColumnMap = {}
  const used = new Set<number>()
  const normalized = headers.map(normalizeHeader)

  for (const [key, words] of GUESS) {
    // 단어가 바깥이다. 사전의 앞쪽 단어가 시트의 어디에 있든 먼저 이긴다.
    search: for (const word of words) {
      for (let i = 0; i < normalized.length; i++) {
        if (used.has(i)) continue
        if (normalized[i] === word) {
          map[key] = i
          used.add(i)
          break search
        }
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
