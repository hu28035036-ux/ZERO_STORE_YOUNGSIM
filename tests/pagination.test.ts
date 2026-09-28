/**
 * 쪽 번호 줄 — 재고 목록이 30개씩 쪽으로 나뉜다(2026-09-28, 무한 스크롤 대신).
 *
 * 425개면 15쪽이라 번호를 다 늘어놓으면 360px 휴대폰에 안 들어간다. 그래서 처음·끝·현재
 * 쪽과 그 양옆만 보이고 나머지는 "…"로 접는다. 조용히 틀리기 쉬운 것 셋을 여기서 잡는다:
 * 칸 수가 쪽마다 달라지면 넘길 때마다 버튼이 옆으로 움직여 같은 자리를 연달아 못 누르고,
 * "…"가 한 쪽만 숨기면 번호 하나를 보여주는 것보다 못하며, 현재 쪽이 줄에서 빠지면
 * 지금 몇 쪽인지 모른다.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { pageCount, pageItems } from '../lib/pagination.ts'

test('쪽 수는 올림이고, 비어 있어도 1쪽이다', () => {
  assert.equal(pageCount(425, 30), 15) // 2026-09-28 재고 목록
  assert.equal(pageCount(30, 30), 1)
  assert.equal(pageCount(31, 30), 2)
  assert.equal(pageCount(0, 30), 1)
})

test('쪽이 적으면 전부 보인다', () => {
  assert.deepEqual(pageItems(1, 1, 1), [1])
  assert.deepEqual(pageItems(2, 5, 1), [1, 2, 3, 4, 5])
  assert.deepEqual(pageItems(4, 7, 1), [1, 2, 3, 4, 5, 6, 7])
})

test('PC(양옆 1쪽) — 15쪽에서 처음·가운데·끝', () => {
  assert.deepEqual(pageItems(1, 15, 1), [1, 2, 3, 4, 5, 'gap', 15])
  assert.deepEqual(pageItems(4, 15, 1), [1, 2, 3, 4, 5, 'gap', 15])
  assert.deepEqual(pageItems(5, 15, 1), [1, 'gap', 4, 5, 6, 'gap', 15])
  assert.deepEqual(pageItems(11, 15, 1), [1, 'gap', 10, 11, 12, 'gap', 15])
  assert.deepEqual(pageItems(12, 15, 1), [1, 'gap', 11, 12, 13, 14, 15])
  assert.deepEqual(pageItems(15, 15, 1), [1, 'gap', 11, 12, 13, 14, 15])
})

test('휴대폰(양옆 0쪽) — 처음·현재·끝만', () => {
  assert.deepEqual(pageItems(1, 15, 0), [1, 2, 3, 'gap', 15])
  assert.deepEqual(pageItems(3, 15, 0), [1, 2, 3, 'gap', 15])
  assert.deepEqual(pageItems(4, 15, 0), [1, 'gap', 4, 'gap', 15])
  assert.deepEqual(pageItems(13, 15, 0), [1, 'gap', 13, 14, 15])
  assert.deepEqual(pageItems(15, 15, 0), [1, 'gap', 13, 14, 15])
})

test('범위 밖의 현재 쪽은 가까운 끝으로 붙인다', () => {
  assert.deepEqual(pageItems(99, 15, 1), pageItems(15, 15, 1))
  assert.deepEqual(pageItems(0, 15, 1), pageItems(1, 15, 1))
})

test('어떤 쪽 수·현재 쪽에서도 규칙이 지켜진다', () => {
  for (const siblings of [0, 1, 2]) {
    const slots = 2 * siblings + 5
    for (let total = 1; total <= 40; total++) {
      for (let current = 1; current <= total; current++) {
        const items = pageItems(current, total, siblings)
        const where = `total=${total} current=${current} siblings=${siblings}: ${items.join(' ')}`
        const numbers = items.filter((i): i is number => i !== 'gap')

        // 칸 수가 일정해야 넘길 때 버튼이 제자리에 있다.
        assert.equal(items.length, Math.min(total, slots), where)
        assert.ok(numbers.includes(1) && numbers.includes(total), `처음·끝이 빠졌다 — ${where}`)
        assert.ok(numbers.includes(current), `현재 쪽이 빠졌다 — ${where}`)
        for (let i = 1; i < numbers.length; i++) {
          assert.ok(numbers[i] > numbers[i - 1], `번호가 거꾸로다 — ${where}`)
        }
        items.forEach((item, i) => {
          if (item !== 'gap') return
          const before = items[i - 1]
          const after = items[i + 1]
          assert.ok(typeof before === 'number' && typeof after === 'number', `"…"가 끝에 있거나 붙었다 — ${where}`)
          // "…"가 한 쪽만 숨기면 그 번호를 보여주는 편이 낫다.
          assert.ok(after - before >= 3, `"…"가 한 쪽만 숨긴다 — ${where}`)
        })
      }
    }
  }
})
