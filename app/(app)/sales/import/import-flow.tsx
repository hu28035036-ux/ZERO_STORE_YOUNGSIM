'use client'

import { useState } from 'react'
import { FileSpreadsheet, Upload } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/field'
import type { Device } from '@/lib/device'

import {
  COLUMN_HINT,
  COLUMN_LABEL,
  guessMapping,
  headerSignature,
  loadSavedMapping,
  type ColumnKey,
  type ColumnMap,
} from './columns'
import { cellToText, decodeCsvBytes, parseDelimited, type Cell } from './parse'
import { ImportPreview } from './preview'

/**
 * 파일 임포트 4단계 상태기계: 파일 → (시트) → 열 지정 → 미리보기·확정.
 *
 * 파일은 브라우저에서만 읽는다. 서버로는 열 지정이 끝난 뒤 추린 값만 간다 —
 * 서버 액션 body 상한(1MB)을 안 건드리고, 열을 바꿔볼 때마다 파일을 다시
 * 보낼 일도 없다.
 */

/** 한 번에 반영할 수 있는 데이터 행 수. 6개 값 × 2,000줄 ≈ 250KB 로 1MB 안. */
const MAX_ROWS = 2_000

type SheetOption = { name: string; data: Cell[][] }

type Flow =
  | { step: 'pick' }
  | { step: 'sheets'; fileName: string; sheets: SheetOption[] }
  | {
      step: 'columns'
      fileName: string
      headers: string[]
      rows: Cell[][]
      map: ColumnMap
      /** 저장된 매핑을 그대로 썼는지 — 미리보기 상단 안내에 쓴다 */
      remembered: boolean
    }

export function ImportFlow({ device }: { device: Device }) {
  const [flow, setFlow] = useState<Flow>({ step: 'pick' })
  const [error, setError] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [confirmedMap, setConfirmedMap] = useState<{
    headers: string[]
    rows: Cell[][]
    map: ColumnMap
    signature: string
    remembered: boolean
  } | null>(null)

  function reset() {
    setFlow({ step: 'pick' })
    setConfirmedMap(null)
    setError(null)
  }

  function enterColumns(fileName: string, data: Cell[][]) {
    if (data.length < 2) {
      setError('표에 데이터 줄이 없습니다. 첫 줄은 제목(헤더)이어야 합니다')
      setFlow({ step: 'pick' })
      return
    }
    if (data.length - 1 > MAX_ROWS) {
      // 자르지 않고 거부한다. 조용히 자르면 재고가 안 맞는데 사람은 다
      // 넣은 줄 안다.
      setError(
        `한 번에 ${MAX_ROWS.toLocaleString()}줄까지만 반영할 수 있습니다 (지금 ${(data.length - 1).toLocaleString()}줄). 파일을 나눠서 올리세요`,
      )
      setFlow({ step: 'pick' })
      return
    }

    const headers = data[0].map(cellToText)
    const rows = data.slice(1)
    const signature = headerSignature(headers)

    // 같은 모양의 파일이면 열 지정을 건너뛴다. 매핑이 틀렸으면 미리보기의
    // "열 지정 바꾸기"로 돌아올 수 있다.
    const saved = loadSavedMapping(signature)
    if (saved && isUsable(saved)) {
      setConfirmedMap({ headers, rows, map: saved, signature, remembered: true })
      return
    }

    setFlow({
      step: 'columns',
      fileName,
      headers,
      rows,
      map: guessMapping(headers),
      remembered: false,
    })
  }

  async function handleFile(file: File) {
    setError(null)
    setReading(true)
    try {
      const lower = file.name.toLowerCase()
      if (lower.endsWith('.xlsx')) {
        // 동적 import: CSV 만 쓰는 사람은 엑셀 파서를 한 바이트도 받지 않는다
        // (barcode-scanner 가 wasm ponyfill 을 다루는 방식과 같다).
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
          // POS 내보내기는 "요약" 시트가 앞에 오는 일이 흔하다. 고르게 한다.
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

  // 미리보기 단계는 별도 컴포넌트가 맡는다. 열 지정으로 돌아오는 길만 준다.
  if (confirmedMap) {
    return (
      <ImportPreview
        device={device}
        rows={confirmedMap.rows}
        map={confirmedMap.map}
        signature={confirmedMap.signature}
        remembered={confirmedMap.remembered}
        onChangeMapping={() => {
          setFlow({
            step: 'columns',
            fileName: '',
            headers: confirmedMap.headers,
            rows: confirmedMap.rows,
            map: confirmedMap.map,
            remembered: false,
          })
          setConfirmedMap(null)
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
            {flow.fileName} 에 시트가 {flow.sheets.length}개 있습니다. 판매
            기록이 있는 시트를 고르세요.
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
        headers={flow.headers}
        rows={flow.rows}
        initial={flow.map}
        onBack={reset}
        onDone={(map) => {
          setConfirmedMap({
            headers: flow.headers,
            rows: flow.rows,
            map,
            signature: headerSignature(flow.headers),
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
          <CardTitle>판매기록 파일 올리기</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          <p className="text-ink-muted text-sm leading-relaxed">
            엑셀(.xlsx)이나 CSV 를 올리면 열을 확인한 뒤 재고에 반영합니다.
            양식은 자유입니다 — 바코드나 상품명, 수량만 있으면 됩니다.
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
                // 같은 파일을 다시 골라도 change 가 나게 비운다 — 안 비우면
                // "고쳐서 다시 올리기"가 무반응으로 보인다.
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
            처음이면 양식 예시를 참고하세요: 판매일 · 바코드 · 상품명 · 수량 ·
            단가 열이 있는 표면 됩니다.
          </span>
        </p>
      </Card>
    </div>
  )
}

/** (바코드 또는 상품명) + 수량이 있어야 매칭이 가능하다. */
function isUsable(map: ColumnMap): boolean {
  return (map.barcode != null || map.name != null) && map.qty != null
}

function ColumnPicker({
  headers,
  rows,
  initial,
  onBack,
  onDone,
}: {
  headers: string[]
  rows: Cell[][]
  initial: ColumnMap
  onBack: () => void
  onDone: (map: ColumnMap) => void
}) {
  const [map, setMap] = useState<ColumnMap>(initial)

  const usable = isUsable(map)
  const keys: ColumnKey[] = ['barcode', 'name', 'option', 'qty', 'price', 'amount', 'date']

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
            뒀습니다. 바코드나 상품명 중 하나와 수량은 꼭 있어야 합니다.
          </p>

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
        <Button
          full
          disabled={!usable || usedTwice.size > 0}
          onClick={() => onDone(map)}
        >
          이 지정으로 계속
        </Button>
      </div>
      {!usable ? (
        <p className="text-ink-muted text-sm">
          바코드나 상품명 중 하나, 그리고 수량 열을 지정해야 계속할 수 있습니다.
        </p>
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
  map: ColumnMap
}) {
  const picked = (Object.entries(map) as [ColumnKey, number][]).sort(
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
