/**
 * 매출 추이 막대 밑 날짜를 몇 칸마다 적을지.
 *
 * 휴대폰에서 막대 칸(22~40px)이 날짜 글자(일 30px · 주 36~40px · 월 44~51px)보다 좁으면
 * 전부 "9.…"로 잘리거나(칸 안에 가둘 때), 하나 걸러 적어도 달 이름끼리 겹쳤다
 * (2026-09-27 점검 — 12달 월간에서 "2025. 102025. 12."). 몇 칸마다 적을지는 막대 개수가
 * 아니라 칸 폭과 글자 폭으로 정해야 한다.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { labelIndices, labelStep } from '../app/(app)/stats/chart-labels.ts'

test('칸이 글자보다 넓으면 모든 칸에 적는다', () => {
  assert.equal(labelStep(30, 95), 1)
})

test('칸이 좁으면 글자가 들어갈 만큼 건너뛴다', () => {
  assert.equal(labelStep(30, 22), 2) // 12일 · 360px
  assert.equal(labelStep(54, 22), 3) // 12달 월간 · 360px — 하나 걸러면 겹쳤다
  assert.equal(labelStep(54, 39), 2) // 7달 월간 · 360px — 전엔 "202…"로 잘렸다
})

test('폭을 아직 못 쟀으면(첫 렌더) 모든 칸에 적는다', () => {
  assert.equal(labelStep(30, 0), 1)
})

test('한 칸마다면 전부 적는다', () => {
  assert.deepEqual([...labelIndices(5, 1)], [0, 1, 2, 3, 4])
})

test('건너뛸 때 처음과 끝은 적고, 끝과 붙는 바로 앞 라벨은 뺀다', () => {
  assert.deepEqual([...labelIndices(12, 2)].sort((a, b) => a - b), [0, 2, 4, 6, 8, 11])
  assert.deepEqual([...labelIndices(9, 2)].sort((a, b) => a - b), [0, 2, 4, 6, 8])
  assert.deepEqual([...labelIndices(12, 3)].sort((a, b) => a - b), [0, 3, 6, 11])
})

test('끝이 처음과 붙을 만큼 짧으면 처음만 적는다', () => {
  assert.deepEqual([...labelIndices(2, 3)], [0])
  assert.deepEqual([...labelIndices(1, 2)], [0])
})
