/**
 * POS 메뉴명이 검색과 목록에서 어떻게 다뤄지는지.
 *
 * 두 가지가 이 기능의 전부다 — 검색이 pos_name 도 훑는가, 그리고 목록이
 * "표기만 다른" 이름을 걸러내는가. 둘 다 조용히 틀리기 쉬운 종류다:
 * 검색 조건에서 pos_name 이 빠지면 값은 저장되는데 영영 안 찾히고,
 * 목록 규칙이 느슨하면 상품 3분의 1에 부제가 붙어 정작 진짜 다른 이름이
 * 파묻힌다.
 *
 * 아래 이름 쌍은 실제 데이터에서 가져온 것이다.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { posSubtitle } from '../app/(app)/stock/query.ts'
import { likePattern, productSearchFilter } from '../lib/search.ts'

test('검색 조건이 pos_name 을 훑는다', () => {
  const f = productSearchFilter(likePattern('데일리얌'))
  assert.ok(f.includes('pos_name.ilike.%데일리얌%'), 'pos_name 이 빠지면 저장만 되고 안 찾힌다')
  // 기존 셋도 그대로 남아 있어야 한다.
  for (const col of ['product_name', 'sku', 'barcode']) {
    assert.ok(f.includes(`${col}.ilike.%데일리얌%`), `${col} 이 빠졌다`)
  }
})

test('검색어 정제는 그대로다 — or() 를 깨뜨리는 글자는 걸러진다', () => {
  // 쉼표 하나에 or() 필터가 통째로 깨져 400 이 난다.
  assert.equal(likePattern('딸기,잼'), '%딸기 잼%')
  assert.equal(likePattern('%'), '')
})

test('표기만 다르면 목록에 부제를 안 그린다', () => {
  // 확정 매칭의 36% 가 이 수준이다. 다 그리면 목록이 두 배가 된다.
  assert.equal(
    posSubtitle({ product_name: '라라스윗 저당 카라멜 팝콘', pos_name: '라라스윗) 저당 카라멜 팝콘' }),
    null,
  )
  assert.equal(
    posSubtitle({ product_name: '클룹 애사비소다 리치제로', pos_name: '클룹) 애사비소다 리치제로' }),
    null,
  )
})

test('실질적으로 다른 이름은 그린다', () => {
  // 브랜드가 아예 바뀐 것들 — 이게 부제를 두는 이유다.
  assert.equal(
    posSubtitle({ product_name: '킬로리 얌얌쉐이크 딸기', pos_name: '데일리얌) 얌얌쉐이크 딸기맛' }),
    '데일리얌) 얌얌쉐이크 딸기맛',
  )
  assert.equal(
    posSubtitle({ product_name: '오츠카 나랑드사이다', pos_name: '동아) 나랑드사이다 제로' }),
    '동아) 나랑드사이다 제로',
  )
})

test('POS 메뉴명이 없으면 아무것도 안 그린다', () => {
  assert.equal(posSubtitle({ product_name: '고기어트 간편식 동파육맛', pos_name: null }), null)
  assert.equal(posSubtitle({ product_name: '고기어트 간편식 동파육맛', pos_name: '   ' }), null)
})
