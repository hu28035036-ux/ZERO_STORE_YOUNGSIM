import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { looksLikeHtmlTable, parseHtmlTable } from '../app/(app)/sales/import/parse.ts'
import { repairStreamedZip } from '../app/(app)/sales/import/zip-repair.ts'
import { guessMapping } from '../app/(app)/movements/import/columns.ts'

// ---------------------------------------------------------------------------
// HTML 표 (".xls" 위장) — 실제 건별 주문현황 파일의 구조를 줄여서 고정
// ---------------------------------------------------------------------------

const HTML = `﻿<table border='1'>
<tr><th colspan="3">주문정보</th><th colspan="2">거래처 주문</th></tr>
<tr><th>구분</th><th>주문번호</th><th>주문일</th><th>부가세</th><th>합계금액</th></tr>
<tr><td>배송</td><td><button data-reno="1">20260805-0006</button></td><td>2026.08.05</td><td>5,487</td><td>60,380</td></tr>
</table>`

test('HTML 표 판별 — BOM 이 붙어도 <table 을 알아본다', () => {
  assert.equal(looksLikeHtmlTable(HTML), true)
  assert.equal(looksLikeHtmlTable('상품코드,상품명\n1,물'), false)
})

test('colspan 은 빈 칸으로 펴져서 아래 줄과 열 번호가 맞는다', () => {
  const rows = parseHtmlTable(HTML)
  assert.equal(rows.length, 3)
  assert.deepEqual(rows[0], ['주문정보', '', '', '거래처 주문', ''])
  assert.deepEqual(rows[1], ['구분', '주문번호', '주문일', '부가세', '합계금액'])
})

test('셀 안의 태그(<button>)는 글자만 남는다', () => {
  const rows = parseHtmlTable(HTML)
  assert.equal(rows[2][1], '20260805-0006')
})

// ---------------------------------------------------------------------------
// 스트리밍 zip 재조립 — 로컬 헤더 크기 0 + 자료 서술자인 zip 을 손으로 만든다
// ---------------------------------------------------------------------------

function buildStreamedZip(): ArrayBuffer {
  const name = new TextEncoder().encode('a.txt')
  const data = new TextEncoder().encode('hi')
  const crc = 0x9d3d2e4a // 'hi' 의 CRC-32 — 값 자체는 재조립에서 복사만 된다

  const local = new Uint8Array(30 + name.length)
  const lv = new DataView(local.buffer)
  lv.setUint32(0, 0x04034b50, true)
  lv.setUint16(4, 45, true) // 실물처럼 ZIP64 표식(45)을 박아둔다
  lv.setUint16(6, 0x0008, true) // 자료 서술자 플래그 — 크기가 뒤에 온다는 뜻
  lv.setUint16(8, 0, true) // stored
  // 크기 셋(14·18·22)은 스트리밍 방식 그대로 0 으로 둔다
  lv.setUint16(26, name.length, true)
  local.set(name, 30)

  const descriptor = new Uint8Array(16)
  const dd = new DataView(descriptor.buffer)
  dd.setUint32(0, 0x08074b50, true)
  dd.setUint32(4, crc, true)
  dd.setUint32(8, data.length, true)
  dd.setUint32(12, data.length, true)

  const cd = new Uint8Array(46 + name.length)
  const cv = new DataView(cd.buffer)
  cv.setUint32(0, 0x02014b50, true)
  cv.setUint16(10, 0, true) // stored
  cv.setUint32(16, crc, true)
  cv.setUint32(20, data.length, true)
  cv.setUint32(24, data.length, true)
  cv.setUint16(28, name.length, true)
  cv.setUint32(42, 0, true) // 로컬 헤더 오프셋
  cd.set(name, 46)

  const cdOffset = local.length + data.length + descriptor.length
  const eocd = new Uint8Array(22)
  const ev = new DataView(eocd.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, 1, true)
  ev.setUint16(10, 1, true)
  ev.setUint32(12, cd.length, true)
  ev.setUint32(16, cdOffset, true)

  const out = new Uint8Array(cdOffset + cd.length + eocd.length)
  out.set(local, 0)
  out.set(data, local.length)
  out.set(descriptor, local.length + data.length)
  out.set(cd, cdOffset)
  out.set(eocd, cdOffset + cd.length)
  return out.buffer
}

test('스트리밍 zip 재조립 — 로컬 헤더에 크기가 박히고 서술자 플래그가 꺼진다', () => {
  const repaired = repairStreamedZip(buildStreamedZip())
  assert.ok(repaired, '복구가 null 을 돌려줬다')
  const dv = new DataView(repaired!)
  assert.equal(dv.getUint32(0, true), 0x04034b50)
  assert.equal(dv.getUint16(4, true), 20, 'ZIP64 표식이 걷혔다')
  assert.equal(dv.getUint16(6, true), 0, '자료 서술자 플래그가 꺼졌다')
  assert.equal(dv.getUint32(18, true), 2, '압축 크기가 로컬 헤더에 박혔다')
  assert.equal(dv.getUint32(22, true), 2, '원본 크기가 로컬 헤더에 박혔다')
  // 데이터가 그대로 옮겨졌는지 — 이름 뒤 두 바이트가 'hi'
  const nameLen = dv.getUint16(26, true)
  const body = new Uint8Array(repaired!, 30 + nameLen, 2)
  assert.equal(new TextDecoder().decode(body), 'hi')
})

test('정상 zip 이 아니면 null — 원래 오류가 살아남게 한다', () => {
  assert.equal(repairStreamedZip(new ArrayBuffer(4)), null)
  assert.equal(repairStreamedZip(new TextEncoder().encode('PK가 아님, 그냥 글자').buffer as ArrayBuffer), null)
})

// ---------------------------------------------------------------------------
// 주문내역서 열 추측 — 실물 헤더 14열 고정
// ---------------------------------------------------------------------------

const ORDER_HEADERS = [
  '상품코드', '상품명', '직/배송', '단가', '주문량', '판매단위', '주문금액',
  '부가세', '합계금액', '단가(g당)', '총중량(kg)', '100g당 열량', '입수량', '비고',
]

test('주문내역서: 코드·이름·주문량·합계금액이 붙고, VAT 제외 열은 안 붙는다', () => {
  const map = guessMapping(ORDER_HEADERS)
  assert.equal(map.code, 0)
  assert.equal(map.name, 1)
  assert.equal(map.qty, 4, "'주문량' 이 수량이다 — '입수량(EA(1))' 이 아니라")
  assert.equal(map.total, 8, "'합계금액'(VAT 포함)이 총액이다")
  // '단가' 는 VAT 제외라 원가로 잇지 않는다 (0018 의 매입(vat-) 사고와 같은 함정).
  // '주문금액'(단가×수량, VAT 제외)도 총액으로 잇지 않는다.
  assert.equal(map.cost, undefined)
})
