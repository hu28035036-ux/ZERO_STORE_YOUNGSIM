'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, NumberInput, Select } from '@/components/ui/field'
import { formatQty, formatWon } from '@/lib/constants'
import type { CategoryOption } from '../categories'

import { saveMapping, type ProductColumnMap } from './columns'
import { cellToText, toMoney, toQuantity, type Cell } from '../../sales/import/parse'
import { cleanProductName } from './clean-name'
import {
  importProducts,
  resolveProductRows,
  type ProductImportResult,
} from './actions'

/**
 * 미리보기·확정 — 여기서 보여주는 것이 곧 등록될 것이어야 한다.
 *
 * 판매 임포트와 반대로, 상품 임포트는 기존 상품이 **찾히면** 문제다(중복).
 * 코드 중복은 DB(PK)가 어차피 막으므로 강제로 제외하고, 이름 중복은 같은
 * 이름의 다른 상품일 수 있으므로 "그래도 등록"을 열어 둔다.
 *
 * 이름 정제 휴리스틱(clean-name.ts)이 틀릴 수 있으므로 모든 줄의 이름 칸을
 * 편집 가능하게 둔다 — 진짜 방어선은 사람 눈이다.
 */

type ParsedRow = {
  /** 파일에서의 줄 번호 (헤더 제외 1부터) */
  no: number
  rawName: string
  spec: string | null
  channel: string | null
  categoryName: string | null
  code: string | null
  /** 4자 미만이라 코드로 못 쓰는 값 — 알려는 준다 */
  shortCode: string | null
  pack: number | null
  cost: number
  price: number
}

type RowStatus =
  /** 등록 대상 */
  | { kind: 'ok' }
  /** 빈 줄·머리글 반복 줄. 자동 제외, 개수만 보여준다 */
  | { kind: 'junk' }
  /** 코드가 파일 안이나 DB 와 겹침 — PK 라 강행 불가, 제외 고정 */
  | { kind: 'dup-code'; where: 'file' | 'db' }
  /** 이름만 겹침 — 기본 제외지만 "그래도 등록" 가능 */
  | { kind: 'dup-name'; where: 'file' | 'db'; included: boolean }
  /** 사람이 직접 뺀 줄 */
  | { kind: 'skipped' }

type Row = ParsedRow & {
  status: RowStatus
  /** 편집 가능한 최종 이름 (정제 결과로 시작) */
  name: string
  /** 초기 재고 수량 (기본 = 입수) */
  qty: number
}

function buildRows(cells: Cell[][], map: ProductColumnMap): Omit<Row, 'status'>[] {
  return cells.map((row, i) => {
    const cell = (key: keyof ProductColumnMap): Cell =>
      map[key] != null ? (row[map[key]!] ?? null) : null

    const rawName = cellToText(cell('name'))
    const cleaned = cleanProductName(rawName)

    const codeRaw = cellToText(cell('code')) || null
    // 4자 하한은 barcodes 의 check 제약. 짧은 코드를 그대로 보내면 DB 원문
    // 오류가 사용자에게 튄다. 코드 없음으로 바꾸되 표시는 해 준다.
    const codeOk = codeRaw && codeRaw.length >= 4 ? codeRaw : null

    const pack = map.pack != null ? toQuantity(cell('pack')) : null

    return {
      no: i + 1,
      rawName,
      name: cleaned.name,
      spec: cleaned.spec,
      channel: map.channel != null ? cellToText(cell('channel')) || null : null,
      categoryName: map.category != null ? cellToText(cell('category')) || null : null,
      code: codeOk,
      shortCode: codeRaw && !codeOk ? codeRaw : null,
      pack,
      qty: pack ?? 0,
      cost: (map.cost != null ? toMoney(cell('cost')) : null) ?? 0,
      price: (map.price != null ? toMoney(cell('price')) : null) ?? 0,
    }
  })
}

/** 분류 이름별 처리. 'create' | 'none' | 기존 카테고리 id */
type CategoryChoice = string

