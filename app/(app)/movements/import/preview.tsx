'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, NumberInput } from '@/components/ui/field'
import { cn } from '@/lib/cn'
import { formatQty, formatWon, todayInSeoul } from '@/lib/constants'

import { cellToText, toMoney, toQuantity, type Cell } from '../../sales/import/parse'
import { cleanProductName } from '../../stock/import/clean-name'
import { COLUMN_LABEL, saveMapping, type PurchaseColumnMap } from './columns'
import {
  importPurchases,
  resolvePurchaseRows,
  type PurchaseImportResult,
  type PurchaseMatch,
} from './actions'

/**
 * 미리보기·확정 — 여기서 보여주는 것이 곧 원장에 들어갈 것이어야 한다.
 *
 * 이 화면의 요점은 **박스 해석을 눈으로 확인시키는 것**이다. 본사 발주
 * 시트의 수량은 박스 수라서, 박스당 개수가 등록된 상품은 자동으로 낱개
 * 환산("2박스 = 24개")하고 매입가도 박스값으로 보고 나눈다. 이 해석이
 * 틀린 파일이면 위의 토글로 "적힌 수 그대로"로 바꾼다 — 환산이 틀려도
 * 숫자는 그럴듯해 보여서, 사람이 대조할 지점이 이 표 하나뿐이다.
 */

type ParsedRow = {
  /** 파일에서의 줄 번호 (헤더 제외 1부터) */
  no: number
  code: string | null
  rawName: string
  /** 정제한 이름 — DB 의 상품명은 규격을 뗀 것이라 이걸로 짝짓는다 */
  cleanName: string
  fileQty: number | null
  fileCost: number | null
}

type Row = ParsedRow & {
  match: PurchaseMatch | null
  /** 빈 줄·반복 머리글 — 표가 아닌 줄. 집계에서 따로 센다 */
  junk: boolean
  skipped: boolean
  /** 편집 가능한 수량 (파일 값으로 시작). 문자열이어야 지웠다 다시 칠 수 있다 */
  qtyText: string
}

/** 박스값 ÷ 개수는 원 아래 소수가 남는다. 저장 컬럼(numeric 12,2)에 맞춘다. */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function buildRows(cells: Cell[][], map: PurchaseColumnMap): ParsedRow[] {
  return cells.map((row, i) => {
    const cell = (key: keyof PurchaseColumnMap): Cell =>
      map[key] != null ? (row[map[key]!] ?? null) : null

    const rawName = cellToText(cell('name'))
    const code = cellToText(cell('code')) || null

    return {
      no: i + 1,
      code,
      rawName,
      cleanName: rawName ? cleanProductName(rawName).name : '',
      fileQty: map.qty != null ? toQuantity(cell('qty')) : null,
      fileCost: map.cost != null ? toMoney(cell('cost')) : null,
    }
  })
}

