/**
 * cn() 이 이 앱이 만든 이름(globals.css @theme 의 --spacing-touch 등)을 알아보는지.
 *
 * 모르면 cn('h-touch', 'h-12') 에서 둘 다 남고 CSS 선언 순서가 이긴다 — 호출부가 준
 * 높이가 조용히 무시된다. 실제로 입출고 카메라 버튼(h-12)과 빠른 등록 수량 칸(h-10)이
 * 44px 로 남아 옆 버튼과 높이가 어긋났다(2026-09-27 휴대폰 점검).
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { cn } from '../lib/cn.ts'

test('호출부의 높이가 버튼 기본 높이(h-touch)를 이긴다', () => {
  assert.equal(cn('h-touch px-4', 'h-12'), 'px-4 h-12')
  assert.equal(cn('h-touch-lg', 'h-auto min-h-14'), 'h-auto min-h-14')
})

test('너비·최소 높이도 같은 이름을 알아본다', () => {
  assert.equal(cn('w-touch', 'w-12'), 'w-12')
  assert.equal(cn('min-h-touch', 'min-h-9'), 'min-h-9')
})

test('카드 모서리(rounded-card)도 덮어쓸 수 있다', () => {
  assert.equal(cn('rounded-card border', 'rounded-xl'), 'border rounded-xl')
})

test('원래 되던 것은 그대로 된다', () => {
  assert.equal(cn('bg-surface', 'bg-primary'), 'bg-primary')
  assert.equal(cn('text-ink', 'text-sm'), 'text-ink text-sm')
  assert.equal(cn('h-9', 'h-10'), 'h-10')
})
