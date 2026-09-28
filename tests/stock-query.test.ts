/**
 * 재고 목록 주소의 쪽 번호(?page=).
 *
 * 쪽은 주소에 싣는다 — 뒤로 가기·새로고침·링크 복사가 보던 쪽을 그대로 연다. 조용히 틀리기
 * 쉬운 것은 둘이다: 이상한 값(0, 음수, 글자)이 그대로 offset 이 되어 DB 오류가 나는 것, 그리고
 * 필터·정렬·검색을 바꿨는데 보던 쪽 번호가 남아 "부족·품절 7쪽" 같은 빈 화면으로 가는 것.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { parseStockQuery, sortHref, stockHref } from '../app/(app)/stock/query.ts'

test('쪽 번호가 없거나 이상하면 1쪽이다', () => {
  assert.equal(parseStockQuery({}).page, 1)
  for (const raw of ['', '0', '-2', 'abc', '2.5', '1e3']) {
    assert.equal(parseStockQuery({ page: raw }).page, 1, `page=${raw}`)
  }
  // ?page=2&page=3 처럼 두 번 오면 배열이 된다.
  assert.equal(parseStockQuery({ page: ['2', '3'] }).page, 1)
})

test('쪽 번호를 읽는다 — 터무니없이 큰 값은 상한에 멈춘다', () => {
  assert.equal(parseStockQuery({ page: '3' }).page, 3)
  // 그대로 두면 offset 이 3e+21 같은 표기가 되어 DB 가 범위를 못 읽는다.
  assert.equal(parseStockQuery({ page: '99999999999999999999' }).page, 10_000)
})

test('1쪽은 주소에 안 남기고, 그 밖의 쪽은 남긴다', () => {
  const base = parseStockQuery({})
  assert.equal(stockHref(base, { page: 1 }), '/stock')
  assert.equal(stockHref(base, { page: 4 }), '/stock?page=4')
})

test('쪽을 넘겨도 보던 검색·필터·정렬은 그대로다', () => {
  const q = parseStockQuery({ q: '곤약', filter: 'low', sort: 'qty', dir: 'desc', page: '2' })
  assert.equal(stockHref(q, { page: 3 }), '/stock?q=%EA%B3%A4%EC%95%BD&filter=low&sort=qty&dir=desc&page=3')
})

test('필터·정렬을 바꾸면 1쪽으로 돌아간다', () => {
  const q = parseStockQuery({ filter: 'low', page: '2' })
  // 부족·품절 2쪽에서 "전체"를 누르면 전체 1쪽이다 — 2쪽이 남으면 엉뚱한 자리부터 보인다.
  assert.equal(stockHref(q, { filter: 'all' }), '/stock')
  assert.equal(sortHref(q, 'price'), '/stock?filter=low&sort=price&dir=desc')
})
