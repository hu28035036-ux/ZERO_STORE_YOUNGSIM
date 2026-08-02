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

import { guessMapping as guessSales } from '../app/(app)/sales/import/columns.ts'
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
  // 할인 **전** 정가 합계여야 한다. 앱이 amount ÷ qty 로 정가를 내고, 그 값이
  // 등록 판매가와 맞는지로 매칭을 확인한다.
  assert.equal(MAECHUL[m.amount!], '매출금액')
})

test('매출현황: 뜻이 다른 금액 열은 하나도 안 붙는다', () => {
  const m = guessSales(MAECHUL)
  const attached = Object.values(m).map((i) => MAECHUL[i])
  // 실매출·순매출은 할인 후, 객단가는 할인 후 금액을 '건수'로 나눈 값이라
  // 수량과 안 맞는다. 셋 중 하나라도 붙으면 매출이 조용히 낮게 박힌다.
  for (const bad of ['실매출', '순매출', '객단가', '할인금액', '부가세']) {
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
