/**
 * 발주 시트 제품명 정제의 고정 케이스.
 *
 * 이 휴리스틱이 틀리면 조용히 상품이 뭉개진다. 괄호를 통째로 규격으로 보면
 * 괄호 안에 든 **맛**이 날아가서 같은 라인의 다른 맛들이 전부 한 이름이 되고,
 * 그러면 POS 상품과 대조할 때 "앱에 없는 신규"로 잘못 분류된다.
 * 실제로 그 실수로 이미 있는 상품 9건이 신규로 잡힌 적이 있다.
 *
 * 아래 이름은 전부 본사 초도 시트에 실제로 있는 값이다.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { cleanProductName } from '../app/(app)/stock/import/clean-name.ts'

test('괄호가 규격이면 떼어내고 설명으로 보낸다', () => {
  const r = cleanProductName('마이노멀 딸기잼(제로스토어용 320g*12입 3.84Kg/BOX)')
  assert.equal(r.name, '마이노멀 딸기잼')
  assert.ok(r.spec?.includes('320g*12입'))
})

test('괄호가 맛이면 이름에 그대로 남긴다', () => {
  // 이걸 떼면 꼭꼬칩 두 종이 한 이름이 된다.
  assert.equal(cleanProductName('단슐랭 꼭꼬칩(핫불닭맛)').name, '단슐랭 꼭꼬칩(핫불닭맛)')
  assert.equal(cleanProductName('단슐랭 꼭꼬칩(숯불갈비맛)').name, '단슐랭 꼭꼬칩(숯불갈비맛)')
})

test('맛과 규격이 한 괄호에 섞여 있으면 맛만 이름으로 돌려붙인다', () => {
  // 이 처리가 없으면 클룹 애사비소다 5종이 전부 '클룹 애사비소다' 하나가 된다.
  const r = cleanProductName('클룹 애사비소다(리치제로_500ml 500g/24EA)')
  assert.equal(r.name, '클룹 애사비소다 리치제로')
  assert.ok(r.spec?.includes('500ml'))

  const r2 = cleanProductName('한끼통살 후식주먹밥(참기름김치치즈맛 100g/EA)')
  assert.equal(r2.name, '한끼통살 후식주먹밥 참기름김치치즈맛')
})

test('묶음출고·제로스토어용 같은 규격 말은 이름에서 걷어낸다', () => {
  const r = cleanProductName('꼬기다 프리미엄닭가슴살(제로스토어용 제육볶음맛_묶음출고_100g*10입 1Kg/EA)')
  assert.equal(r.name, '꼬기다 프리미엄닭가슴살 제육볶음맛')
})

test('끝의 "-30개" 꼬리는 규격으로 뗀다', () => {
  const r = cleanProductName('단슐랭 꼭꼬칩(핫불닭맛)-30개')
  assert.equal(r.name, '단슐랭 꼭꼬칩(핫불닭맛)')
  assert.ok(r.spec?.includes('30개'))
})

test('괄호가 없으면 이름을 건드리지 않는다', () => {
  const r = cleanProductName('고기어트 간편식 동파육맛')
  assert.equal(r.name, '고기어트 간편식 동파육맛')
  assert.equal(r.spec, null)
})
