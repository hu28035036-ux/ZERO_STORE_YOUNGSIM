'use client'

import { useState } from 'react'
import { FileSpreadsheet, Upload } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/field'

import { cellToText, decodeCsvBytes, parseDelimited, type Cell } from '../../sales/import/parse'
import {
  COLUMN_HINT,
  COLUMN_LABEL,
  guessMapping,
  headerSignature,
  loadSavedMapping,
  type PurchaseColumnKey,
  type PurchaseColumnMap,
} from './columns'
import { PurchaseImportPreview } from './preview'

/**
 * 입고 파일 4단계 상태기계: 파일 → (시트) → 열 지정 → 미리보기·확정.
 * 상품 임포트(stock/import/import-flow.tsx)의 복제·개조판이다 — 제목 줄
 * 고르기(pickHeaderRow)까지 같은 방식. 다른 것은 열의 뜻 목록과, 미리보기가
 * "등록"이 아니라 "기존 상품 매칭 + 입고"라는 점뿐이다.
 */

/** 한 번에 반영할 수 있는 데이터 행 수 (서버 액션 body 1MB 상한과 같은 이유) */
const MAX_ROWS = 2_000

/** 헤더 후보로 훑는 앞쪽 줄 수 */
const HEADER_SCAN = 10

type SheetOption = { name: string; data: Cell[][] }

type Flow =
  | { step: 'pick' }
  | { step: 'sheets'; fileName: string; sheets: SheetOption[] }
  | {
      step: 'columns'
      fileName: string
      data: Cell[][]
      headerRow: number
      map: PurchaseColumnMap
    }

/** 열 추측이 가장 많이 맞는 줄을 헤더로 본다. 하나도 안 맞으면 첫 줄. */
function pickHeaderRow(data: Cell[][]): number {
  let best = 0
  let bestCount = 0
  for (let i = 0; i < Math.min(HEADER_SCAN, data.length); i++) {
    const count = Object.keys(guessMapping(data[i].map(cellToText))).length
    if (count > bestCount) {
      best = i
      bestCount = count
    }
  }
  return best
}

/** 매칭에 필요한 것(식별자 + 수량)이 다 있어야 미리보기로 넘어간다 */
function isUsable(map: PurchaseColumnMap): boolean {
  return (map.code != null || map.name != null) && map.qty != null
}

