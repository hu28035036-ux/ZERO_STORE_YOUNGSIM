'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/field'
import { cn } from '@/lib/cn'
import { formatQty, formatWon, todayInSeoul } from '@/lib/constants'
import type { Device } from '@/lib/device'

import type { FoundItem } from '../actions'
import { saveMapping, type ColumnMap } from './columns'
import { cellToText, normalizeDate, toMoney, toQuantity, type Cell } from './parse'
import {
  importSales,
  resolveSaleRows,
  type ImportResult,
  type ResolvedRow,
} from './actions'

/**
 * 미리보기·확정 — 이 기능의 심장.
 *
 * 여기서 보여주는 것이 곧 반영될 것이어야 한다. 확인 필요(못 찾음·여러 개)가
 * 하나라도 남으면 확정을 잠근다. "건너뛰기"를 명시적으로 눌러야 통과된다 —
 * 조용히 빼먹으면 재고가 안 맞는데 사람은 다 넣은 줄 안다.
 */

type ParsedLine = {
  /** 파일에서의 줄 번호 (헤더 제외 1부터) — 사람이 파일에서 찾을 때 쓴다 */
  no: number
  barcode: string | null
  name: string | null
  option: string | null
  qty: number | null
  /** 파일이 말한 단가 (금액÷수량 계산 포함). null = 등록 판매가를 쓴다 */
  price: number | null
  date: string | null
  invalid: string | null
}

type LineState =
  | { kind: 'pending' }
  | { kind: 'ok'; item: FoundItem }
  | { kind: 'ambiguous'; candidates: FoundItem[] }
  | { kind: 'missing'; candidates: FoundItem[] }
  | { kind: 'invalid'; reason: string }
  | { kind: 'skipped'; prev: LineState }

type Line = ParsedLine & { state: LineState }

function buildLines(rows: Cell[][], map: ColumnMap, today: string): ParsedLine[] {
  return rows.map((row, i) => {
    const cell = (key: keyof ColumnMap): Cell =>
      map[key] != null ? (row[map[key]!] ?? null) : null

    const barcode = map.barcode != null ? cellToText(cell('barcode')) || null : null
    const name = map.name != null ? cellToText(cell('name')) || null : null
    const option = map.option != null ? cellToText(cell('option')) || null : null
    const qty = map.qty != null ? toQuantity(cell('qty')) : null

    let price: number | null = null
    if (map.price != null) price = toMoney(cell('price'))
    if (price == null && map.amount != null && qty != null) {
      const amount = toMoney(cell('amount'))
      if (amount != null) price = Math.round(amount / qty)
    }

    const date = map.date != null ? normalizeDate(cell('date')) : null

    let invalid: string | null = null
    if (!barcode && !name) invalid = '상품을 알 수 없는 줄입니다 (바코드·상품명 둘 다 비어 있음)'
    else if (qty == null) invalid = '수량을 읽지 못했습니다'
    else if (map.date != null && date == null) invalid = '날짜를 읽지 못했습니다'
    else if (date != null && date > today) invalid = '앞날짜 판매는 반영할 수 없습니다'

    return { no: i + 1, barcode, name, option, qty, price, date, invalid }
  })
}

