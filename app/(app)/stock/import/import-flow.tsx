'use client'

import { useState } from 'react'
import { FileSpreadsheet, Upload } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/field'
import type { CategoryOption } from '../categories'

import {
  COLUMN_HINT,
  COLUMN_LABEL,
  guessMapping,
  headerSignature,
  loadSavedMapping,
  type ProductColumnKey,
  type ProductColumnMap,
} from './columns'
import { cellToText, type Cell } from '../../sales/import/parse'
import { readTableFile } from '../../sales/import/read-file'
import { ProductImportPreview } from './preview'

/**
 * 상품 임포트 4단계 상태기계: 파일 → (시트) → 열 지정 → 미리보기·확정.
 * 판매 임포트(sales/import/import-flow.tsx)의 복제·개조판이다.
 *
 * 판매 쪽과 다른 것 하나 — **제목 줄 고르기**. 본사 발주 시트는 제목 줄 위에
 * 섹션 이름("품절", "신제품")이 오는 일이 있어 첫 줄이 헤더라는 가정이
 * 깨진다. 앞 열 줄에서 열 추측이 가장 많이 맞는 줄을 헤더로 잡고, 틀리면
 * 열 지정 화면에서 바꿀 수 있게 한다.
 */

/** 한 번에 등록할 수 있는 데이터 행 수. 판매 임포트와 같은 이유(1MB 상한). */
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
      map: ProductColumnMap
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

export function ProductImportFlow({
  categories,
  defaultLowStock,
}: {
  categories: CategoryOption[]
  defaultLowStock: number
}) {
  const [flow, setFlow] = useState<Flow>({ step: 'pick' })
  const [error, setError] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [confirmed, setConfirmed] = useState<{
    headers: string[]
    rows: Cell[][]
    map: ProductColumnMap
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
      // 자르지 않고 거부한다. 조용히 자르면 일부만 등록됐는데 사람은 다
      // 넣은 줄 안다.
      setError(
        `한 번에 ${MAX_ROWS.toLocaleString()}줄까지만 등록할 수 있습니다 (지금 ${(data.length - 1).toLocaleString()}줄). 파일을 나눠서 올리세요`,
      )
      setFlow({ step: 'pick' })
      return
    }

    const headerRow = pickHeaderRow(data)
    const headers = data[headerRow].map(cellToText)
    const signature = headerSignature(headers)

    const saved = loadSavedMapping(signature)
    if (saved && saved.name != null) {
      setConfirmed({
        headers,
        rows: data.slice(headerRow + 1),
        map: saved,
        signature,
        remembered: true,
      })
      return
    }

    setFlow({
      step: 'columns',
      fileName,
      data,
      headerRow,
      map: guessMapping(headers),
    })
  }

  async function handleFile(file: File) {
    setError(null)
    setReading(true)
    try {
      // 형식 판별·복구는 read-file.ts 가 한다 — 세 임포트 화면이 같은 길을 탄다.
      const sheets = await readTableFile(file)
      if (sheets.length === 0) {
        setError('표에 내용이 없습니다')
      } else if (sheets.length === 1) {
        enterColumns(file.name, sheets[0].data)
      } else {
        setFlow({ step: 'sheets', fileName: file.name, sheets })
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
      <ProductImportPreview
        rows={confirmed.rows}
        map={confirmed.map}
        signature={confirmed.signature}
        remembered={confirmed.remembered}
        categories={categories}
        defaultLowStock={defaultLowStock}
        onChangeMapping={() => {
          // 헤더 줄까지 되돌리려면 원본 data 가 필요한데 confirmed 에는 없다.
          // 열 지정만 다시 하게 한다 — 헤더 줄이 틀렸으면 파일을 다시 올린다.
          setFlow({
            step: 'columns',
            fileName: '',
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
            {flow.fileName} 에 시트가 {flow.sheets.length}개 있습니다. 상품
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
          <CardTitle>상품 목록 파일 올리기</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          <p className="text-ink-muted text-sm leading-relaxed">
            본사 발주 시트 같은 엑셀(.xlsx)이나 CSV 를 올리면 열을 확인한 뒤
            상품을 한 번에 등록합니다. 제품명 열만 있으면 됩니다.
          </p>
          <label className="border-border-strong hover:bg-surface-sunken flex h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed">
            <Upload size={22} aria-hidden className="text-ink-subtle" />
            <span className="text-ink text-sm font-medium">
              {reading ? '읽는 중…' : '파일 고르기'}
            </span>
            <span className="text-ink-subtle text-xs">.xlsx · .xls · .csv · .tsv</span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.tsv,.html,.htm,text/csv,text/tab-separated-values,text/html"
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
            제품명 · 상품코드 · 소분류 · 입수 · 매입가 · 판매가 열이 있는 표면
            바로 읽힙니다. 제품명의 괄호 규격은 자동으로 정리됩니다.
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
  initial: ProductColumnMap
  onHeaderRow: (row: number) => void
  onBack: () => void
  onDone: (map: ProductColumnMap) => void
}) {
  const [map, setMap] = useState<ProductColumnMap>(initial)

  const headers = data[headerRow].map(cellToText)
  const rows = data.slice(headerRow + 1)
  const usable = map.name != null
  const keys: ProductColumnKey[] = ['name', 'code', 'channel', 'category', 'pack', 'cost', 'price']

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
            파일의 어느 열이 무엇인지 확인해 주세요. 헤더 이름으로 추측해
            뒀습니다. 제품명 열은 꼭 있어야 합니다.
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

      <SamplePreview headers={headers} rows={rows} map={map} />

      <div className="flex gap-2">
        <Button variant="secondary" onClick={onBack}>
          다른 파일
        </Button>
        <Button full disabled={!usable || usedTwice.size > 0} onClick={() => onDone(map)}>
          이 지정으로 계속
        </Button>
      </div>
      {!usable ? (
        <p className="text-ink-muted text-sm">제품명 열을 지정해야 계속할 수 있습니다.</p>
      ) : null}
    </div>
  )
}

/** 처음 몇 줄을 지정된 뜻과 함께 보여줘서, 열을 잘못 이었는지 눈으로 잡게 한다. */
function SamplePreview({
  headers,
  rows,
  map,
}: {
  headers: string[]
  rows: Cell[][]
  map: ProductColumnMap
}) {
  const picked = (Object.entries(map) as [ProductColumnKey, number][]).sort(
    (a, b) => a[1] - b[1],
  )
  if (picked.length === 0) return null

  const sample = rows.slice(0, 3)

  return (
    <Card>
      <CardHeader>
        <CardTitle>파일 첫 {sample.length}줄</CardTitle>
      </CardHeader>
      <CardBody className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-ink-muted border-border-base border-b text-left text-xs">
              {picked.map(([key, i]) => (
                <th key={key} className="py-1.5 pr-4 font-medium whitespace-nowrap">
                  {COLUMN_LABEL[key]}
                  <span className="text-ink-subtle ml-1 font-normal">
                    ({headers[i] || `${i + 1}열`})
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sample.map((row, ri) => (
              <tr key={ri} className="border-border-base border-b last:border-0">
                {picked.map(([key, i]) => (
                  <td key={key} className="text-ink py-1.5 pr-4 whitespace-nowrap">
                    {cellToText(row[i] ?? null) || (
                      <span className="text-ink-subtle">—</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </CardBody>
    </Card>
  )
}
