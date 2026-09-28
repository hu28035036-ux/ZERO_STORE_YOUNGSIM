/**
 * 쪽 번호 줄 — 재고 목록이 30개씩 쪽으로 나뉜다(2026-09-28, 무한 스크롤 대신).
 *
 * 규칙은 사용자가 정했다(2026-09-28): 번호 10개를 보이고 오른쪽 끝에 마지막 쪽 번호를 붙인다
 * (1~10 … 15). 6쪽부터는 누른 쪽이 가운데(여섯째 칸)에 오도록 번호가 따라 움직이고, 마지막 5쪽은
 * 처음 5쪽처럼 번호가 멈춘다(마지막 10쪽). 휴대폰은 10개가 한 줄에 안 들어가 5개로 같은 규칙을 쓴다.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { pageCount, pageItems } from '../lib/pagination.ts'

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i)

test('쪽 수는 올림이고, 비어 있어도 1쪽이다', () => {
  assert.equal(pageCount(425, 30), 15) // 2026-09-28 재고 목록
  assert.equal(pageCount(30, 30), 1)
  assert.equal(pageCount(31, 30), 2)
  assert.equal(pageCount(0, 30), 1)
})

test('처음에는 1~10 과 오른쪽 끝의 마지막 쪽', () => {
  assert.deepEqual(pageItems(1, 15, 10), [...range(1, 10), 'gap', 15])
  assert.deepEqual(pageItems(5, 15, 10), [...range(1, 10), 'gap', 15])
})

test('6쪽부터는 누른 쪽이 가운데(여섯째 칸)에 온다', () => {
  assert.deepEqual(pageItems(6, 15, 10), [...range(1, 10), 'gap', 15])
  assert.deepEqual(pageItems(7, 15, 10), [...range(2, 11), 'gap', 15])
  assert.deepEqual(pageItems(9, 15, 10), [...range(4, 13), 'gap', 15])
  // 마지막 쪽 바로 앞까지 오면 숨는 쪽이 없어서 "…" 없이 붙는다.
  assert.deepEqual(pageItems(10, 15, 10), [...range(5, 14), 15])
})

test('마지막 5쪽은 번호가 멈춘다 — 마지막 10쪽', () => {
  for (const p of [11, 12, 13, 14, 15]) {
    assert.deepEqual(pageItems(p, 15, 10), range(6, 15), `p=${p}`)
  }
})

test('쪽이 10개 이하면 전부 보인다', () => {
  assert.deepEqual(pageItems(1, 1, 10), [1])
  assert.deepEqual(pageItems(4, 7, 10), range(1, 7))
  assert.deepEqual(pageItems(10, 10, 10), range(1, 10))
  // 11쪽이면 10개 뒤에 마지막 쪽이 "…" 없이 붙는다.
  assert.deepEqual(pageItems(1, 11, 10), range(1, 11))
})

test('휴대폰(5개)도 같은 규칙 — 3쪽부터 가운데, 마지막 3쪽은 멈춘다', () => {
  assert.deepEqual(pageItems(1, 15, 5), [1, 2, 3, 4, 5, 'gap', 15])
  assert.deepEqual(pageItems(3, 15, 5), [1, 2, 3, 4, 5, 'gap', 15])
  assert.deepEqual(pageItems(4, 15, 5), [2, 3, 4, 5, 6, 'gap', 15])
  assert.deepEqual(pageItems(12, 15, 5), range(10, 15))
  for (const p of [13, 14, 15]) assert.deepEqual(pageItems(p, 15, 5), range(11, 15), `p=${p}`)
})

test('범위 밖의 현재 쪽은 가까운 끝으로 붙인다', () => {
  assert.deepEqual(pageItems(99, 15, 10), pageItems(15, 15, 10))
  assert.deepEqual(pageItems(0, 15, 10), pageItems(1, 15, 10))
})

test('어떤 쪽 수·현재 쪽에서도 규칙이 지켜진다', () => {
  for (const size of [5, 10]) {
    // 누른 쪽 앞에 오는 번호 수. 10개면 5 — 여섯째 칸이 가운데다.
    const before = Math.floor(size / 2)
    for (let total = 1; total <= 40; total++) {
      for (let current = 1; current <= total; current++) {
        const items = pageItems(current, total, size)
        const where = `size=${size} total=${total} current=${current}: ${items.join(' ')}`
        const numbers = items.filter((i): i is number => i !== 'gap')

        assert.ok(numbers.includes(current), `현재 쪽이 빠졌다 — ${where}`)
        assert.ok(numbers.includes(total), `마지막 쪽이 빠졌다 — ${where}`)
        for (let i = 1; i < numbers.length; i++) {
          assert.ok(numbers[i] > numbers[i - 1], `번호가 거꾸로다 — ${where}`)
        }

        // "…"는 많아야 하나, 자리는 마지막 쪽 바로 앞.
        const gaps = items.filter((i) => i === 'gap').length
        assert.ok(gaps <= 1, `"…"가 둘이다 — ${where}`)
        if (gaps) assert.equal(items.indexOf('gap'), items.length - 2, `"…" 자리가 틀렸다 — ${where}`)

        // "…" 앞의 번호는 끊김 없이 이어지고, 쪽이 넉넉하면 size 개(마지막 쪽이 붙으면 +1).
        const run = gaps ? numbers.slice(0, -1) : numbers
        for (let i = 1; i < run.length; i++) assert.equal(run[i], run[i - 1] + 1, `번호가 건너뛴다 — ${where}`)
        if (total > size) assert.ok(run.length === size || run.length === size + 1, `번호 수가 틀렸다 — ${where}`)
        else assert.equal(run.length, total, where)

        if (total > size) {
          const firstFixed = current <= before + 1
          const lastFixed = current >= total - (size - 1 - before)
          if (firstFixed) assert.equal(run[0], 1, `처음 쪽들은 1부터 — ${where}`)
          if (lastFixed) assert.equal(run[0], total - size + 1, `마지막 쪽들은 번호가 멈춘다 — ${where}`)
          if (!firstFixed && !lastFixed) {
            assert.equal(items.indexOf(current), before, `누른 쪽이 가운데가 아니다 — ${where}`)
          }
        }
      }
    }
  }
})
