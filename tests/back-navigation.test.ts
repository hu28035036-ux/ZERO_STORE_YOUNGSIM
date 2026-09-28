/**
 * 상단 바 "뒤로가기"가 어디로 가는지 (2026-09-28 사용자 요청 — 직전 화면으로).
 *
 * 설치한 앱(홈 화면에 추가)으로 켜면 브라우저의 뒤로 버튼이 없어서 이 버튼이 유일한 길이다.
 * 조용히 틀리기 쉬운 것: 이 탭에서 처음 연 화면(새 탭, 앱을 막 켠 때)에서 history.back() 을
 * 부르면 아무 일도 안 일어나 버튼이 고장 난 것처럼 보인다. 그때는 홈으로 보낸다.
 * history.length 는 "앞으로" 칸까지 세서, 한 번 뒤로 간 뒤에는 돌아갈 곳이 없어도 2 이상이다 —
 * 그래서 브라우저가 알려주면(Navigation API 의 canGoBack) 그것을 먼저 믿는다.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { backAction } from '../lib/back-navigation.ts'

test('돌아갈 화면이 있으면 직전 화면으로', () => {
  assert.equal(backAction({ canGoBack: true, historyLength: 5 }), 'back')
  assert.equal(backAction({ historyLength: 3 }), 'back')
})

test('이 탭에서 처음 연 화면이면 홈으로', () => {
  assert.equal(backAction({ canGoBack: false, historyLength: 1 }), 'home')
  assert.equal(backAction({ historyLength: 1 }), 'home')
})

test('브라우저가 "돌아갈 곳 없음"이라 하면 history 길이가 길어도 홈으로', () => {
  // [홈, 재고] 에서 한 번 뒤로 가 홈에 있으면 history.length 는 2 지만 뒤는 없다.
  assert.equal(backAction({ canGoBack: false, historyLength: 2 }), 'home')
})
