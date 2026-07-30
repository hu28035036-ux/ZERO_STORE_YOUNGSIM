'use client'

import { useActionState, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, NumberInput, Select } from '@/components/ui/field'

import { createProduct, type CreateProductState } from '../actions'

export type CategoryOption = { id: string; label: string }

type Axis = { id: number; name: string; raw: string }

type Draft = {
  salePrice: string
  unitCost: string
  qty: string
  barcode: string
  threshold: string
}

/** 옵션 축 개수 상한. 서버 검증과 같은 값이어야 한다. */
const MAX_AXES = 3
/** 이 이상이면 한 화면에서 값을 채우는 게 사실상 불가능하다. */
const MANY_VARIANTS = 40

/**
 * 조합을 식별하는 키.
 *
 * 축 이름이 아니라 값으로 만든다. 그래야 축 이름을 고쳐도 이미 채워 넣은
 * 가격이 날아가지 않는다. 구분자는 유닛 세퍼레이터 — 옵션 값에 공백이나
 * 슬래시가 들어가도 서로 다른 조합이 같은 키로 뭉치는 일이 없다.
 */
const KEY_SEP = '\u001f'

function comboKey(options: Record<string, string>, axisNames: string[]): string {
  return axisNames.map((n) => options[n]).join(KEY_SEP)
}

/** 축들의 데카르트 곱. 축이 없으면 옵션 없는 변형 하나가 나온다. */
function cartesian(axes: { name: string; values: string[] }[]) {
  return axes.reduce<Record<string, string>[]>(
    (rows, axis) => rows.flatMap((row) => axis.values.map((v) => ({ ...row, [axis.name]: v }))),
    [{}],
  )
}

/** "검정, 흰색 , 검정" → ["검정","흰색"]. 중복은 조합을 겹치게 하므로 조용히 합친다. */
function parseValues(raw: string): string[] {
  const seen = new Set<string>()
  for (const part of raw.split(',')) {
    const v = part.trim()
    if (v) seen.add(v)
  }
  return [...seen]
}

/** 입력창의 문자열을 정수로. 쉼표를 찍어 넣는 사람이 많아서 숫자만 남긴다. */
function toInt(value: string): number {
  const n = Number(value.replace(/[^\d]/g, ''))
  return Number.isFinite(n) ? n : 0
}

/**
 * 모바일에서만 보이는 필드 라벨.
 *
 * 넓은 화면에는 위에 머리글 줄이 한 번 있으므로 줄마다 라벨을 반복하면 표가
 * 읽히지 않는다. 좁은 화면에는 머리글이 없으니 라벨이 있어야 한다.
 * 어느 쪽이든 입력에는 aria-label 이 붙으므로 스크린리더는 항상 읽을 수 있다.
 */
function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-ink-muted text-xs sm:hidden">{label}</span>
      {children}
    </div>
  )
}

const GRID = 'sm:grid-cols-[1.6fr_1fr_1fr_1fr_1fr_1.4fr]'