export function ProductImportPreview({
  rows: cells,
  map,
  signature,
  remembered,
  categories,
  defaultLowStock,
  onChangeMapping,
  onRestart,
}: {
  rows: Cell[][]
  map: ProductColumnMap
  signature: string
  remembered: boolean
  categories: CategoryOption[]
  defaultLowStock: number
  onChangeMapping: () => void
  onRestart: () => void
}) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [matchError, setMatchError] = useState<string | null>(null)
  const [catChoice, setCatChoice] = useState<Record<string, CategoryChoice>>({})
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState<Extract<ProductImportResult, { status: 'done' }> | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 중복 확인은 진입할 때 한 번. 사용자가 확인한 지정이므로 이 시점에 기억한다.
  useEffect(() => {
    saveMapping(signature, map)

    const parsed = buildRows(cells, map)
    // 빈 줄, 그리고 시트 중간에 반복되는 머리글 줄("제품명"이 그대로 값인 줄)
    const isJunk = (r: Omit<Row, 'status'>) => !r.rawName || r.rawName === '제품명'
    const live = parsed.filter((r) => !isJunk(r))

    resolveProductRows(live.map((r) => ({ code: r.code, name: r.name })))
      .then((resolved) => {
        // 파일 안 중복: 앞줄이 이미 같은 코드·이름을 쓰면 뒷줄이 중복이다.
        const seenCodes = new Set<string>()
        const seenNames = new Set<string>()
        let at = 0
        setRows(
          parsed.map((r): Row => {
            if (isJunk(r)) return { ...r, status: { kind: 'junk' } }
            const dup = resolved[at++]
            let status: RowStatus = { kind: 'ok' }
            if (r.code && seenCodes.has(r.code)) {
              status = { kind: 'dup-code', where: 'file' }
            } else if (dup?.codeTaken) {
              status = { kind: 'dup-code', where: 'db' }
            } else if (seenNames.has(r.name)) {
              status = { kind: 'dup-name', where: 'file', included: false }
            } else if (dup?.nameTaken) {
              status = { kind: 'dup-name', where: 'db', included: false }
            }
            // 제외될 줄의 코드·이름은 "이미 본 것"에 넣지 않는다 — 코드 중복으로
            // 빠진 줄 때문에 그 다음 정상 줄까지 중복으로 몰리면 안 된다.
            if (status.kind === 'ok') {
              if (r.code) seenCodes.add(r.code)
              seenNames.add(r.name)
            }
            return { ...r, status }
          }),
        )
      })
      .catch(() => {
        setMatchError('중복 확인에 실패했습니다. 로그인이 풀렸거나 연결이 끊겼을 수 있습니다')
      })
    // cells/map 은 이 컴포넌트가 살아 있는 동안 바뀌지 않는다 — 바뀌는 길은
    // onChangeMapping 으로 부모가 이 컴포넌트를 내리는 것뿐이다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 지금 상태에서 실제로 등록될 줄 */
  function isIncluded(r: Row): boolean {
    return (
      r.status.kind === 'ok' ||
      (r.status.kind === 'dup-name' && r.status.included)
    )
  }

  const summary = useMemo(() => {
    if (!rows) return null
    const included = rows.filter(isIncluded)
    const junk = rows.filter((r) => r.status.kind === 'junk')
    const dupCode = rows.filter((r) => r.status.kind === 'dup-code')
    const dupName = rows.filter((r) => r.status.kind === 'dup-name' && !r.status.included)
    const skipped = rows.filter((r) => r.status.kind === 'skipped')
    const emptyName = included.filter((r) => !r.name.trim())

    let purchaseTotal = 0
    let qtyTotal = 0
    for (const r of included) {
      purchaseTotal += r.cost * r.qty
      qtyTotal += r.qty
    }

    // 파일에 나온 분류 이름들 (등록될 줄 기준)
    const catNames = [...new Set(included.map((r) => r.categoryName).filter((v): v is string => !!v))]

    return { included, junk, dupCode, dupName, skipped, emptyName, purchaseTotal, qtyTotal, catNames }
  }, [rows])

  // 분류 기본값: 같은 이름의 카테고리가 이미 있으면 그것, 없으면 새로 만들기.
  // 상태에 미리 심지 않고 읽을 때 기본값을 합친다 — effect 로 심으면
  // 렌더 사슬이 하나 늘 뿐 얻는 게 없다.
  const catDefault = useMemo(() => {
    const map: Record<string, CategoryChoice> = {}
    for (const name of summary?.catNames ?? []) {
      const existing = categories.find((c) => c.label === name)
      map[name] = existing ? existing.id : 'create'
    }
    return map
  }, [summary, categories])

  const choiceOf = (name: string): CategoryChoice =>
    catChoice[name] ?? catDefault[name] ?? 'create'

  function patchRow(no: number, patch: Partial<Row>) {
    setRows((prev) => (prev ? prev.map((r) => (r.no === no ? { ...r, ...patch } : r)) : prev))
  }

  async function confirm() {
    if (!summary) return
    setSaving(true)
    setError(null)
    try {
      const payload = summary.included.map((r) => ({
        name: r.name.trim(),
        spec: r.spec,
        channel: r.channel,
        categoryName: r.categoryName,
        code: r.code,
        unitsPerPack: r.pack,
        initialQty: r.qty,
        cost: r.cost,
        price: r.price,
        lowStockThreshold: defaultLowStock,
      }))

      const categoryPlan = summary.catNames.map((name) => {
        const choice = choiceOf(name)
        if (choice === 'create') return { name, mode: 'create' as const, existingId: null }
        if (choice === 'none') return { name, mode: 'none' as const, existingId: null }
        return { name, mode: 'existing' as const, existingId: choice }
      })

      const result = await importProducts({ products: payload, categoryPlan })
      if (result.status === 'error') setError(result.error)
      else setDone(result)
    } catch {
      setError('등록 요청이 실패했습니다. 연결을 확인하고 다시 시도하세요')
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
            등록 완료 — 상품 {formatQty(done.count)}개
          </p>
          <p className="text-ink-muted text-sm leading-relaxed">
            <Link href="/stock" className="text-primary underline">
              재고 목록
            </Link>
            에서 확인하세요. 잘못 올렸다면 배치 번호{' '}
            <span className="text-ink" data-numeric>
              {done.batchId.slice(0, 8)}
            </span>
            로 통째로 되돌릴 수 있습니다 (관리자에게 요청).
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

  // ---------- 확인 중 ----------
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
            중복을 확인하는 중… ({cells.length.toLocaleString()}줄)
          </p>
        )}
      </Card>
    )
  }

  const s = summary!
  const canConfirm = s.included.length > 0 && s.emptyName.length === 0 && !saving

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
          총 <b data-numeric>{rows.length}</b>줄 · 등록{' '}
          <b data-numeric>{s.included.length}</b>
          {s.junk.length > 0 ? (
            <>
              {' '}
              · 빈 줄·머리글 <b data-numeric>{s.junk.length}</b>
            </>
          ) : null}
          {s.dupCode.length > 0 ? (
            <>
              {' '}
              · 코드 중복 <b data-numeric className="text-low">{s.dupCode.length}</b>
            </>
          ) : null}
          {s.dupName.length > 0 ? (
            <>
              {' '}
              · 이름 중복 <b data-numeric className="text-low">{s.dupName.length}</b>
            </>
          ) : null}
          {s.skipped.length > 0 ? (
            <>
              {' '}
              · 건너뜀 <b data-numeric>{s.skipped.length}</b>
            </>
          ) : null}
          {' '}· 초도 재고 <b data-numeric>{formatQty(s.qtyTotal)}</b>점 · 매입 합계{' '}
          <b data-numeric>{formatWon(s.purchaseTotal)}</b>
        </p>
      </Card>

      {/* 분류 처리 — 파일의 분류 이름을 앱 카테고리에 잇는다 */}
      {s.catNames.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>분류 {s.catNames.length}종</CardTitle>
          </CardHeader>
          <CardBody className="flex flex-col gap-3">
            <p className="text-ink-muted text-sm">
              파일에 나온 분류입니다. 없는 분류는 새로 만들어 드립니다.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {s.catNames.map((name) => (
                <Select
                  key={name}
                  label={name}
                  value={choiceOf(name)}
                  onChange={(e) =>
                    setCatChoice((prev) => ({ ...prev, [name]: e.target.value }))
                  }
                >
                  <option value="create">새 분류로 만들기</option>
                  <option value="none">분류 없이 등록</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      기존: {c.label}
                    </option>
                  ))}
                </Select>
              ))}
            </div>
          </CardBody>
        </Card>
      ) : null}

      {/* 코드가 짧아 코드 없이 등록되는 줄 */}
      {rows.some((r) => isIncluded(r) && r.shortCode) ? (
        <Card className="p-4">
          <p className="text-ink-muted text-sm">
            상품코드가 4자 미만인 줄은 코드 없이 등록됩니다:{' '}
            {rows
              .filter((r) => isIncluded(r) && r.shortCode)
              .map((r) => `${r.no}줄(${r.shortCode})`)
              .join(', ')}
          </p>
        </Card>
      ) : null}

      {/* 중복 목록 */}
      {s.dupCode.length + s.dupName.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>중복 {s.dupCode.length + s.dupName.length}줄</CardTitle>
          </CardHeader>
          <CardBody className="flex flex-col gap-2">
            {rows
              .filter((r) => r.status.kind === 'dup-code' || (r.status.kind === 'dup-name' && !r.status.included))
              .map((r) => {
                const st = r.status
                return (
                  <div key={r.no} className="flex items-baseline justify-between gap-3">
                    <p className="text-ink min-w-0 truncate text-sm">
                      <span className="text-ink-subtle mr-2" data-numeric>
                        {r.no}줄
                      </span>
                      {r.name}
                      <span className="text-ink-muted">
                        {' '}
                        ·{' '}
                        {st.kind === 'dup-code'
                          ? st.where === 'file'
                            ? `코드 ${r.code} 가 파일 안에서 겹칩니다`
                            : `코드 ${r.code} 가 이미 등록돼 있습니다`
                          : st.kind === 'dup-name'
                            ? st.where === 'file'
                              ? '같은 이름이 파일 안에 또 있습니다'
                              : '같은 이름의 상품이 이미 있습니다'
                            : null}
                      </span>
                    </p>
                    {st.kind === 'dup-name' ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          patchRow(r.no, {
                            status: { kind: 'dup-name', where: st.where, included: true },
                          })
                        }
                      >
                        그래도 등록
                      </Button>
                    ) : null}
                  </div>
                )
              })}
            <p className="text-ink-muted text-sm">
              코드가 겹치는 줄은 등록할 수 없습니다 — 같은 상품이 이미 있다는
              뜻입니다.
            </p>
          </CardBody>
        </Card>
      ) : null}

      {/* 등록될 상품 표 — 이름·수량은 여기서 바로 고칠 수 있다 */}
      <Card>
        <CardHeader>
          <CardTitle>등록될 상품 {s.included.length}개</CardTitle>
        </CardHeader>
        <CardBody className="overflow-x-auto">
          <table className="w-full min-w-[52rem] text-sm">
            <thead>
              <tr className="text-ink-muted border-border-base border-b text-left text-xs">
                <th className="py-1.5 pr-3 font-medium">#</th>
                <th className="py-1.5 pr-3 font-medium">제품명 (수정 가능)</th>
                <th className="py-1.5 pr-3 font-medium">분류</th>
                <th className="py-1.5 pr-3 font-medium">유통</th>
                <th className="py-1.5 pr-3 font-medium">코드</th>
                <th className="py-1.5 pr-3 text-right font-medium">입수</th>
                <th className="py-1.5 pr-3 text-right font-medium">원가</th>
                <th className="py-1.5 pr-3 text-right font-medium">판매가</th>
                <th className="py-1.5 pr-3 text-right font-medium">초도수량</th>
                <th className="py-1.5 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows
                .filter((r) => isIncluded(r) || r.status.kind === 'skipped')
                .map((r) => {
                  const skipped = r.status.kind === 'skipped'
                  return (
                    <tr
                      key={r.no}
                      className={`border-border-base border-b last:border-0 ${skipped ? 'opacity-45' : ''}`}
                    >
                      <td className="text-ink-subtle py-1.5 pr-3" data-numeric>
                        {r.no}
                      </td>
                      <td className="py-1.5 pr-3">
                        <Input
                          aria-label={`${r.no}줄 제품명`}
                          value={r.name}
                          disabled={skipped}
                          onChange={(e) => patchRow(r.no, { name: e.target.value })}
                          maxLength={120}
                          className="min-w-56"
                        />
                        {r.spec ? (
                          <span className="text-ink-subtle mt-0.5 block truncate text-xs">
                            {r.spec}
                          </span>
                        ) : null}
                      </td>
                      <td className="text-ink-muted py-1.5 pr-3 whitespace-nowrap">
                        {r.categoryName ?? '—'}
                      </td>
                      <td className="text-ink-muted py-1.5 pr-3 whitespace-nowrap">
                        {r.channel ?? '—'}
                      </td>
                      <td className="text-ink-muted py-1.5 pr-3 whitespace-nowrap" data-numeric>
                        {r.code ?? '—'}
                      </td>
                      <td className="text-ink py-1.5 pr-3 text-right" data-numeric>
                        {r.pack != null ? formatQty(r.pack) : '—'}
                      </td>
                      <td className="text-ink py-1.5 pr-3 text-right" data-numeric>
                        {formatWon(r.cost)}
                      </td>
                      <td className="text-ink py-1.5 pr-3 text-right" data-numeric>
                        {r.price > 0 ? formatWon(r.price) : <span className="text-low">미정</span>}
                      </td>
                      <td className="py-1.5 pr-3 text-right">
                        <NumberInput
                          aria-label={`${r.no}줄 초도수량`}
                          value={String(r.qty)}
                          disabled={skipped}
                          onChange={(e) => {
                            const n = Number(e.target.value.replace(/[^\d]/g, ''))
                            patchRow(r.no, { qty: Number.isFinite(n) ? n : 0 })
                          }}
                          className="w-20 text-right"
                        />
                      </td>
                      <td className="py-1.5 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            patchRow(r.no, {
                              status: skipped ? { kind: 'ok' } : { kind: 'skipped' },
                            })
                          }
                        >
                          {skipped ? '되살리기' : '빼기'}
                        </Button>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </CardBody>
      </Card>

      {s.emptyName.length > 0 ? (
        <p className="text-low text-sm">
          이름이 빈 줄이 {s.emptyName.length}개 있습니다. 채우거나 빼야 등록할
          수 있습니다.
        </p>
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
        <Button full disabled={!canConfirm} onClick={() => void confirm()}>
          {saving ? '등록 중…' : `${formatQty(s.included.length)}개 등록하기`}
        </Button>
      </div>
    </div>
  )
}
