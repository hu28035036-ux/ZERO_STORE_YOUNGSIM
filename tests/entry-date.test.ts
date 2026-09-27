/**
 * 입출고 등록 화면의 "등록 날짜" (?date=) 해석.
 *
 * 이 값은 URL 에 실려 다니므로 사람이 고칠 수 있다. 모양이 틀린 값·달력에 없는
 * 날·앞날짜가 그대로 화면에 실리면, 화면은 그 날짜로 등록한다고 말하는데 서버
 * 액션은 거부해서(앞날짜) 사람이 줄마다 오류만 보게 되거나, Postgres 가 날짜로
 * 못 읽어 등록이 통째로 실패한다(2월 30일). 해석 단계에서 오늘로 되돌린다.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  entryDateLabel,
  entryDateShort,
  parseEntryDate,
} from '../app/(app)/movements/entry-date.ts'

const TODAY = '2026-09-27'

test('지난 날짜는 그대로 쓴다', () => {
  assert.equal(parseEntryDate('2026-09-26', TODAY), '2026-09-26')
  assert.equal(parseEntryDate('2025-12-31', TODAY), '2025-12-31')
})

test('오늘은 오늘이다', () => {
  assert.equal(parseEntryDate(TODAY, TODAY), TODAY)
})

test('값이 없거나 문자열이 아니면 오늘이다', () => {
  assert.equal(parseEntryDate(undefined, TODAY), TODAY)
  assert.equal(parseEntryDate('', TODAY), TODAY)
  // ?date=a&date=b 처럼 두 번 오면 배열이 된다
  assert.equal(parseEntryDate(['2026-09-26', '2026-09-25'], TODAY), TODAY)
})

test('모양이 틀린 값은 오늘이다', () => {
  assert.equal(parseEntryDate('어제', TODAY), TODAY)
  assert.equal(parseEntryDate('9/26', TODAY), TODAY)
})

test('달력에 없는 날은 오늘이다', () => {
  assert.equal(parseEntryDate('2026-02-30', TODAY), TODAY)
  assert.equal(parseEntryDate('2026-13-01', TODAY), TODAY)
})

test('앞날짜는 오늘로 되돌린다', () => {
  assert.equal(parseEntryDate('2026-09-28', TODAY), TODAY)
  assert.equal(parseEntryDate('2027-01-01', TODAY), TODAY)
})

test('날짜 이름은 월·일·요일이다', () => {
  assert.equal(entryDateLabel('2026-09-26'), '9월 26일 (토)')
  assert.equal(entryDateLabel('2026-09-27'), '9월 27일 (일)')
  assert.equal(entryDateLabel('2026-01-05'), '1월 5일 (월)')
})

test('줄의 달력 버튼에 붙는 짧은 날짜는 월/일이다', () => {
  // 휴대폰 한 줄에 종류 토글·달력·수량이 같이 들어가야 해서 요일까지는 못 싣는다.
  assert.equal(entryDateShort('2026-09-26'), '9/26')
  assert.equal(entryDateShort('2026-01-05'), '1/5')
})