export function PurchaseImportPreview({
  fileName,
  headers,
  rows: cells,
  map,
  signature,
  remembered,
  onChangeMapping,
  onRestart,
}: {
  fileName: string
  headers: string[]
  rows: Cell[][]
  map: PurchaseColumnMap
  signature: string
  remembered: boolean
  onChangeMapping: () => void
  onRestart: () => void
}) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [matchError, setMatchError] = useState<string | null>(null)
  /** 'auto' = 박스당 개수 있으면 박스 수로 해석. 'each' = 적힌 수 그대로 낱개 */
  const [interpret, setInterpret] = useState<'auto' | 'each'>('auto')
  const [occurredOn, setOccurredOn] = useState(() => todayInSeoul())
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState<Extract<PurchaseImportResult, { status: 'done' }> | null>(null)
  const [error, setError] = useState<string | null>(null)

  const today = todayInSeoul()

  // 매칭은 진입할 때 한 번. 사용자가 확인한 지정이므로 이 시점에 기억한다.
  useEffect(() => {
    saveMapping(signature, map)

    const parsed = buildRows(cells, map)
    // 식별자가 아무것도 없는 줄(빈 줄·구분선)과 반복 머리글 줄은 표가 아니다.
    const isJunk = (r: ParsedRow) =>
      (!r.rawName && !r.code) || r.rawName === '제품명' || r.rawName === '상품명'
    const live = parsed.filter((r) => !isJunk(r))

    resolvePurchaseRows(live.map((r) => ({ code: r.code, name: r.cleanName || null })))
      .then((matches) => {
        let at = 0
        setRows(
          parsed.map((r): Row => {
            if (isJunk(r)) {
              return { ...r, match: null, junk: true, skipped: true, qtyText: '' }
            }
            const match = matches[at++] ?? null
            return {
              ...r,
              match,
              junk: false,
              skipped: false,
              qtyText: r.fileQty != null ? String(r.fileQty) : '',
            }
          }),
        )
      })
      .catch(() => {
        setMatchError('상품 매칭에 실패했습니다. 로그인이 풀렸거나 연결이 끊겼을 수 있습니다')
      })
    // cells/map 은 이 컴포넌트가 살아 있는 동안 바뀌지 않는다 — 바뀌는 길은
    // onChangeMapping 으로 부모가 이 컴포넌트를 내리는 것뿐이다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function patchRow(no: number, patch: Partial<Row>) {
    setRows((prev) => (prev ? prev.map((r) => (r.no === no ? { ...r, ...patch } : r)) : prev))
  }

  /** 한 줄의 최종 해석: 낱개 수량·낱개 원가·박스 표기 */
  function resolveLine(r: Row) {
    const qty = Number(r.qtyText.replace(/[^\d]/g, '')) || 0
    const upp = r.match?.unitsPerPack ?? 0
    const boxed = interpret === 'auto' && upp >= 2
    return {
      qty: boxed ? qty * upp : qty,
      boxes: boxed ? qty : null,
      perPack: boxed ? upp : null,
      unitCost:
        r.fileCost == null ? null : boxed ? round2(r.fileCost / upp) : r.fileCost,
    }
  }

  const summary = useMemo(() => {
    if (!rows) return null
    const junk = rows.filter((r) => r.junk)
    const unmatched = rows.filter((r) => !r.junk && !r.match)
    const listed = rows.filter((r) => r.match)
    const included = listed.filter((r) => !r.skipped)
    const badQty = included.filter((r) => (Number(r.qtyText.replace(/[^\d]/g, '')) || 0) < 1)

    let totalQty = 0
    let totalCost = 0
    let noCost = 0
    for (const r of included) {
      const line = resolveLine(r)
      totalQty += line.qty
      if (line.unitCost != null) totalCost += line.qty * line.unitCost
      else noCost += 1
    }

    return { junk, unmatched, listed, included, badQty, totalQty, totalCost, noCost }
    // resolveLine 은 rows·interpret 에서만 값을 읽는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, interpret])

  async function confirm() {
    if (!summary) return
    setSaving(true)
    setError(null)
    try {
      const lines = summary.included.map((r) => {
        const line = resolveLine(r)
        return {
          variantId: r.match!.variantId,
          qty: line.qty,
          unitCost: line.unitCost,
          boxes: line.boxes,
          perPack: line.perPack,
        }
      })

      const result = await importPurchases({
        lines,
        note: fileName.slice(0, 120) || null,
        occurredOn: occurredOn || null,
      })
      if (result.status === 'error') setError(result.error)
      else setDone(result)
    } catch {
      setError('반영 요청이 실패했습니다. 연결을 확인하고 다시 시도하세요')
    } finally {
      setSaving(false)
    }
  }

  // ---------- 완료 ----------
  if (done) {
    return (
      <Card className="border-in/30 bg-in-soft">
        <CardBody className="flex flex-col gap-3 p-5">
          <p className="text-in text-sm font-medium">
            입고 완료 — {formatQty(done.count)}줄 · {formatQty(done.totalQty)}점
          </p>
          <p className="text-ink-muted text-sm leading-relaxed">
            <Link href="/movements" className="text-primary underline">
              입출고 내역
            </Link>
            에서 확인하세요. 잘못 올렸다면 이 화면 아래 “파일 입고 이력”에서
            통째로 되돌릴 수 있습니다.
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onRestart}>
              다른 파일 올리기
            </Button>
          </div>
        </CardBody>
      </Card>
    )
  }

  // ---------- 매칭 중 ----------
  if (!rows) {
    return (
      <Card className="p-5">
        {matchError ? (
          <div className="flex flex-col gap-3">
            <p className="text-danger text-sm">{matchError}</p>
            <Button variant="secondary" onClick={onRestart}>
              처음부터
            </Button>
          </div>
        ) : (
          <p className="text-ink-muted text-sm">
            등록된 상품과 짝짓는 중… ({cells.length.toLocaleString()}줄)
          </p>
        )}
      </Card>
    )
  }

  const s = summary!
  const canConfirm = s.included.length > 0 && s.badQty.length === 0 && !saving

  const picked = (Object.entries(map) as [keyof PurchaseColumnMap, number][]).sort(
    (a, b) => a[1] - b[1],
  )

  return (
    <div className="flex flex-col gap-4">
      {/* 열을 잘못 잡아도 숫자는 멀쩡해 보인다 — 사람이 대조할 지점이 여기다 */}
      <Card className="p-4">
        <p className="text-ink text-sm leading-relaxed">
          파일을 이렇게 읽었습니다:{' '}
          {picked.map(([key, i], idx) => (
            <span key={key} className="whitespace-nowrap">
              {idx > 0 ? ' · ' : ''}
              <b>{COLUMN_LABEL[key]}</b>
              <span className="text-ink-muted">←{headers[i] || `${i + 1}번째 열`}</span>
            </span>
          ))}
        </p>
        <p className="text-ink-muted mt-1 text-sm">
          {remembered ? '지난번 열 지정을 그대로 썼습니다. ' : ''}
          <button type="button" onClick={onChangeMapping} className="text-primary underline">
            열 지정 바꾸기
          </button>
        </p>
      </Card>

      {/* 요약 한 줄 — 확정 전에 사람이 확인하는 숫자들 */}
      <Card className="p-4">
        <p className="text-ink text-sm leading-relaxed">
          총 <b data-numeric>{rows.length}</b>줄 · 반영{' '}
          <b data-numeric>{s.included.length}</b>줄{' '}
          {s.unmatched.length > 0 ? (
            <>
              · 미등록 <b data-numeric className="text-low">{s.unmatched.length}</b>
            </>
          ) : null}
          {s.junk.length > 0 ? (
            <>
              {' '}
              · 빈 줄 <b data-numeric>{s.junk.length}</b>
            </>
          ) : null}
          {' '}· 낱개 <b data-numeric>{formatQty(s.totalQty)}</b>점 · 매입 합계{' '}
          <b data-numeric>{formatWon(Math.round(s.totalCost))}</b>
          {s.noCost > 0 ? (
            <span className="text-ink-muted"> (매입가 없는 {s.noCost}줄은 현재 원가로)</span>
          ) : null}
        </p>
      </Card>

      {/* 해석·날짜 — 파일 전체에 걸리는 두 가지 */}
      <Card>
        <CardHeader>
          <CardTitle>수량 해석</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <div role="radiogroup" aria-label="수량 해석" className="grid grid-cols-2 gap-2">
            {(
              [
                ['auto', '박스 수로 (자동 환산)'],
                ['each', '적힌 수 그대로 (낱개)'],
              ] as const
            ).map(([value, text]) => {
              const on = interpret === value
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setInterpret(value)}
                  className={cn(
                    'h-touch rounded-lg border px-2 text-sm font-medium transition-colors',
                    on
                      ? 'bg-primary text-primary-ink border-primary'
                      : 'bg-surface text-ink-muted border-border-strong hover:bg-surface-sunken',
                  )}
                >
                  {text}
                </button>
              )
            })}
          </div>
          <p className="text-ink-muted text-sm leading-relaxed">
            발주서의 수량은 대개 박스 수입니다. “박스 수로”는 박스당 개수가
            등록된 상품만 환산하고, 매입가도 박스당 가격으로 보고 나눕니다.
            표의 “들어올 수량”이 실물과 다르면 이 토글을 바꿔 보세요.
          </p>
          <Input
            label="발생일"
            type="date"
            value={occurredOn}
            max={today}
            onChange={(e) => setOccurredOn(e.target.value)}
            hint="물건이 실제로 들어온 날입니다. 어제 온 것을 오늘 반영한다면 바꾸세요."
          />
        </CardBody>
      </Card>

      {/* 미등록 — 이 화면에서는 어쩔 수 없는 줄. 숨기면 조용히 빠진다 */}
      {s.unmatched.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>등록된 상품을 못 찾은 {s.unmatched.length}줄</CardTitle>
          </CardHeader>
          <CardBody className="flex flex-col gap-2">
            <p className="text-ink-muted text-sm leading-relaxed">
              이 줄들은 반영되지 않습니다. 새 상품이면{' '}
              <Link href="/stock/import" className="text-primary underline">
                재고 › 파일로 등록
              </Link>
              에서 먼저 등록한 뒤 이 파일을 다시 올리세요.
            </p>
            <ul className="flex flex-col gap-1">
              {s.unmatched.slice(0, 30).map((r) => (
                <li key={r.no} className="text-ink truncate text-sm">
                  <span className="text-ink-subtle mr-2" data-numeric>
                    {r.no}줄
                  </span>
                  {r.rawName || r.code}
                  {r.fileQty != null ? (
                    <span className="text-ink-muted" data-numeric>
                      {' '}
                      · {formatQty(r.fileQty)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
            {s.unmatched.length > 30 ? (
              <p className="text-ink-subtle text-xs">
                외 {s.unmatched.length - 30}줄
              </p>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {/* 반영될 입고 표 — 수량은 여기서 바로 고칠 수 있다 */}
      <Card>
        <CardHeader>
          <CardTitle>들어올 입고 {s.included.length}줄</CardTitle>
        </CardHeader>
        <CardBody className="overflow-x-auto">
          <table className="w-full min-w-[46rem] text-sm">
            <thead>
              <tr className="text-ink-muted border-border-base border-b text-left text-xs">
                <th className="py-1.5 pr-3 font-medium">#</th>
                <th className="py-1.5 pr-3 font-medium">상품</th>
                <th className="py-1.5 pr-3 text-right font-medium">파일 수량</th>
                <th className="py-1.5 pr-3 text-right font-medium">들어올 수량</th>
                <th className="py-1.5 pr-3 text-right font-medium">낱개 매입가</th>
                <th className="py-1.5 pr-3 text-right font-medium">재고</th>
                <th className="py-1.5 font-medium" />
              </tr>
            </thead>
            <tbody>
              {s.listed.map((r) => {
                const line = resolveLine(r)
                const m = r.match!
                const after = m.stockQty + line.qty
                return (
                  <tr
                    key={r.no}
                    className={cn(
                      'border-border-base border-b last:border-0',
                      r.skipped && 'opacity-45',
                    )}
                  >
                    <td className="text-ink-subtle py-1.5 pr-3" data-numeric>
                      {r.no}
                    </td>
                    <td className="py-1.5 pr-3">
                      <span className="text-ink block max-w-64 truncate font-medium">
                        {m.productName}
                        {m.optionLabel ? (
                          <span className="text-ink-muted font-normal"> · {m.optionLabel}</span>
                        ) : null}
                      </span>
                      {r.rawName && r.rawName !== m.productName ? (
                        <span className="text-ink-subtle block max-w-64 truncate text-xs">
                          파일: {r.rawName}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-1.5 pr-3 text-right">
                      <NumberInput
                        aria-label={`${r.no}줄 수량`}
                        value={r.qtyText}
                        disabled={r.skipped}
                        onChange={(e) => patchRow(r.no, { qtyText: e.target.value })}
                        className="w-20 text-right"
                      />
                    </td>
                    <td className="text-ink py-1.5 pr-3 text-right whitespace-nowrap" data-numeric>
                      {line.boxes != null ? (
                        <>
                          {formatQty(line.boxes)}
                          {m.purchaseUnitName || '박스'} ={' '}
                          <b>
                            {formatQty(line.qty)}
                            {m.unit}
                          </b>
                        </>
                      ) : (
                        <b>
                          {formatQty(line.qty)}
                          {m.unit}
                        </b>
                      )}
                    </td>
                    <td className="text-ink py-1.5 pr-3 text-right whitespace-nowrap" data-numeric>
                      {line.unitCost != null ? (
                        formatWon(line.unitCost)
                      ) : (
                        <span className="text-ink-muted">지금 원가</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-3 text-right whitespace-nowrap" data-numeric>
                      <span className="text-ink-muted">{formatQty(m.stockQty)}</span>
                      <span className="text-ink-subtle"> → </span>
                      <span className="text-ink font-medium">{formatQty(after)}</span>
                    </td>
                    <td className="py-1.5 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => patchRow(r.no, { skipped: !r.skipped })}
                      >
                        {r.skipped ? '되살리기' : '빼기'}
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CardBody>
      </Card>

      {s.badQty.length > 0 ? (
        <p className="text-low text-sm">
          수량이 비었거나 0 인 줄이 {s.badQty.length}개 있습니다. 채우거나 빼야
          반영할 수 있습니다.
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button variant="secondary" onClick={onRestart} disabled={saving} className="shrink-0">
          다른 파일
        </Button>
        <Button full disabled={!canConfirm} onClick={() => void confirm()}>
          {saving
            ? '반영 중…'
            : `${formatQty(s.included.length)}줄 · ${formatQty(s.totalQty)}점 입고하기`}
        </Button>
      </div>
    </div>
  )
}