export function PurchaseImportFlow() {
  const [flow, setFlow] = useState<Flow>({ step: 'pick' })
  const [error, setError] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [confirmed, setConfirmed] = useState<{
    fileName: string
    headers: string[]
    rows: Cell[][]
    map: PurchaseColumnMap
    signature: string
    remembered: boolean
  } | null>(null)

  function reset() {
    setFlow({ step: 'pick' })
    setConfirmed(null)
    setError(null)
  }

  function enterColumns(fileName: string, data: Cell[][]) {
    if (data.length < 2) {
      setError('표에 데이터 줄이 없습니다')
      setFlow({ step: 'pick' })
      return
    }
    if (data.length - 1 > MAX_ROWS) {
      // 자르지 않고 거부한다. 조용히 자르면 일부만 반영됐는데 사람은 다 넣은 줄 안다.
      setError(
        `한 번에 ${MAX_ROWS.toLocaleString()}줄까지만 반영할 수 있습니다 (지금 ${(data.length - 1).toLocaleString()}줄). 파일을 나눠서 올리세요`,
      )
      setFlow({ step: 'pick' })
      return
    }

    const headerRow = pickHeaderRow(data)
    const headers = data[headerRow].map(cellToText)
    const signature = headerSignature(headers)

    const saved = loadSavedMapping(signature)
    if (saved && isUsable(saved)) {
      setConfirmed({
        fileName,
        headers,
        rows: data.slice(headerRow + 1),
        map: saved,
        signature,
        remembered: true,
      })
      return
    }

    const guessed = guessMapping(headers)
    if (isUsable(guessed)) {
      // 스스로 알아냈으면 열 지정을 건너뛴다 — 미리보기 맨 위의 "파일을 이렇게
      // 읽었습니다" 카드가 대조 지점이다 (판매 임포트에서 정한 방식).
      setConfirmed({
        fileName,
        headers,
        rows: data.slice(headerRow + 1),
        map: guessed,
        signature,
        remembered: false,
      })
      return
    }

    setFlow({ step: 'columns', fileName, data, headerRow, map: guessed })
  }

  async function handleFile(file: File) {
    setError(null)
    setReading(true)
    try {
      const lower = file.name.toLowerCase()
      if (lower.endsWith('.xlsx')) {
        // 동적 import: CSV 만 쓰는 사람은 엑셀 파서를 한 바이트도 받지 않는다.
        const { default: readXlsxFile } = await import('read-excel-file/browser')
        const sheets = await readXlsxFile(file)
        const usable = sheets
          .map((s) => ({ name: s.sheet, data: s.data as Cell[][] }))
          .filter((s) => s.data.length > 0)
        if (usable.length === 0) {
          setError('통합문서에 내용이 있는 시트가 없습니다')
        } else if (usable.length === 1) {
          enterColumns(file.name, usable[0].data)
        } else {
          setFlow({ step: 'sheets', fileName: file.name, sheets: usable })
        }
      } else if (lower.endsWith('.xls')) {
        setError(
          '.xls(옛 엑셀 형식)는 읽지 못합니다. 엑셀에서 "다른 이름으로 저장" 으로 .xlsx 나 CSV 로 바꿔 주세요',
        )
      } else {
        const text = decodeCsvBytes(await file.arrayBuffer())
        enterColumns(file.name, parseDelimited(text))
      }
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e)
      setError(`파일을 읽지 못했습니다: ${detail}`)
    } finally {
      setReading(false)
    }
  }

  if (confirmed) {
    return (
      <PurchaseImportPreview
        fileName={confirmed.fileName}
        headers={confirmed.headers}
        rows={confirmed.rows}
        map={confirmed.map}
        signature={confirmed.signature}
        remembered={confirmed.remembered}
        onChangeMapping={() => {
          setFlow({
            step: 'columns',
            fileName: confirmed.fileName,
            data: [confirmed.headers as Cell[], ...confirmed.rows],
            headerRow: 0,
            map: confirmed.map,
          })
          setConfirmed(null)
        }}
        onRestart={reset}
      />
    )
  }

  if (flow.step === 'sheets') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>시트 고르기</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          <p className="text-ink-muted text-sm">
            {flow.fileName} 에 시트가 {flow.sheets.length}개 있습니다. 입고
            목록이 있는 시트를 고르세요.
          </p>
          <ul className="flex flex-col gap-2">
            {flow.sheets.map((s) => (
              <li key={s.name}>
                <button
                  type="button"
                  onClick={() => enterColumns(flow.fileName, s.data)}
                  className="border-border-strong hover:bg-surface-sunken flex w-full items-baseline justify-between gap-3 rounded-lg border px-4 py-3 text-left"
                >
                  <span className="text-ink text-sm font-medium">{s.name}</span>
                  <span className="text-ink-muted text-xs" data-numeric>
                    {Math.max(0, s.data.length - 1).toLocaleString()}줄
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Button variant="ghost" size="sm" onClick={reset}>
            다른 파일 고르기
          </Button>
        </CardBody>
      </Card>
    )
  }

  if (flow.step === 'columns') {
    return (
      <ColumnPicker
        data={flow.data}
        headerRow={flow.headerRow}
        initial={flow.map}
        onHeaderRow={(row) => {
          setFlow({
            ...flow,
            headerRow: row,
            map: guessMapping(flow.data[row].map(cellToText)),
          })
        }}
        onBack={reset}
        onDone={(map) => {
          const headers = flow.data[flow.headerRow].map(cellToText)
          setConfirmed({
            fileName: flow.fileName,
            headers,
            rows: flow.data.slice(flow.headerRow + 1),
            map,
            signature: headerSignature(headers),
            remembered: false,
          })
        }}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>입고 파일 올리기</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          <p className="text-ink-muted text-sm leading-relaxed">
            발주서·거래명세서 같은 엑셀(.xlsx)이나 CSV 를 올리면 등록된 상품과
            짝지어 입고를 한 번에 넣습니다. 상품코드(바코드)나 제품명 열, 그리고
            수량 열이 있으면 됩니다.
          </p>
          <label className="border-border-strong hover:bg-surface-sunken flex h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed">
            <Upload size={22} aria-hidden className="text-ink-subtle" />
            <span className="text-ink text-sm font-medium">
              {reading ? '읽는 중…' : '파일 고르기'}
            </span>
            <span className="text-ink-subtle text-xs">.xlsx · .csv · .tsv</span>
            <input
              type="file"
              accept=".xlsx,.csv,.tsv,text/csv,text/tab-separated-values"
              className="sr-only"
              disabled={reading}
              onChange={(e) => {
                const f = e.target.files?.[0]
                // 같은 파일을 다시 골라도 change 가 나게 비운다.
                e.target.value = ''
                if (f) void handleFile(f)
              }}
            />
          </label>
          {error ? (
            <p role="alert" className="text-danger text-sm">
              {error}
            </p>
          ) : null}
        </CardBody>
      </Card>

      <Card className="p-4">
        <p className="text-ink-muted flex items-center gap-2 text-sm">
          <FileSpreadsheet size={16} aria-hidden className="shrink-0" />
          <span>
            새 상품 등록은 여기가 아니라 재고 화면의 “파일로 등록”입니다. 이
            화면은 이미 등록된 상품의 수량만 늘립니다.
          </span>
        </p>
      </Card>
    </div>
  )
}

function ColumnPicker({
  data,
  headerRow,
  initial,
  onHeaderRow,
  onBack,
  onDone,
}: {
  data: Cell[][]
  headerRow: number
  initial: PurchaseColumnMap
  onHeaderRow: (row: number) => void
  onBack: () => void
  onDone: (map: PurchaseColumnMap) => void
}) {
  const [map, setMap] = useState<PurchaseColumnMap>(initial)

  const headers = data[headerRow].map(cellToText)
  const keys: PurchaseColumnKey[] = ['code', 'name', 'qty', 'cost']

  // 같은 열을 두 뜻에 이으면 한쪽이 조용히 틀린다. 미리 막는다.
  const usedTwice = new Set(
    Object.values(map).filter((v, i, arr) => v != null && arr.indexOf(v) !== i),
  )

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>열 지정</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <p className="text-ink-muted text-sm leading-relaxed">
            자동으로 알아내지 못했습니다. 파일의 어느 열이 무엇인지 골라
            주세요. 상품코드나 제품명 중 하나와 수량 열이 꼭 필요합니다.
          </p>

          {data.length > 1 ? (
            <Select
              label="제목(헤더) 줄"
              hint="제목 위에 다른 글이 있는 시트면 제목 줄을 직접 고르세요"
              value={headerRow}
              onChange={(e) => {
                setMap(guessMapping(data[Number(e.target.value)].map(cellToText)))
                onHeaderRow(Number(e.target.value))
              }}
            >
              {data.slice(0, Math.min(10, data.length)).map((row, i) => (
                <option key={i} value={i}>
                  {i + 1}줄: {row.map(cellToText).filter(Boolean).slice(0, 4).join(' · ') || '(빈 줄)'}
                </option>
              ))}
            </Select>
          ) : null}

          <div className="flex flex-col gap-3">
            {keys.map((key) => (
              <Select
                key={key}
                label={COLUMN_LABEL[key]}
                hint={COLUMN_HINT[key]}
                value={map[key] ?? ''}
                onChange={(e) => {
                  const v = e.target.value
                  setMap((prev) => {
                    const next = { ...prev }
                    if (v === '') delete next[key]
                    else next[key] = Number(v)
                    return next
                  })
                }}
              >
                <option value="">이 파일에 없음</option>
                {headers.map((h, i) => (
                  <option key={i} value={i}>
                    {h || `${i + 1}번째 열`}
                  </option>
                ))}
              </Select>
            ))}
          </div>

          {usedTwice.size > 0 ? (
            <p role="alert" className="text-danger text-sm">
              같은 열이 두 가지 뜻에 지정돼 있습니다. 하나만 남기세요.
            </p>
          ) : null}
        </CardBody>
      </Card>

      <div className="flex gap-2">
        <Button variant="secondary" onClick={onBack} className="shrink-0">
          다른 파일
        </Button>
        <Button
          full
          disabled={!isUsable(map) || usedTwice.size > 0}
          onClick={() => onDone(map)}
        >
          이 지정으로 계속
        </Button>
      </div>
      {!isUsable(map) ? (
        <p className="text-ink-muted text-sm">
          상품코드나 제품명 중 하나, 그리고 수량 열을 지정해야 계속할 수
          있습니다.
        </p>
      ) : null}
    </div>
  )
}
