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

/** 헤더 후보로 훑는 앞쪽 줄 수 */
const HEADER_SCAN = 10

type SheetOption = { name: string; data: Cell[][] }

/** 열 지정의 출처. 'guessed' 가 보통이고, 나머지 둘은 예외 경로다. */
export type MapSource = 'guessed' | 'remembered' | 'manual'

type Flow =
  | { step: 'pick' }
  | { step: 'sheets'; fileName: string; sheets: SheetOption[] }
  | {
      step: 'columns'
      fileName: string
      data: Cell[][]
      headerRow: number
      map: ColumnMap
      /**
       * 이 화면에 온 이유. 자동으로 못 찾아서 온 것과, 잘 찾았는데 사람이
       * 고치러 온 것은 첫 문장이 달라야 한다 — 후자에게 "못 찾았습니다"라고
       * 하면 멀쩡한 지정을 의심하게 만든다.
       */
      reason: 'failed' | 'edit'
    }

/**
 * 열 추측이 가장 많이 맞는 줄을 헤더로 본다. 하나도 안 맞으면 첫 줄.
 *
 * 첫 줄이 헤더라고 가정했다가 실제 포스 파일에서 깨졌다: "메뉴별 매출현황"
 * 내보내기는 1줄이 보고서 제목, 2줄이 빈 줄, 3줄이 진짜 헤더다. 제목 줄을
 * 헤더로 읽으면 열 이름이 전부 빈 칸이 되어 자동 추측이 하나도 안 걸리고,
 * 화면에는 "2번째 열" 같은 것만 남아 **아무것도 안 나온 것처럼 보인다.**
 * (상품 임포트 `stock/import` 는 같은 이유로 이미 이 방식을 쓴다.)
 */
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

