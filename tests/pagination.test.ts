/**
 * 쪽 번호 줄 — 재고 목록이 30개씩 쪽으로 나뉜다(2026-09-28, 무한 스크롤 대신).
 *
 * 규칙은 사용자가 정했다(2026-09-28): 번호 10개를 보이고 오른쪽 끝에 마지막 쪽 번호를 붙인다
 * (1~10 … 15). 6쪽부터는 누른 쪽이 가운데(여섯째 칸)에 오도록 번호가 따라 움직이고, 마지막 5쪽은
 * 처음 5쪽처럼 번호가 멈춘다(마지막 10쪽). 휴대폰은 10개가 한 줄에 안 들어가 5개로 같은 규칙을 쓴다.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { isPastTheEnd, pageCount, pageItems, parsePage, withPage } from '../lib/pagination.ts'

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

// 재고·입출고 목록이 같이 쓰는 주소 규칙(2026-09-28 입출고도 쪽 넘김이 되면서 공용으로 옮겼다).

test('주소의 쪽 번호 — 없거나 이상하면 1쪽, 터무니없이 크면 상한', () => {
  assert.equal(parsePage(undefined), 1)
  for (const raw of ['', '0', '-2', 'abc', '2.5', '1e3']) assert.equal(parsePage(raw), 1, `page=${raw}`)
  // ?page=2&page=3 처럼 두 번 오면 배열이 된다.
  assert.equal(parsePage(['2', '3']), 1)
  assert.equal(parsePage('3'), 3)
  // 그대로 두면 offset 이 3e+21 같은 표기가 되어 DB 가 범위를 못 읽는다.
  assert.equal(parsePage('99999999999999999999'), 10_000)
})

test('쪽 링크 — 1쪽은 주소에 안 남기고, 다른 조건 뒤에 page 를 붙인다', () => {
  assert.equal(withPage('/movements', 1), '/movements')
  assert.equal(withPage('/movements', 3), '/movements?page=3')
  assert.equal(withPage('/movements?q=%EA%B3%A4%EC%95%BD', 2), '/movements?q=%EA%B3%A4%EC%95%BD&page=2')
})

test('쪽 수보다 먼 쪽을 달라고 했는지 — PostgREST 는 빈 목록 대신 416(PGRST103)을 준다', () => {
  assert.equal(isPastTheEnd(416, null), true)
  assert.equal(isPastTheEnd(400, { code: 'PGRST103' }), true)
  assert.equal(isPastTheEnd(200, null), false)
  // 권한 오류 같은 다른 실패는 끝을 넘은 것이 아니다 — 그대로 오류로 보여야 한다.
  assert.equal(isPastTheEnd(401, { code: '42501' }), false)
})
