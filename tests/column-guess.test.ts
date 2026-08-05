/**
 * 열 자동 추측의 회귀 테스트.
 *
 * 여기 박아둔 헤더 두 벌은 지어낸 것이 아니라 **영등포성심점이 실제로 쓰는
 * 파일의 제목 줄 그대로**다. 이 매장은 앞으로도 같은 양식을 쓴다.
 *
 * 이 파일이 생긴 이유는 원가가 조용히 틀리는 버그 때문이다. 초도 발주 시트에는
 * `매입(vat-)` 와 `매입가(vat+)` 가 나란히 있는데, 예전 guessMapping 은 헤더를
 * 바깥에서 돌며 판정해서 **시트에서 더 왼쪽에 있는 `매입(vat-)` 가 이겼다.**
 * 원가가 약 9% 낮게 들어가고 그것이 이동평균의 시드가 되어 마진이 전부
 * 부풀려지는데, 화면에는 아무 경고도 안 뜬다. 실데이터가 무사했던 것은 초도
 * 358개를 화면이 아니라 RPC 로 넣었기 때문이지 코드가 맞아서가 아니었다.
 *
 * 그래서 이 테스트의 핵심은 단 한 줄이다 — cost 가 `매입가(vat+)` 에 붙는가.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  guessMapping as guessSales,
  isCountColumn,
} from '../app/(app)/sales/import/columns.ts'
import { guessMapping as guessProduct } from '../app/(app)/stock/import/columns.ts'

/** 본사 초도 발주 시트의 제목 줄. A열이 비어 있는 것까지 원본 그대로다. */
const CHODO = [
  '', '유통방식', '유통사', '대분류', '소분류', '상품코드', '제품명', '입수',
  '매입(vat-)', '매입가(vat+)', '합계금액(vat+)', '판매가', '수익', '마진률',
  '비고란', '6대 전용',
]

/** POS "메뉴별 매출현황" 의 제목 줄(3행). */
const MAECHUL = [
  '메뉴코드', '바코드번호', '메뉴명', '분류명', '거래건수', '매출금액',
  '할인금액', '판매건수', '실매출', '부가세', '순매출', '객단가', '판매수량',
  '판매옵션수량', '구성비(%)',
]

test('초도 시트: 원가는 VAT 포함 열에 붙는다', () => {
  const m = guessProduct(CHODO)
  assert.equal(CHODO[m.cost!], '매입가(vat+)', '원가가 VAT 제외 열에 붙으면 마진이 전부 거짓이 된다')
  assert.equal(CHODO[m.price!], '판매가')
})

test('초도 시트: 나머지 열도 제자리에 붙는다', () => {
  const m = guessProduct(CHODO)
  assert.equal(CHODO[m.name!], '제품명')
  assert.equal(CHODO[m.code!], '상품코드')
  assert.equal(CHODO[m.channel!], '유통방식')
  assert.equal(CHODO[m.category!], '소분류')
  // 주의: 시트의 '입수' 는 발주한 박스 수이지 박스당 개수가 아니다. 사전이
  // 이렇게 잇는 것은 맞지만, 사람이 그대로 확정하면 안 된다는 경고가
  // COLUMN_HINT.pack 에 있다.
  assert.equal(CHODO[m.pack!], '입수')
})

test('원가·매입가가 둘 다 있으면 매입가가 이긴다', () => {
  const headers = ['제품명', '코드', '원가', '매입가', '판매가']
  const m = guessProduct(headers)
  assert.equal(headers[m.cost!], '매입가', '사전에서 앞선 말이 이겨야 한다')
})

test('가격·판매가가 둘 다 있으면 판매가가 이긴다', () => {
  const headers = ['상품명', '수량', '가격', '판매가']
  assert.equal(headers[guessProduct(headers).price!], '판매가')
  assert.equal(headers[guessSales(headers).price!], '판매가')
})

test('매출현황: 네 열이 붙는다', () => {
  const m = guessSales(MAECHUL)
  assert.equal(MAECHUL[m.barcode!], '바코드번호')
  assert.equal(MAECHUL[m.name!], '메뉴명')
  assert.equal(MAECHUL[m.qty!], '판매수량')
  // 할인 **후** 실제로 받은 돈이어야 한다. 이 값이 그대로 원장의 매출이 된다.
  // '매출금액'(할인 전)을 집으면 반값행사 줄이 두 배로 박힌다.
  assert.equal(MAECHUL[m.amount!], '실매출')
})