export function ImportPreview({
  device,
  rows,
  map,
  signature,
  remembered,
  onChangeMapping,
  onRestart,
}: {
  device: Device
  rows: Cell[][]
  map: ColumnMap
  signature: string
  remembered: boolean
  onChangeMapping: () => void
  onRestart: () => void
}) {
  const [today] = useState(() => todayInSeoul())
  const [lines, setLines] = useState<Line[] | null>(null)
  const [matchError, setMatchError] = useState<string | null>(null)
  const [fallbackDate, setFallbackDate] = useState(today)
  const [memo, setMemo] = useState('')
  const [saving, setSaving] = useState(false)
  const [dup, setDup] = useState<{ date: string; importedAt: string }[] | null>(null)
  const [done, setDone] = useState<Extract<ImportResult, { status: 'done' }> | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 매칭은 진입할 때 한 번. 사용자가 확인한 지정이므로 이 시점에 기억해 둔다.
  useEffect(() => {
    saveMapping(signature, map)

    const parsed = buildLines(rows, map, today)
    const toMatch = parsed.filter((l) => !l.invalid)

    resolveSaleRows(
      toMatch.map((l) => ({ barcode: l.barcode, name: l.name, option: l.option })),
    )
      .then((resolved: ResolvedRow[]) => {
        let at = 0
        setLines(
          parsed.map((l): Line => {
            if (l.invalid) return { ...l, state: { kind: 'invalid', reason: l.invalid } }
            const r = resolved[at++]
            if (!r) return { ...l, state: { kind: 'invalid', reason: '매칭 결과가 없습니다' } }
            if (r.status === 'ok') return { ...l, state: { kind: 'ok', item: r.item } }
            if (r.status === 'ambiguous')
              return { ...l, state: { kind: 'ambiguous', candidates: r.candidates } }
            return { ...l, state: { kind: 'missing', candidates: r.candidates } }
          }),
        )
      })
      .catch(() => {
        setMatchError('상품을 찾는 중에 실패했습니다. 로그인이 풀렸거나 연결이 끊겼을 수 있습니다')
      })
    // rows/map 은 이 컴포넌트가 살아 있는 동안 바뀌지 않는다 — 바뀌는 길은
    // onChangeMapping 으로 부모가 이 컴포넌트를 내리는 것뿐이다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const summary = useMemo(() => {
    if (!lines) return null
    const ok = lines.filter((l) => l.state.kind === 'ok')
    const unresolved = lines.filter(
      (l) => l.state.kind === 'ambiguous' || l.state.kind === 'missing' || l.state.kind === 'invalid',
    )
    const skipped = lines.filter((l) => l.state.kind === 'skipped')

    const dates = new Set<string>()
    let revenue = 0
    for (const l of ok) {
      if (l.state.kind !== 'ok') continue
      dates.add(l.date ?? fallbackDate)
      revenue += (l.price ?? l.state.item.salePrice) * (l.qty ?? 0)
    }

    // 재고 변화: 변형 단위로 합쳐 "현재 → 반영 후"를 보여준다. 이 집계가
    // 서버가 합산해 넣는 값과 같은 값이다.
    const byVariant = new Map<string, { item: FoundItem; qty: number }>()
    for (const l of ok) {
      if (l.state.kind !== 'ok' || l.qty == null) continue
      const cur = byVariant.get(l.state.item.variantId)
      if (cur) cur.qty += l.qty
      else byVariant.set(l.state.item.variantId, { item: l.state.item, qty: l.qty })
    }

    const defaultPriced = ok.filter((l) => l.price == null)
    const zeroPriced = defaultPriced.filter(
      (l) => l.state.kind === 'ok' && l.state.item.salePrice === 0,
    )
    const hasPast = [...dates].some((d) => d < today)

    return {
      ok,
      unresolved,
      skipped,
      dates: [...dates].sort(),
      revenue,
      stock: [...byVariant.values()],
      defaultPriced,
      zeroPriced,
      hasPast,
    }
  }, [lines, fallbackDate, today])

  function setLineState(no: number, next: LineState) {
    setLines((prev) =>
      prev ? prev.map((l) => (l.no === no ? { ...l, state: next } : l)) : prev,
    )
  }

  async function confirm(opts: { force: boolean; excludeDates?: string[] }) {
    if (!summary) return
    setSaving(true)
    setError(null)
    setDup(null)
    try {
      const payload = summary.ok
        .filter((l) => {
          const d = l.date ?? fallbackDate
          return !opts.excludeDates?.includes(d)
        })
        .map((l) => {
          const item = (l.state as Extract<LineState, { kind: 'ok' }>).item
          return {
            variantId: item.variantId,
            qty: l.qty!,
            // 단가가 없던 줄은 여기서 등록 판매가로 채운다. RPC 에 맡기지 않는
            // 이유: 미리보기가 보여준 값과 반영 값이 글자까지 같아야 하고,
            // 지문에도 실제 단가가 들어가야 한다.
            unitPrice: l.price ?? item.salePrice,
            date: l.date ?? fallbackDate,
          }
        })

      if (payload.length === 0) {
        setError('반영할 판매가 남지 않았습니다')
        return
      }

      const result = await importSales({
        lines: payload,
        memo: memo.trim() || undefined,
        force: opts.force,
      })

      if (result.status === 'duplicate') setDup(result.existing)
      else if (result.status === 'error') setError(result.error)
      else setDone(result)
    } catch {
      setError('반영 요청이 실패했습니다. 연결을 확인하고 다시 시도하세요')
    } finally {
      setSaving(false)
    }
  }

  // ---------- 완료 ----------
  if (done) {
    const total = done.orders.reduce((s, o) => s + o.revenue, 0)
    return (
      <Card className="border-in/30 bg-in-soft">
        <CardBody className="flex flex-col gap-3 p-5">
          <p className="text-in text-sm font-medium">
            반영 완료 — 영수증 {done.orders.length}장 · {formatWon(total)}
          </p>
          <ul className="text-ink flex flex-col gap-1 text-sm">
            {done.orders.map((o) => (
              <li key={o.date} className="flex justify-between gap-3">
                <span data-numeric>{o.date}</span>
                <span data-numeric>
                  {formatQty(o.count)}줄 · {formatWon(o.revenue)}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-ink-muted text-sm">
            잘못 올렸다면{' '}
            <Link href="/sales/batches" className="text-primary underline">
              임포트 이력
            </Link>
            에서 이 배치를 통째로 되돌릴 수 있습니다.
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onRestart}>
              다른 파일 올리기
            </Button>
            <Button variant="ghost" size="sm" onClick={() => history.back()}>
              판매 기록으로
            </Button>
          </div>
        </CardBody>
      </Card>
    )
  }

  // ---------- 매칭 중 ----------
  if (!lines) {
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
            상품을 찾는 중… ({rows.length.toLocaleString()}줄)
          </p>
        )}
      </Card>
    )
  }

  const s = summary!
  const canConfirm = s.unresolved.length === 0 && s.ok.length > 0 && !saving

  return (
    <div className="flex flex-col gap-4">
      {remembered ? (
        <p className="text-ink-muted text-sm">
          지난번 열 지정을 그대로 썼습니다.{' '}
          <button type="button" onClick={onChangeMapping} className="text-primary underline">
            바꾸기
          </button>
        </p>
      ) : (
        <p className="text-ink-muted text-sm">
          <button type="button" onClick={onChangeMapping} className="text-primary underline">
            열 지정 바꾸기
          </button>
        </p>
      )}

      {/* 요약 한 줄 — 확정 전에 사람이 확인하는 숫자들 */}
      <Card className="p-4">
        <p className="text-ink text-sm leading-relaxed">
          총 <b data-numeric>{lines.length}</b>줄 · 정상{' '}
          <b data-numeric>{s.ok.length}</b> · 확인 필요{' '}
          <b data-numeric className={s.unresolved.length > 0 ? 'text-low' : undefined}>
            {s.unresolved.length}
          </b>
          {s.skipped.length > 0 ? (
            <>
              {' '}
              · 건너뜀 <b data-numeric>{s.skipped.length}</b>
            </>
          ) : null}
          {' '}· 영수증 <b data-numeric>{s.dates.length}</b>장
          {s.dates.length > 0 ? (
            <span className="text-ink-muted"> ({s.dates.join(', ')})</span>
          ) : null}
          {' '}· 합계 <b data-numeric>{formatWon(s.revenue)}</b>
        </p>
      </Card>

      {map.date == null ? (
        <Card className="p-4">
          <Input
            label="판매한 날"
            type="date"
            value={fallbackDate}
            max={today}
            onChange={(e) => setFallbackDate(e.target.value)}
            hint="파일에 날짜 열이 없어 전체를 이 날짜 영수증 하나로 반영합니다."
          />
        </Card>
      ) : null}

      {s.hasPast ? (
        <Card className="p-4">
          <p className="text-ink-muted text-sm leading-relaxed">
            지난 날짜 판매가 있습니다. <b className="text-ink">재고 수량과 매출은 정확하게</b>{' '}
            반영되지만, 원가·마진은 그 날이 아니라 <b className="text-ink">지금의 원가</b>로
            계산됩니다 — 원가는 입고 때마다 이동평균으로 바뀌는 값이라 과거 시점을
            되돌릴 수 없습니다.
          </p>
        </Card>
      ) : null}

      {s.defaultPriced.length > 0 ? (
        <Card className="p-4">
          <p className="text-ink-muted text-sm">
            <b className="text-ink" data-numeric>
              {s.defaultPriced.length}
            </b>
            줄은 단가가 없어 등록 판매가로 반영됩니다.
            {s.zeroPriced.length > 0 ? (
              <span className="text-low">
                {' '}
                그중 {s.zeroPriced.length}줄은 등록 판매가가 0원이라 매출 0 으로
                들어갑니다.
              </span>
            ) : null}
          </p>
        </Card>
      ) : null}

      {s.unresolved.length > 0 ? (
        <UnresolvedList
          lines={lines.filter(
            (l) =>
              l.state.kind === 'ambiguous' ||
              l.state.kind === 'missing' ||
              l.state.kind === 'invalid',
          )}
          onPick={(no, item) => setLineState(no, { kind: 'ok', item })}
          onSkip={(no) => {
            const line = lines.find((l) => l.no === no)
            if (line) setLineState(no, { kind: 'skipped', prev: line.state })
          }}
        />
      ) : null}

      {s.skipped.length > 0 ? (
        <Card className="p-4">
          <p className="text-ink-muted text-sm">
            건너뛴 줄 {s.skipped.length}개는 반영되지 않습니다.{' '}
            <button
              type="button"
              className="text-primary underline"
              onClick={() =>
                setLines((prev) =>
                  prev
                    ? prev.map((l) =>
                        l.state.kind === 'skipped' ? { ...l, state: l.state.prev } : l,
                      )
                    : prev,
                )
              }
            >
              모두 되살리기
            </button>
          </p>
        </Card>
      ) : null}

      {s.stock.length > 0 ? <StockDelta device={device} stock={s.stock} /> : null}

      <Card className="p-4">
        <Input
          label="메모"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          maxLength={200}
          placeholder="선택 입력 — 예: 7월 마지막 주 포스 정산"
        />
      </Card>

      {dup ? (
        <Card className="border-low/40 p-4">
          <p className="text-ink text-sm leading-relaxed">
            이미 반영한 내용이 있습니다:{' '}
            {dup.map((d) => (
              <span key={d.date} className="whitespace-nowrap" data-numeric>
                {d.date}
                <span className="text-ink-muted">
                  {' '}
                  ({new Date(d.importedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}{' '}
                  에 반영){' '}
                </span>
              </span>
            ))}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={saving}
              onClick={() => confirm({ force: false, excludeDates: dup.map((d) => d.date) })}
            >
              그 날짜만 빼고 반영
            </Button>
            <Button variant="danger" disabled={saving} onClick={() => confirm({ force: true })}>
              그래도 전부 반영
            </Button>
          </div>
        </Card>
      ) : null}

      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button variant="secondary" onClick={onRestart} disabled={saving}>
          다른 파일
        </Button>
        <Button full disabled={!canConfirm} onClick={() => confirm({ force: false })}>
          {saving
            ? '반영 중…'
            : `${formatQty(s.ok.length)}줄 반영하기`}
        </Button>
      </div>
      {s.unresolved.length > 0 ? (
        <p className="text-low text-sm">
          확인 필요한 줄을 모두 처리해야 반영할 수 있습니다. 못 찾는 상품은
          건너뛰거나 먼저 등록하세요.
        </p>
      ) : null}
    </div>
  )
}

