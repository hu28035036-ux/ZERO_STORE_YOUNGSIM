/**
 * 입고 파일의 열 지정. 상품 임포트(stock/import/columns.ts)와 같은 방식인데
 * 열의 "뜻" 목록이 다르다 — 저기는 상품 그 자체를 읽고, 여기는 "무엇이 몇 개
 * 들어왔는지"만 읽는다. 정규화·서명 함수는 판매 쪽 것을 그대로 쓴다.
 */

export { headerSignature, normalizeHeader } from '../../sales/import/columns'
import { normalizeHeader } from '../../sales/import/columns'

export type PurchaseColumnKey = 'code' | 'name' | 'qty' | 'cost' | 'total'

export type PurchaseColumnMap = Partial<Record<PurchaseColumnKey, number>>

export const COLUMN_LABEL: Record<PurchaseColumnKey, string> = {
  code: '상품코드·바코드',
  name: '제품명',
  qty: '수량',
  cost: '매입가',
  total: '합계금액',
}

export const COLUMN_HINT: Record<PurchaseColumnKey, string> = {
  code: '발주 코드나 바코드. 이름보다 정확하게 짝지어집니다',
  name: '코드가 없을 때 이 이름으로 등록된 상품을 찾습니다',
  // 본사 발주 시트의 '입수' 열이 실제로는 "발주한 박스 수"다 (초도 반영 때
  // 확인된 사실). 그래서 이 화면은 박스당 개수가 등록된 상품이면 이 수량을
  // 박스 수로 해석해 낱개로 환산한다 — 미리보기가 그 환산을 그대로 보여준다.
  qty: '들어온 수량. 박스당 개수가 등록된 상품은 박스 수로 해석해 낱개로 환산합니다',
  cost: 'VAT 포함 매입가. 생략하면 합계금액÷수량, 그것도 없으면 지금 원가를 씁니다',
  total: 'VAT 포함 줄 합계. 매입가 열이 없는 주문내역서는 이 값을 수량으로 나눠 원가를 구합니다',
}

/**
 * 자동 추측 사전. 구체적인 말이 먼저다 — 단어를 바깥에서 돌기 때문에 사전
 * 앞쪽 단어가 시트 어디에 있든 먼저 이긴다 (0018 에서 고친 규칙).
 *
 * '입수' 가 qty 에 있는 이유: 본사 발주 시트의 수량 열 이름이 실제로 '입수'다.
 * 그 값은 발주 박스 수이고, 환산은 상품의 박스당 개수(units_per_pack)가 한다.
 * '주문량' 은 본사 주문내역서(2026-08-08 실물)의 수량 열이다.
 *
 * '단가' 를 cost 에 **일부러 안 넣는다.** 주문내역서의 `단가` 는 VAT 제외
 * 금액이라(부가세가 딴 열) 그대로 원가에 넣으면 9% 낮게 들어간다 — 0018 때
 * `매입(vat-)` 로 이미 겪은 사고다. 그런 파일은 `합계금액 ÷ 수량` 이 VAT
 * 포함 원가라서 total 경로가 맞는 값을 만든다.
 */
const GUESS: [PurchaseColumnKey, string[]][] = [
  ['code', ['상품코드', '발주코드', '바코드', '바코드번호', '코드', '품번', 'code', 'sku', 'barcode']],
  ['name', ['제품명', '상품명', '상품', '품명', '메뉴명', '상품이름', 'name', 'product', '품목', '품목명']],
  ['qty', ['입고수량', '발주수량', '주문수량', '주문량', '수량', '입수', '개수', 'qty', 'quantity']],
  // '매입' 은 반드시 맨 뒤 — `매입(vat-)` 가 이 말로 정규화되는데 우리가
  // 원하는 열은 `매입가(vat+)` 다 (상품 임포트와 같은 함정).
  ['cost', ['매입가', '원가', '매입단가', '공급가', 'cost', '매입']],
  // '주문금액' 은 안 넣는다 — 주문내역서에서 그 열은 VAT 제외(단가×수량)다.
  ['total', ['합계금액', '합계', '총액', 'total']],
]

export function guessMapping(headers: string[]): PurchaseColumnMap {
  const map: PurchaseColumnMap = {}
  const used = new Set<number>()
  const normalized = headers.map(normalizeHeader)

  for (const [key, words] of GUESS) {
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

/** 매핑 기억. 판매·상품 임포트와 키를 나눈다 — 한 키를 같이 쓰면 서로 지운다. */
const STORAGE_KEY = 'zerostore.purchase-import.mapping.v1'

type SavedMapping = { signature: string; map: PurchaseColumnMap }

export function loadSavedMapping(signature: string): PurchaseColumnMap | null {
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

export function saveMapping(signature: string, map: PurchaseColumnMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ signature, map }))
  } catch {
    // 저장 실패는 기능 저하가 아니라 편의 저하다. 조용히 넘어간다.
  }
}
