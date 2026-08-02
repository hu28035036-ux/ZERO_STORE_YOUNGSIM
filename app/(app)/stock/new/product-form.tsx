'use client'

import { useActionState, useMemo, useState } from 'react'
import { Camera, Plus, Trash2 } from 'lucide-react'

import { BarcodeScanner } from '@/components/scanner/barcode-scanner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, NumberInput } from '@/components/ui/field'
import { cn } from '@/lib/cn'
import { UNIT_SUGGESTIONS } from '@/lib/constants'

import { createProduct, type CreateProductState } from '../actions'
import { type CategoryOption } from '../categories'
import { CategorySelect } from '../category-select'
import { Cell, marginLine, toInt, toUnitValues, wonExact } from '../variant-fields'

type Axis = { id: number; name: string; raw: string }

type Draft = {
  salePrice: string
  unitCost: string
  qty: string
  pack: string
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

// 다섯째 칸(박스당 개수)이 "입수" 두 글자에 맞춰 좁았다. 라벨이 길어져서 넓힌다.
const GRID = 'sm:grid-cols-[1.5fr_1fr_1fr_0.8fr_1fr_1fr_1.4fr]'

export function ProductForm({
  categories,
  channels,
  defaultLowStock,
}: {
  categories: CategoryOption[]
  /** 기존 상품들이 쓰는 유통방식 값 — datalist 로 제안만 하고 새 값도 받는다 */
  channels: string[]
  defaultLowStock: number
}) {
  const [state, formAction, pending] = useActionState<CreateProductState, FormData>(
    createProduct,
    null,
  )

  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [channel, setChannel] = useState('')
  const [unit, setUnit] = useState('개')
  const [purchaseUnitName, setPurchaseUnitName] = useState('')
  const [posName, setPosName] = useState('')
  const [description, setDescription] = useState('')
  // 켜면 판매가·원가·기초수량 칸이 "박스당 값"이 된다. 저장 직전에 낱개로
  // 환산하므로 서버 계약은 그대로다 — 입수(≥2)가 있는 줄에만 적용된다.
  const [boxMode, setBoxMode] = useState(false)
  const [axes, setAxes] = useState<Axis[]>([])
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [bulk, setBulk] = useState({ salePrice: '', unitCost: '', threshold: '' })
  const [nextAxisId, setNextAxisId] = useState(1)
  // 변형이 여러 줄이라 "지금 어느 줄의 카메라를 열었는지"를 따로 기억해야 한다.
  // 이게 없으면 스캔 결과가 항상 첫 줄(또는 마지막에 렌더된 줄)로 들어간다.
  const [scanningKey, setScanningKey] = useState<string | null>(null)

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
      pack: '',
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
        channel: channel.trim() || null,
        unit: unit.trim() || '개',
        purchaseUnitName: purchaseUnitName.trim() || null,
        posName: posName.trim() || null,
        description: description.trim() || null,
        optionSchema: parsedAxes,
        variants: combos.map((options) => {
          const d = drafts[comboKey(options, axisNames)] ?? emptyDraft
          // 박스 기준 토글은 순수 UI 다. payload 는 언제나 낱개로 나간다.
          const u = toUnitValues(d, boxMode)
          return {
            options,
            sale_price: u.sale,
            initial_unit_cost: u.cost,
            initial_qty: u.qty,
            units_per_pack: toInt(d.pack),
            low_stock_threshold: toInt(d.threshold),
            barcode: d.barcode.trim() || null,
          }
        }),
      }),
    [name, categoryId, channel, unit, purchaseUnitName, posName, description, boxMode, parsedAxes, combos, axisNames, drafts, emptyDraft],
  )

  // 이름만 쓰고 값을 안 넣었거나 그 반대인 축은 조용히 무시된다.
  // 그대로 두면 "옵션을 넣었는데 변형이 하나뿐"인 상황이 되므로 짚어준다.
  const halfFilled = axes.some(
    (a) => (a.name.trim() !== '') !== (parseValues(a.raw).length > 0),
  )

  // 입수(≥2)가 있는 줄이 하나라도 있어야 박스 기준 입력이 성립한다.
  const hasPack = combos.some(
    (options) => toInt(draftOf(comboKey(options, axisNames)).pack) >= 2,
  )

  // 코드·DB·문서는 이 값을 "입수"(units_per_pack)라 부르지만 화면에는 안 쓴다.
  // 사용자가 입수를 "갖고 있는 박스 수"로 읽고 2 를 넣은 사고가 있었다.
  const packName = purchaseUnitName.trim() || '박스'
  const packLabel = `${packName}당 개수`

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
          <CategorySelect
            categories={categories}
            value={categoryId}
            onChange={setCategoryId}
          />
          {/* select 가 아니라 datalist 다 — 유통방식은 정해진 목록이 아니라
              본사 사정으로 언제든 새 값이 생기는 말이라, 제안은 하되 자유
              입력을 막으면 안 된다. */}
          <Input
            label="유통방식"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            placeholder="예: CJFW, 택배, 쿠팡"
            maxLength={30}
            list="channel-options"
            hint="어디서 들어오는 상품인지. 새 값을 적으면 그대로 만들어집니다."
          />
          <datalist id="channel-options">
            {channels.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          {/* 매장 POS 가 발주 시트와 다른 이름을 쓰는 상품이 22% 다. 여기 채우면
              재고 검색이 두 이름을 다 훑는다 — 안 채우면 발주명으로만 찾힌다. */}
          <Input
            label="POS 메뉴명"
            value={posName}
            onChange={(e) => setPosName(e.target.value)}
            placeholder="예: 라라스윗) 저당 카라멜 팝콘"
            maxLength={120}
            hint="매장 POS 에 등록된 이름. 발주 시트와 다를 때만 채우면 됩니다"
          />
          <div className="grid grid-cols-2 gap-3">
            {/* 여기도 datalist — 단위는 정해진 목록이 아니라 자유 입력이고,
                추천은 고르기 편하라고만 있다. DB 에는 친 글자 그대로 간다. */}
            <Input
              label="단위 (세는 말)"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="개"
              maxLength={10}
              list="unit-suggestions"
              hint="재고를 세는 말. 예: 개·병·봉지"
            />
            <Input
              label="묶음 이름 (선택)"
              value={purchaseUnitName}
              onChange={(e) => setPurchaseUnitName(e.target.value)}
              placeholder="박스"
              maxLength={10}
              hint={`${packName}로 사 오면 넣으세요. ${packLabel}는 아래 줄에 있습니다.`}
            />
          </div>
          <datalist id="unit-suggestions">
            {UNIT_SUGGESTIONS.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
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
          {hasPack ? (
            <button
              type="button"
              role="switch"
              aria-checked={boxMode}
              onClick={() => setBoxMode((v) => !v)}
              className={cn(
                'h-9 rounded-lg border px-3 text-sm font-medium transition-colors',
                boxMode
                  ? 'bg-primary text-primary-ink border-primary'
                  : 'bg-surface text-ink-muted border-border-strong hover:bg-surface-sunken',
              )}
            >
              {packName} 기준으로 입력
            </button>
          ) : null}
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          {/* 이 안내는 조건 없이 늘 보인다. 뜻을 오해한 사람은 자기가 오해했다는
              걸 모르므로, 박스를 쓸 때만 보여주면 정작 필요한 사람이 못 본다. */}
          <p className="text-ink-muted text-sm leading-relaxed">
            {packLabel}는 {packName} 하나에 낱개가 몇 개 들었는지입니다 (예: 24).
            갖고 있는 {packName} 수가 아닙니다 — 낱개로만 사 오면 비워두세요.
          </p>
          {boxMode && hasPack ? (
            <p className="text-ink-muted text-sm leading-relaxed">
              판매가·원가·기초수량을 {packName}당 값으로 적으세요. 저장은 낱개로
              환산해서 됩니다 — 줄 아래에 환산 결과가 보입니다. {packLabel}가 없는
              줄은 낱개 그대로입니다.
            </p>
          ) : null}
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
            <span>{packLabel}</span>
            <span>최소재고</span>
            <span>바코드</span>
          </div>

          {combos.map((options) => {
            const key = comboKey(options, axisNames)
            const label = axisNames.map((n) => options[n]).join(' / ') || '옵션 없음'
            const d = draftOf(key)

            // 저장될 낱개 값 그대로 계산해서 보여준다 — payload 와 같은 함수를
            // 쓰므로 미리보기와 저장이 어긋날 수 없다.
            const u = toUnitValues(d, boxMode)
            const m = marginLine(u.sale, u.cost)
            const rowNote = u.converted
              ? `낱개 ${wonExact(u.sale)} · 원가 ${wonExact(u.cost)} · ${u.qty}${unit.trim() || '개'}${m ? ` — ${m.text}` : ''}`
              : m?.text
            const rowNegative = m?.negative ?? false

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
                <Cell label={packLabel}>
                  <NumberInput
                    aria-label={`${label} ${packLabel}`}
                    placeholder="선택"
                    value={d.pack}
                    onChange={(e) => setDraft(key, { pack: e.target.value })}
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
                    {/* min-w-0 이 없으면 flex 아이템의 기본 최소폭이 콘텐츠 크기라
                        카메라 버튼이 좁은 화면에서 칸을 밀어내 잘린다(커밋 ac46d4b
                        와 같은 종류의 사고) — Input 만 줄어들고 버튼은 shrink-0 로
                        고정폭을 지키게 한다. */}
                    <div className="flex items-center gap-1.5">
                      <Input
                        aria-label={`${label} 바코드`}
                        placeholder="선택"
                        inputMode="numeric"
                        autoComplete="off"
                        value={d.barcode}
                        onChange={(e) => setDraft(key, { barcode: e.target.value })}
                        maxLength={64}
                        className="min-w-0 flex-1"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        aria-label={`${label} 바코드 카메라로 스캔`}
                        onClick={() => setScanningKey(key)}
                        className="shrink-0"
                      >
                        <Camera size={16} aria-hidden />
                      </Button>
                    </div>
                  </Cell>
                </div>

                {rowNote ? (
                  <p
                    className={cn(
                      'col-span-2 -mt-1 text-xs sm:col-span-full',
                      rowNegative ? 'text-danger' : 'text-ink-muted',
                    )}
                    data-numeric
                  >
                    {rowNote}
                  </p>
                ) : null}
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

      {/* scanningKey 가 null 이 아닌 동안만 뜬다. onDetect 는 렌더마다 새로 만들어지지만
          BarcodeScanner 내부에서 항상 최신 콜백을 ref 로 읽으므로 scanningKey 가 바뀐
          뒤에도 그 줄을 놓치지 않는다.

          truthiness(`if (scanningKey)`)가 아니라 반드시 `!== null` 로 봐야 한다 —
          옵션이 없는 상품(이 화면의 기본값)은 comboKey 가 [].join() 으로 빈
          문자열을 돌려주고, 그 빈 문자열도 유효한 키다. truthiness 검사면 ''
          가 falsy 라 가장 흔한 경우(옵션 없음)에서 스캔값이 조용히 버려진다. */}
      <BarcodeScanner
        open={scanningKey !== null}
        onDetect={(code) => {
          if (scanningKey !== null) setDraft(scanningKey, { barcode: code })
        }}
        onClose={() => setScanningKey(null)}
      />
    </form>
  )
}