test('매출현황: 뜻이 다른 금액 열은 하나도 안 붙는다', () => {
  const m = guessSales(MAECHUL)
  const attached = Object.values(m).map((i) => MAECHUL[i])
  // '순매출' 은 부가세를 뺀 값이라 매출이 10% 작게 박히고, '객단가' 는 표준
  // 뜻이 매출÷거래건수라 수량이 여러 개인 줄에서 어긋난다. '매출금액' 은
  // 할인 전 정가라 반값행사 줄을 두 배로 만든다 — 실매출이 있으면 지고 있어야
  // 한다. 넷 중 하나라도 붙으면 매출이 조용히 틀린다.
  for (const bad of ['매출금액', '순매출', '객단가', '할인금액', '부가세']) {
    assert.ok(!attached.includes(bad), `${bad} 가 붙었다`)
  }
  // 분류명을 option 에 이으면 안 된다 — `상온) 시리얼/쉐이크` 같은 값인데
  // 이 앱의 옵션은 변형 축이고 초도 상품은 전부 옵션이 없다.
  assert.equal(m.option, undefined)
  // 파일에 날짜 열이 아예 없다. 화면에서 날짜를 고르는 경로로 가야 한다.
  assert.equal(m.date, undefined)
  // 단가는 비워 둬야 앱이 amount ÷ qty 로 정가를 낸다.
  assert.equal(m.price, undefined)
})

test('매출현황: 수량은 건수가 아니라 판매수량이다', () => {
  const m = guessSales(MAECHUL)
  assert.equal(MAECHUL[m.qty!], '판매수량')
  // 이 시트에는 건수처럼 생긴 열이 둘 있다. 한 손님이 3개를 사면 건수는 1,
  // 수량은 3이다 — 건수가 붙으면 재고가 덜 빠지고 아무 데도 티가 안 난다.
  for (const bad of ['거래건수', '판매건수']) {
    assert.ok(
      !Object.values(m).map((i) => MAECHUL[i]).includes(bad),
      `${bad} 가 붙었다`,
    )
  }
})

test('수량과 판매수량이 둘 다 있으면 판매수량이 이긴다', () => {
  // 열 순서를 뒤집어도 결과가 같아야 한다 — 시트에서 더 왼쪽이라는 이유로
  // 뭉뚱그린 열이 이기던 것이 amount 쪽에서 이미 겪은 버그다.
  for (const headers of [
    ['상품명', '수량', '판매수량', '금액'],
    ['상품명', '판매수량', '수량', '금액'],
  ]) {
    assert.equal(headers[guessSales(headers).qty!], '판매수량')
  }
  assert.equal(guessSales(['상품명', '개수', '판매개수']).qty, 2)
})

test('건수 열은 수량 자리에 절대 안 붙는다', () => {
  // 판매수량이 아예 없는 내보내기. 건수로 때우느니 비워 두고 사람에게 묻는다 —
  // 화면이 이 상태에서 열 지정을 띄우고 계속 버튼을 잠근다.
  const m = guessSales(['메뉴명', '거래건수', '판매건수', '실매출'])
  assert.equal(m.qty, undefined)
})

test('isCountColumn: 건수만 잡고 수량은 안 잡는다', () => {
  for (const yes of ['판매건수', '거래건수', '판매 건수', '판매건수(건)', '건수']) {
    assert.ok(isCountColumn(yes), `${yes} 를 못 잡았다`)
  }
  for (const no of ['판매수량', '수량', '개수', '판매옵션수량', 'qty', '']) {
    assert.ok(!isCountColumn(no), `${no} 를 잘못 잡았다`)
  }
})

test('평범한 판매 CSV 는 예전과 똑같이 붙는다', () => {
  const headers = ['날짜', '바코드', '상품명', '수량', '단가', '금액']
  const m = guessSales(headers)
  assert.deepEqual(
    { date: headers[m.date!], barcode: headers[m.barcode!], name: headers[m.name!],
      qty: headers[m.qty!], price: headers[m.price!], amount: headers[m.amount!] },
    { date: '날짜', barcode: '바코드', name: '상품명', qty: '수량', price: '단가', amount: '금액' },
  )
})

test('한 열은 한 뜻에만 쓰인다', () => {
  // '금액' 하나뿐이면 amount 가 가져가고 price 는 빈 채로 남아야 한다.
  const headers = ['상품명', '수량', '금액']
  const m = guessSales(headers)
  assert.equal(headers[m.amount!], '금액')
  assert.equal(m.price, undefined)
})

test('실매출이 없는 POS 는 매출금액으로 떨어진다', () => {
  // 할인 열이 아예 없는 내보내기도 있다. 그때는 매출금액이 곧 받은 돈이라
  // 이 자리를 비워 두면 등록 판매가로 반영돼 파일이 말한 값과 어긋난다.
  const headers = ['바코드번호', '메뉴명', '매출금액', '판매수량']
  const m = guessSales(headers)
  assert.equal(headers[m.amount!], '매출금액')
})

test('실매출과 매출금액이 같이 있으면 실매출이 이긴다', () => {
  // 열 순서를 뒤집어도 결과가 같아야 한다 — 시트에서 더 왼쪽이라는 이유로
  // 할인 전 금액이 이기던 것이 원래 버그였다.
  for (const headers of [
    ['수량', '매출금액', '실매출'],
    ['수량', '실매출', '매출금액'],
  ]) {
    assert.equal(headers[guessSales(headers).amount!], '실매출')
  }
})