/** 확인 필요 줄 — 원문과 후보를 보여주고 사람이 잇게 한다. */
function UnresolvedList({
  lines,
  onPick,
  onSkip,
}: {
  lines: Line[]
  onPick: (no: number, item: FoundItem) => void
  onSkip: (no: number) => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>확인 필요 {lines.length}줄</CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        {lines.map((l) => (
          <div key={l.no} className="border-border-base flex flex-col gap-2 border-b pb-4 last:border-0 last:pb-0">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-ink min-w-0 text-sm font-medium">
                <span className="text-ink-subtle mr-2" data-numeric>
                  {l.no}줄
                </span>
                {l.name ?? l.barcode ?? '(비어 있음)'}
                {l.option ? <span className="text-ink-muted"> · {l.option}</span> : null}
                {l.qty != null ? (
                  <span className="text-ink-muted" data-numeric>
                    {' '}
                    · {formatQty(l.qty)}개
                  </span>
                ) : null}
              </p>
              <Button variant="ghost" size="sm" onClick={() => onSkip(l.no)}>
                이 줄 건너뛰기
              </Button>
            </div>

            {l.state.kind === 'invalid' ? (
              <p className="text-low text-sm">{l.state.reason}</p>
            ) : l.state.kind === 'ambiguous' || l.state.kind === 'missing' ? (
              <>
                <p className="text-ink-muted text-sm">
                  {l.state.kind === 'ambiguous'
                    ? '같은 이름의 상품이 여러 개입니다. 맞는 것을 고르세요.'
                    : l.state.candidates.length > 0
                      ? '똑같은 상품을 못 찾았습니다. 비슷한 것 중에 있으면 고르세요.'
                      : '등록된 상품에서 찾지 못했습니다.'}
                </p>
                {l.state.candidates.length > 0 ? (
                  <ul className="flex flex-col gap-1">
                    {l.state.candidates.map((c) => (
                      <li key={c.variantId}>
                        <button
                          type="button"
                          onClick={() => onPick(l.no, c)}
                          className="border-border-strong hover:bg-surface-sunken flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left"
                        >
                          <span className="min-w-0">
                            <span className="text-ink block truncate text-sm">
                              {c.productName}
                              {c.optionLabel ? (
                                <span className="text-ink-muted"> · {c.optionLabel}</span>
                              ) : null}
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="text-ink text-sm" data-numeric>
                              {formatWon(c.salePrice)}
                            </span>
                            <Badge tone={c.stockQty <= 0 ? 'low' : 'neutral'}>
                              {formatQty(c.stockQty)}개
                            </Badge>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {l.state.kind === 'missing' ? (
                  <p className="text-ink-muted text-sm">
                    새 상품이면{' '}
                    <Link href="/stock/new" className="text-primary underline" target="_blank">
                      상품 등록
                    </Link>
                    을 먼저 하고, 등록한 뒤 파일을 다시 올리세요.
                  </p>
                ) : null}
              </>
            ) : null}
          </div>
        ))}
      </CardBody>
    </Card>
  )
}

/** 반영하면 재고가 어떻게 되는지 — 등록 전에 알아차릴 수 있는 유일한 지점. */
function StockDelta({
  device,
  stock,
}: {
  device: Device
  stock: { item: FoundItem; qty: number }[]
}) {
  const sorted = [...stock].sort((a, b) =>
    a.item.productName.localeCompare(b.item.productName, 'ko'),
  )

  if (device === 'mobile') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>재고 변화 {sorted.length}종</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-2">
          {sorted.map(({ item, qty }) => {
            const after = item.stockQty - qty
            return (
              <div key={item.variantId} className="flex items-baseline justify-between gap-3">
                <p className="text-ink min-w-0 truncate text-sm">
                  {item.productName}
                  {item.optionLabel ? (
                    <span className="text-ink-muted"> · {item.optionLabel}</span>
                  ) : null}
                </p>
                <p className="shrink-0 text-sm" data-numeric>
                  <span className="text-ink-muted">{formatQty(item.stockQty)}</span>
                  <span className="text-ink-subtle"> → </span>
                  <span className={cn('font-semibold', after < 0 ? 'text-danger' : 'text-ink')}>
                    {formatQty(after)}개
                  </span>
                </p>
              </div>
            )
          })}
        </CardBody>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>재고 변화 {sorted.length}종</CardTitle>
      </CardHeader>
      <CardBody className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-ink-muted border-border-base border-b text-left text-xs">
              <th className="py-1.5 pr-4 font-medium">상품</th>
              <th className="py-1.5 pr-4 text-right font-medium">파는 수량</th>
              <th className="py-1.5 pr-4 text-right font-medium">현재</th>
              <th className="py-1.5 text-right font-medium">반영 후</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ item, qty }) => {
              const after = item.stockQty - qty
              return (
                <tr key={item.variantId} className="border-border-base border-b last:border-0">
                  <td className="text-ink max-w-64 truncate py-1.5 pr-4">
                    {item.productName}
                    {item.optionLabel ? (
                      <span className="text-ink-muted"> · {item.optionLabel}</span>
                    ) : null}
                  </td>
                  <td className="text-ink py-1.5 pr-4 text-right" data-numeric>
                    {formatQty(qty)}
                  </td>
                  <td className="text-ink-muted py-1.5 pr-4 text-right" data-numeric>
                    {formatQty(item.stockQty)}
                  </td>
                  <td
                    className={cn(
                      'py-1.5 text-right font-semibold',
                      after < 0 ? 'text-danger' : 'text-ink',
                    )}
                    data-numeric
                  >
                    {formatQty(after)}
                    {after < 0 ? ' (음수)' : ''}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {sorted.some(({ item, qty }) => item.stockQty - qty < 0) ? (
          <p className="text-low mt-2 text-sm">
            재고가 음수가 되는 상품이 있습니다. 막지는 않지만 실사로 정리해야
            할 신호입니다.
          </p>
        ) : null}
      </CardBody>
    </Card>
  )
}
