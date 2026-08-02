/**
 * 상품 임포트의 열 지정. 판매 임포트(sales/import/columns.ts)와 같은 방식인데
 * 열의 "뜻" 목록이 다르다 — 판매는 무엇을 몇 개 팔았는지, 여기는 상품 그
 * 자체(이름·코드·가격·입수·분류)를 읽는다.
 *
 * 정규화·서명 함수는 판매 쪽 것을 그대로 가져다 쓴다. 로직이 같은데 복사하면
 * 한쪽만 고쳐지는 날이 온다.
 */

export { headerSignature, normalizeHeader } from '../../sales/import/columns'
import { normalizeHeader } from '../../sales/import/columns'

export type ProductColumnKey =
  | 'name'
  | 'code'
  | 'channel'
  | 'category'
  | 'pack'
  | 'cost'
  | 'price'

export type ProductColumnMap = Partial<Record<ProductColumnKey, number>>

export const COLUMN_LABEL: Record<ProductColumnKey, string> = {
  name: '제품명',
  code: '상품코드',
  channel: '유통방식',
  category: '분류(소분류)',
  // 여기만 "입수"를 괄호로 남긴다 — 짝지을 시트의 열 이름이 실제로 '입수' 라서,
  // 앱 용어로만 부르면 어느 열을 고를지 알 수 없다.
  pack: '박스당 개수 (입수)',
  cost: '매입가(원가)',
  price: '판매가',
}

export const COLUMN_HINT: Record<ProductColumnKey, string> = {
  name: '괄호 안 규격은 자동으로 떼어 설명에 보관합니다',
  code: '발주 코드. 바코드처럼 검색·스캔에 쓰입니다',
  channel: 'CJFW·택배·쿠팡처럼 어디서 들어오는지',
  category: '없는 분류는 등록하면서 새로 만들 수 있습니다',
  // 본사 발주 시트의 '입수' 열은 이 뜻이 **아니다** — 거기서는 박스를 몇 개
  // 샀는지(발주 수량)이고, 박스당 개수는 제품명 괄호 안 `30g*10입` 에 있다.
  // 그런데 사전이 '입수' → pack 으로 자동 연결하므로, 다음에 같은 시트를
  // 올리는 사람이 미리보기를 그대로 확정하면 2026-08-01 에 307개 상품을 다시
  // 환산해야 했던 사고가 그대로 반복된다. 힌트에 그 경고를 박아둔다.
  pack: '박스 하나에 든 낱개 수. 박스 수가 아닙니다. 초도 수량으로도 씁니다. ⚠ 본사 발주 시트의 "입수" 열은 발주한 박스 수라 여기 이으면 안 됩니다',
  cost: 'VAT 포함 매입가를 권장합니다 (마진 계산 기준)',
  price: '없으면 0원으로 두고 나중에 채울 수 있습니다',
}

/**
 * 자동 추측 사전. 정규화된 헤더가 여기 있으면 그 뜻으로 잇는다.
 * 본사 시트의 "매입가(vat+)"는 정규화에서 괄호가 떨어져 "매입가"가 되고,
 * "매입(vat-)"은 "매입"이 되므로 서로 안 섞인다 — 구체적인 말이 먼저다.
 * 대분류·합계금액·수익·마진률은 일부러 사전에 없다. 합계·마진은 앱이
 * 계산하는 값이고, 대분류는 분류를 소분류 한 단으로 쓰기로 했다.
 *
 * "구체적인 말이 먼저" 는 오래 거짓이었다. 예전 guessMapping 은 헤더를
 * 바깥에서 돌며 `words.includes(...)` 로 판정해서, 단어 목록의 순서가 아무
 * 영향을 못 주고 **시트에서 더 왼쪽에 있는 헤더가 이겼다.** 초도 시트는
 * `매입(vat-)` 가 8번째, `매입가(vat+)` 가 9번째라 **원가가 VAT 제외 금액에
 * 붙었다** — 원가가 약 9% 낮게 들어가고 그 값이 이동평균의 시드가 되어 마진이
 * 전부 부풀려지는데, 화면에는 아무 경고도 안 뜬다. 판매 임포트 쪽 columns.ts
 * 에 단어를 바깥에서 도는 guessMapping 이 있고 여기도 같은 구조다.
 */
const GUESS: [ProductColumnKey, string[]][] = [
  ['name', ['제품명', '상품명', '상품', '품명', '상품이름', 'name', 'product', '품목', '품목명']],
  ['code', ['상품코드', '발주코드', '코드', '품번', 'code', 'sku', 'barcode', '바코드']],
  ['channel', ['유통방식', '유통', '유통사구분', '입고방식', 'channel']],
  ['category', ['소분류', '분류', '카테고리', 'category', '상품군']],
  ['pack', ['입수', '입수량', '박스입수', '낱개수', 'pack']],
  // '매입' 은 반드시 맨 뒤다. 초도 시트의 `매입(vat-)` 가 이 말로 정규화되는데,
  // 같은 시트의 `매입가(vat+)` 가 우리가 원하는 열이다.
  ['cost', ['매입가', '원가', '매입단가', '공급가', 'cost', '매입']],
  ['price', ['판매가', '판매단가', '소비자가', '가격', 'price']],
]

export function guessMapping(headers: string[]): ProductColumnMap {
  const map: ProductColumnMap = {}
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
 * 매핑 기억. 판매 임포트와 키를 나눈다 — 한 키를 같이 쓰면 판매 파일을
 * 올린 순간 상품 쪽 기억이 지워진다 (저장이 서명 하나짜리라서).
 */
const STORAGE_KEY = 'zerostore.product-import.mapping.v1'

type SavedMapping = { signature: string; map: ProductColumnMap }

export function loadSavedMapping(signature: string): ProductColumnMap | null {
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

export function saveMapping(signature: string, map: ProductColumnMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ signature, map }))
  } catch {
    // 저장 실패는 기능 저하가 아니라 편의 저하다. 조용히 넘어간다.
  }
}
