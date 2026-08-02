/**
 * 박스 매입가 → 낱개 원가.
 *
 * 이 값은 미리보기 화면과 원장 전표 양쪽에 들어가고 **같아야 한다**. 어긋나면
 * 화면에 1,000원이라고 써놓고 전표에 999.99 가 박히는데, 사장님이 앱을 못 믿게
 * 되는 종류의 어긋남이다. SQL 의 receive_kit 도 round(총액/총수량, 2) 로 같다.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { unitCostFromBox } from '../lib/kit-cost.ts'

test('개수대로 나눈다', () => {
  // 곤약젤리 1박스 30개에 30,000원 → 낱개 1,000원
  assert.equal(unitCostFromBox(30000, 1, 30), 1000)
  // 2박스 60개면 낱개 값은 그대로다
  assert.equal(unitCostFromBox(30000, 2, 60), 1000)
})

test('실제로 다르게 온 날은 들어온 개수로 나눈다', () => {
  // 30,000원짜리 박스인데 20개만 왔으면 낱개가 비싸진다. 박스 기준으로
  // 1,000원을 밀어넣으면 10,000원어치가 장부에서 증발한다.
  assert.equal(unitCostFromBox(30000, 1, 20), 1500)
})

test('나누어떨어지지 않으면 소수 둘째 자리까지', () => {
  assert.equal(unitCostFromBox(30000, 1, 29), 1034.48)
  assert.equal(unitCostFromBox(1000, 1, 3), 333.33)
})

test('매입가를 안 넣으면 null — 원가를 건드리지 않는다는 뜻이다', () => {
  assert.equal(unitCostFromBox(null, 1, 30), null)
})

test('0 으로 나누지 않는다', () => {
  // Infinity 가 원가 자리에 흘러가면 재고 자산이 통째로 망가진다.
  assert.equal(unitCostFromBox(30000, 1, 0), null)
  assert.equal(unitCostFromBox(30000, 0, 30), null)
})

test('음수·이상값은 받지 않는다', () => {
  assert.equal(unitCostFromBox(-1, 1, 30), null)
  assert.equal(unitCostFromBox(Number.NaN, 1, 30), null)
  assert.equal(unitCostFromBox(30000, 1, Number.NaN), null)
})

test('매입가 0 은 유효하다 — 사은품 박스', () => {
  assert.equal(unitCostFromBox(0, 1, 30), 0)
})