export function ProductForm({
  categories,
  defaultLowStock,
}: {
  categories: CategoryOption[]
  defaultLowStock: number
}) {
  const [state, formAction, pending] = useActionState<CreateProductState, FormData>(
    createProduct,
    null,
  )

  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [description, setDescription] = useState('')
  const [axes, setAxes] = useState<Axis[]>([])
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [bulk, setBulk] = useState({ salePrice: '', unitCost: '', threshold: '' })
  const [nextAxisId, setNextAxisId] = useState(1)

  const parsedAxes = useMemo(
    () =>
      axes
        .map((a) => ({ name: a.name.trim(), values: parseValues(a.raw) }))
        .filter((a) => a.name !== '' && a.values.length > 0),
    [axes],
  )

  const axisNames = useMemo(() => parsedAxes.map((a) => a.name), [parsedAxes])
  const combos = useMemo(() => cartesian(parsedAxes), [parsedAxes])

  const emptyDraft = useMemo<Draft>(
    () => ({
      salePrice: '',
      unitCost: '',
      qty: '',
      barcode: '',
      threshold: String(defaultLowStock),
    }),
    [defaultLowStock],
  )

  function draftOf(key: string): Draft {
    return drafts[key] ?? emptyDraft
  }

  function setDraft(key: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({ ...prev, [key]: { ...(prev[key] ?? emptyDraft), ...patch } }))
  }

  const payload = useMemo(
    () =>
      JSON.stringify({
        name: name.trim(),
        categoryId: categoryId || null,
        description: description.trim() || null,
        optionSchema: parsedAxes,
        variants: combos.map((options) => {
          const d = drafts[comboKey(options, axisNames)] ?? emptyDraft
          return {
            options,
            sale_price: toInt(d.salePrice),
            initial_unit_cost: toInt(d.unitCost),
            initial_qty: toInt(d.qty),
            low_stock_threshold: toInt(d.threshold),
            barcode: d.barcode.trim() || null,
          }
        }),
      }),
    [name, categoryId, description, parsedAxes, combos, axisNames, drafts, emptyDraft],
  )

  // 이름만 쓰고 값을 안 넣었거나 그 반대인 축은 조용히 무시된다.
  // 그대로 두면 "옵션을 넣었는데 변형이 하나뿐"인 상황이 되므로 짚어준다.
  const halfFilled = axes.some(
    (a) => (a.name.trim() !== '') !== (parseValues(a.raw).length > 0),
  )

  const duplicateAxisName =
    new Set(axisNames).size !== axisNames.length && axisNames.length > 0

  const canSubmit =
    name.trim() !== '' && combos.length > 0 && !duplicateAxisName && !pending

  function applyBulk() {
    setDrafts((prev) => {
      const next = { ...prev }
      for (const options of combos) {
        const key = comboKey(options, axisNames)
        const base = next[key] ?? emptyDraft
        next[key] = {
          ...base,
          // 비워둔 칸은 건드리지 않는다. 일괄 입력이 이미 채운 값을 지우면
          // 되돌릴 방법이 없다.
          salePrice: bulk.salePrice !== '' ? bulk.salePrice : base.salePrice,
          unitCost: bulk.unitCost !== '' ? bulk.unitCost : base.unitCost,
          threshold: bulk.threshold !== '' ? bulk.threshold : base.threshold,
        }
      }
      return next
    })
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 pb-4">
      {/* 옵션 축과 변형이 동적이라 폼 필드로 펼치는 대신 JSON 한 덩이로 보낸다.
          검증은 서버의 zod 와 DB 제약이 다시 한다. */}
      <input type="hidden" name="payload" value={payload} />

      <Card>
        <CardHeader>
          <CardTitle>기본 정보</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <Input
            label="상품명"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 생수 500ml"
            required
            maxLength={120}
          />
          <Select
            label="카테고리"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            hint={
              categories.length === 0
                ? '아직 카테고리가 없습니다. 설정에서 먼저 만들 수 있습니다.'
                : undefined
            }
          >
            <option value="">선택 안 함</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
          <Input
            label="설명"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="선택 입력"
            maxLength={500}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>옵션</CardTitle>
          <Button
            size="sm"
            variant="secondary"
            disabled={axes.length >= MAX_AXES}
            onClick={() => {
              setAxes((prev) => [...prev, { id: nextAxisId, name: '', raw: '' }])
              setNextAxisId((n) => n + 1)
            }}
          >
            <Plus size={16} aria-hidden />
            옵션 추가
          </Button>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          {axes.length === 0 ? (
            <p className="text-ink-muted text-sm leading-relaxed">
              옵션이 없는 상품입니다. 재고 단위 한 개로 등록됩니다. 색상이나 크기처럼
              따로 세어야 하는 것이 있으면 옵션을 추가하세요.
            </p>
          ) : (
            axes.map((axis, i) => {
              const values = parseValues(axis.raw)
              return (
                <div key={axis.id} className="flex flex-col gap-2">
                  <div className="flex items-end gap-2">
                    <Input
                      label={`옵션 ${i + 1}`}
                      value={axis.name}
                      onChange={(e) =>
                        setAxes((prev) =>
                          prev.map((a) =>
                            a.id === axis.id ? { ...a, name: e.target.value } : a,
                          ),
                        )
                      }
                      placeholder="색상"
                      maxLength={20}
                      className="sm:w-40"
                    />
                    <div className="flex-1">
                      <Input
                        label="값 (쉼표로 구분)"
                        value={axis.raw}
                        onChange={(e) =>
                          setAxes((prev) =>
                            prev.map((a) =>
                              a.id === axis.id ? { ...a, raw: e.target.value } : a,
                            ),
                          )
                        }
                        placeholder="검정, 흰색, 회색"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      aria-label={`옵션 ${i + 1} 삭제`}
                      onClick={() =>
                        setAxes((prev) => prev.filter((a) => a.id !== axis.id))
                      }
                    >
                      <Trash2 size={18} aria-hidden />
                    </Button>
                  </div>
                  {values.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {values.map((v) => (
                        <Badge key={v}>{v}</Badge>
                      ))}
                    </div>
                  ) : null}
                </div>
              )
            })
          )}

          {halfFilled ? (
            <p className="text-low text-sm">
              이름과 값이 모두 있어야 옵션으로 잡힙니다. 한쪽만 채운 줄은 무시됩니다.
            </p>
          ) : null}
          {duplicateAxisName ? (
            <p className="text-danger text-sm">옵션 이름이 서로 겹칩니다.</p>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>재고 단위 {combos.length}개</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          {combos.length > 1 ? (
            <div className="bg-surface-sunken flex flex-wrap items-center gap-2 rounded-lg p-3">
              <span className="text-ink-muted w-full text-xs">전체에 한 번에 넣기</span>
              <NumberInput
                aria-label="전체 판매가"
                placeholder="판매가"
                value={bulk.salePrice}
                onChange={(e) => setBulk((b) => ({ ...b, salePrice: e.target.value }))}
                className="w-24"
              />
              <NumberInput
                aria-label="전체 원가"
                placeholder="원가"
                value={bulk.unitCost}
                onChange={(e) => setBulk((b) => ({ ...b, unitCost: e.target.value }))}
                className="w-24"
              />
              <NumberInput
                aria-label="전체 최소재고"
                placeholder="최소재고"
                value={bulk.threshold}
                onChange={(e) => setBulk((b) => ({ ...b, threshold: e.target.value }))}
                className="w-24"
              />
              <Button size="sm" variant="secondary" onClick={applyBulk}>
                적용
              </Button>
            </div>
          ) : null}

          {combos.length > MANY_VARIANTS ? (
            <p className="text-low text-sm">
              조합이 {combos.length}개입니다. 옵션 값을 줄이거나 상품을 나누는 편이
              나중에 세기 쉽습니다.
            </p>
          ) : null}

          <div
            className={`text-ink-muted hidden gap-2 px-1 text-xs sm:grid ${GRID}`}
            aria-hidden
          >
            <span>옵션</span>
            <span>판매가</span>
            <span>원가</span>
            <span>기초수량</span>
            <span>최소재고</span>
            <span>바코드</span>
          </div>

          {combos.map((options) => {
            const key = comboKey(options, axisNames)
            const label = axisNames.map((n) => options[n]).join(' / ') || '옵션 없음'
            const d = draftOf(key)

            return (
              <div
                key={key}
                className={`border-border-base grid grid-cols-2 gap-2 rounded-lg border p-3 sm:items-center sm:rounded-none sm:border-0 sm:border-b sm:p-0 sm:pb-3 ${GRID}`}
              >
                <div className="text-ink col-span-2 text-sm font-medium sm:col-span-1 sm:truncate">
                  {label}
                </div>

                <Cell label="판매가">
                  <NumberInput
                    aria-label={`${label} 판매가`}
                    placeholder="0"
                    value={d.salePrice}
                    onChange={(e) => setDraft(key, { salePrice: e.target.value })}
                  />
                </Cell>
                <Cell label="원가">
                  <NumberInput
                    aria-label={`${label} 원가`}
                    placeholder="0"
                    value={d.unitCost}
                    onChange={(e) => setDraft(key, { unitCost: e.target.value })}
                  />
                </Cell>
                <Cell label="기초수량">
                  <NumberInput
                    aria-label={`${label} 기초수량`}
                    placeholder="0"
                    value={d.qty}
                    onChange={(e) => setDraft(key, { qty: e.target.value })}
                  />
                </Cell>
                <Cell label="최소재고">
                  <NumberInput
                    aria-label={`${label} 최소재고`}
                    value={d.threshold}
                    onChange={(e) => setDraft(key, { threshold: e.target.value })}
                  />
                </Cell>
                <div className="col-span-2 sm:col-span-1">
                  <Cell label="바코드">
                    <Input
                      aria-label={`${label} 바코드`}
                      placeholder="선택"
                      inputMode="numeric"
                      autoComplete="off"
                      value={d.barcode}
                      onChange={(e) => setDraft(key, { barcode: e.target.value })}
                      maxLength={64}
                    />
                  </Cell>
                </div>
              </div>
            )
          })}

          <p className="text-ink-muted text-sm leading-relaxed">
            기초수량을 넣으면 입고 전표로 기록됩니다. 원가는 그 입고 단가가 되고,
            이후 입고가 쌓이면 이동평균으로 갱신됩니다.
          </p>
        </CardBody>
      </Card>

      <p aria-live="polite" className="min-h-5 text-sm">
        {state?.error ? <span className="text-danger">{state.error}</span> : null}
      </p>

      <Button type="submit" size="lg" full disabled={!canSubmit}>
        {pending ? '등록 중…' : '등록'}
      </Button>
    </form>
  )
}