export function ImportFlow({ device }: { device: Device }) {
  const [flow, setFlow] = useState<Flow>({ step: 'pick' })
  const [error, setError] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [confirmedMap, setConfirmedMap] = useState<{
    data: Cell[][]
    headerRow: number
    map: ColumnMap
    signature: string
    /** 이 지정이 어디서 왔는지 — 미리보기가 확인 문구를 고르는 데 쓴다 */
    source: MapSource
  } | null>(null)

  function reset() {
    setFlow({ step: 'pick' })
    setConfirmedMap(null)
    setError(null)
  }

  function enterColumns(fileName: string, data: Cell[][]) {
    const headerRow = pickHeaderRow(data)
    const dataRows = data.length - headerRow - 1

    if (dataRows < 1) {
      setError('표에 데이터 줄이 없습니다')
      setFlow({ step: 'pick' })
      return
    }
    if (dataRows > MAX_ROWS) {
      // 자르지 않고 거부한다. 조용히 자르면 재고가 안 맞는데 사람은 다
      // 넣은 줄 안다.
      setError(
        `한 번에 ${MAX_ROWS.toLocaleString()}줄까지만 반영할 수 있습니다 (지금 ${dataRows.toLocaleString()}줄). 파일을 나눠서 올리세요`,
      )
      setFlow({ step: 'pick' })
      return
    }

    const headers = data[headerRow].map(cellToText)
    const signature = headerSignature(headers)

    // 열 지정은 **막다른 관문이 아니라 고치는 길**이다. 스스로 알아낼 수 있으면
    // 바로 미리보기로 보내고, 무엇을 무엇으로 읽었는지는 거기서 확인받는다.
    // 드롭다운 일곱 개를 먼저 들이밀면, 맞게 추측했을 때조차 사람이 파일 열을
    // 하나하나 대조해야 한다 — 대부분의 파일에서 그건 헛수고다.
    // 못 알아낸 경우에만 열 지정 화면을 띄운다.
    const saved = loadSavedMapping(signature)
    if (saved && isUsable(saved)) {
      setConfirmedMap({ data, headerRow, map: saved, signature, source: 'remembered' })
      return
    }

    const guess = guessMapping(headers)
    if (isUsable(guess)) {
      setConfirmedMap({ data, headerRow, map: guess, signature, source: 'guessed' })
      return
    }

    setFlow({ step: 'columns', fileName, data, headerRow, map: guess, reason: 'failed' })
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
  // 원본 표(data)를 그대로 들고 있어서 되돌아가면 제목 줄까지 다시 고를 수 있다.
  if (confirmedMap) {
    return (
      <ImportPreview
        device={device}
        rows={confirmedMap.data.slice(confirmedMap.headerRow + 1)}
        headers={confirmedMap.data[confirmedMap.headerRow].map(cellToText)}
        headerRow={confirmedMap.headerRow}
        map={confirmedMap.map}
        signature={confirmedMap.signature}
        source={confirmedMap.source}
        onChangeMapping={() => {
          setFlow({
            step: 'columns',
            fileName: '',
            data: confirmedMap.data,
            headerRow: confirmedMap.headerRow,
            map: confirmedMap.map,
            reason: 'edit',
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
        data={flow.data}
        headerRow={flow.headerRow}
        initial={flow.map}
        reason={flow.reason}
        onHeaderRow={(row) => {
          setFlow({
            ...flow,
            headerRow: row,
            map: guessMapping(flow.data[row].map(cellToText)),
          })
        }}
        onBack={reset}
        onDone={(map) => {
          setConfirmedMap({
            data: flow.data,
            headerRow: flow.headerRow,
            map,
            signature: headerSignature(flow.data[flow.headerRow].map(cellToText)),
            source: 'manual',
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
            엑셀(.xlsx)이나 CSV 를 올리면 어느 열이 무엇인지 알아서 찾습니다.
            찾은 결과를 보여드리면 확인만 하시면 됩니다. 양식은 자유입니다 —
            바코드나 상품명, 수량만 있으면 됩니다.
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
            판매일 · 바코드 · 상품명 · 수량 · 단가 열이 있는 표면 됩니다. 포스에서
            내려받은 &ldquo;메뉴별 매출현황&rdquo; 파일은 그대로 올리면 읽힙니다 —
            날짜 열이 없으니 어느 날 판매인지만 고르면 됩니다.
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
  data,
  headerRow,
  initial,
  reason,
  onHeaderRow,
  onBack,
  onDone,
}: {
  data: Cell[][]
  headerRow: number
  initial: ColumnMap
  reason: 'failed' | 'edit'
  onHeaderRow: (row: number) => void
  onBack: () => void
  onDone: (map: ColumnMap) => void
}) {
  const [map, setMap] = useState<ColumnMap>(initial)

  const headers = data[headerRow].map(cellToText)
  const rows = data.slice(headerRow + 1)
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
            {reason === 'failed'
              ? '어느 열이 무엇인지 자동으로 알아내지 못했습니다. 직접 짚어 주세요.'
              : '자동으로 찾은 지정입니다. 틀린 것만 바꾸세요.'}{' '}
            바코드나 상품명 중 하나와 수량은 꼭 있어야 합니다.
          </p>

          {data.length > 1 ? (
            <Select
              label="제목(헤더) 줄"
              hint="포스 매출현황처럼 제목 위에 다른 글이 있는 파일이면 제목 줄을 직접 고르세요"
              value={headerRow}
              onChange={(e) => {
                // 제목 줄이 바뀌면 열 지정도 처음부터 다시 추측한다 —
                // 열 뜻은 그대로 두면 다른 줄의 열 번호를 가리켜 조용히 틀린다.
                setMap(guessMapping(data[Number(e.target.value)].map(cellToText)))
                onHeaderRow(Number(e.target.value))
              }}
            >
              {data.slice(0, HEADER_SCAN).map((row, i) => (
                <option key={i} value={i}>
                  {i + 1}줄:{' '}
                  {row.map(cellToText).filter(Boolean).slice(0, 4).join(' · ') || '(빈 줄)'}
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
