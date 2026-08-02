'use client'

import { useMemo, useState } from 'react'
import { useActionState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, NumberInput } from '@/components/ui/field'
import { cn } from '@/lib/cn'
import { formatQty, UNIT_SUGGESTIONS } from '@/lib/constants'
import type { ActionState } from '@/lib/action-state'

import { updateProduct } from '../../actions'
import { type CategoryOption } from '../../categories'
import { CategorySelect } from '../../category-select'
import { Cell, marginLine, toCost, toInt } from '../../variant-fields'

export type EditVariant = {
  variantId: string
  label: string
  salePrice: string
  costPrice: string
  qty: string
  lowStockThreshold: string
  unitsPerPack: string
  barcode: string
  /** 불러온 시점의 재고. qty 가 여기서 안 바뀐 줄은 실사를 보내지 않는다. */
  stockQty: number
}

// 여섯째 칸(박스당 개수)이 "입수" 두 글자에 맞춰 좁았다. 라벨이 길어져서 넓힌다.
const GRID = 'sm:grid-cols-[1.2fr_1fr_1fr_0.8fr_0.8fr_1fr_1.2fr]'

export function EditProductForm({
  productId,
  initialName,
  initialCategoryId,
  initialChannel,
  initialUnit,
  initialPurchaseUnitName,
  initialPosName,
  initialDescription,
  categories,
  channels,
  initialVariants,
}: {
  productId: string
  initialName: string
  initialCategoryId: string
  initialChannel: string
  initialUnit: string
  initialPurchaseUnitName: string
  initialPosName: string
  initialDescription: string
  categories: CategoryOption[]
  /** 기존 상품들이 쓰는 유통방식 값 — datalist 로 제안만 하고 새 값도 받는다 */
  channels: string[]
  initialVariants: EditVariant[]
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updateProduct,
    null,
  )

  const [name, setName] = useState(initialName)
  const [categoryId, setCategoryId] = useState(initialCategoryId)
  const [channel, setChannel] = useState(initialChannel)
  const [unit, setUnit] = useState(initialUnit)
  const [purchaseUnitName, setPurchaseUnitName] = useState(initialPurchaseUnitName)
  const [posName, setPosName] = useState(initialPosName)
  const [description, setDescription] = useState(initialDescription)
  const [variants, setVariants] = useState<EditVariant[]>(initialVariants)
  // 환산 도우미는 한 번만. 두 번 누르면 두 번 나뉜다 — 값이 이미 낱개인데
  // 또 나누는 사고를 버튼 비활성화로 막는다 (되돌리려면 새로고침).
  const [converted, setConverted] = useState(false)

  function setVariant(variantId: string, patch: Partial<EditVariant>) {
    setVariants((prev) =>
      prev.map((v) => (v.variantId === variantId ? { ...v, ...patch } : v)),
    )
  }

  const unitLabel = unit.trim() || '개'
  const packName = purchaseUnitName.trim() || '박스'
  // 코드·DB·문서는 이 값을 "입수"(units_per_pack)라 부르지만 화면에는 안 쓴다.
  // 사용자가 입수를 "갖고 있는 박스 수"로 읽고 2 를 넣은 사고가 있었다.
  const packLabel = `${packName}당 개수`

  // 입수(≥2)가 있는 줄이 하나라도 있어야 환산이 성립한다.
  const canConvert = variants.some((v) => toInt(v.unitsPerPack) >= 2)

  /**
   * 박스 값을 낱개로 — 폼 값만 바꾼다. 저장 버튼을 누르기 전까지 DB 에는
   * 아무것도 안 닿는다. 사람이 환산 결과를 눈으로 확인하고 저장한다.
   * 입수 없는 줄(낱개 기준으로 들어온 상품)은 건드리지 않는다.
   */
  function convertToUnit() {
    setVariants((prev) =>
      prev.map((v) => {
        const pack = toInt(v.unitsPerPack)
        if (pack < 2) return v
        return {
          ...v,
          qty: String(toInt(v.qty) * pack),
          salePrice: String(Math.round(toInt(v.salePrice) / pack)),
          costPrice: String(Math.round((toCost(v.costPrice) / pack) * 100) / 100),
        }
      }),
    )
    setConverted(true)
  }

  // 옵션 축이 동적이라 폼 필드로 펼치는 대신 JSON 한 덩이로 보낸다.
  // 검증은 서버의 zod 와 DB 제약이 다시 한다.
  const payload = useMemo(
    () =>
      JSON.stringify({
        productId,
        name,
        categoryId: categoryId || null,
        channel: channel.trim() || null,
        unit: unit.trim() || '개',
        purchaseUnitName: purchaseUnitName.trim() || null,
        posName: posName.trim() || null,
        description: description.trim() || null,
        variants: variants.map((v) => ({
          variantId: v.variantId,
          salePrice: toInt(v.salePrice),
          costPrice: toCost(v.costPrice),
          // 안 바뀐 줄은 null — RPC 의 멱등 조건(같은 값이면 전표 없음)과
          // 이중 방어다. 실사는 정말 수량을 고친 줄에만 남아야 한다.
          countedQty: toInt(v.qty) === v.stockQty ? null : toInt(v.qty),
          lowStockThreshold: toInt(v.lowStockThreshold),
          unitsPerPack: toInt(v.unitsPerPack),
          barcode: v.barcode.trim() || null,
        })),
      }),
    [
      productId,
      name,
      categoryId,
      channel,
      unit,
      purchaseUnitName,
      posName,
      description,
      variants,
    ],
  )

  return (
    <form action={formAction} className="flex flex-col gap-4 pb-4">
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
          />
          <datalist id="channel-options">
            {channels.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          {/* 매장 POS 의 메뉴명. 발주 시트 이름과 실질적으로 다른 상품이 22% 라
              (브랜드가 바뀐 것도 있다 — 킬로리 얌얌쉐이크 ↔ 데일리얌) 한쪽만
              저장하면 발주할 때와 매장에서 찾을 때 서로 다른 말을 쓰게 된다.
              여기 채우면 재고 검색이 이 이름으로도 걸린다. */}
          <Input
            label="POS 메뉴명"
            value={posName}
            onChange={(e) => setPosName(e.target.value)}
            placeholder="예: 라라스윗) 저당 카라멜 팝콘"
            maxLength={120}
            hint="매장 POS 에 등록된 이름. 발주 시트와 다를 때만 채우면 됩니다"
          />
          <div className="grid grid-cols-2 gap-3">
            {/* 단위도 datalist — 자유 입력이고 추천은 고르기 편하라고만 있다. */}
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
              hint={`${packName}로 사 오면. ${packLabel}는 아래 줄에 있습니다.`}
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
          <CardTitle>재고 단위 {variants.length}개</CardTitle>
          {canConvert ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={converted}
              onClick={convertToUnit}
            >
              {packName} 값을 낱개로 환산
            </Button>
          ) : null}
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          {converted ? (
            <p className="text-in text-sm">
              환산했습니다. 값을 확인하고 저장하세요. (되돌리려면 새로고침)
            </p>
          ) : canConvert ? (
            <p className="text-ink-muted text-sm leading-relaxed">
              판매가·원가가 {packName}당 값으로 들어와 있으면 위 버튼이 수량
              ×{packLabel}, 가격 ÷{packLabel}로 바꿔 줍니다. 저장 전까지
              반영되지 않습니다. 값이 이미 낱개면 누르지 마세요.
            </p>
          ) : null}

          {/* 이 안내는 조건 없이 늘 보인다. 뜻을 오해한 사람은 자기가 오해했다는
              걸 모르므로, 박스를 쓸 때만 보여주면 정작 필요한 사람이 못 본다. */}
          <p className="text-ink-muted text-sm leading-relaxed">
            {packLabel}는 {packName} 하나에 낱개가 몇 개 들었는지입니다 (예: 24).
            갖고 있는 {packName} 수가 아닙니다 — 낱개로만 사 오면 비워두세요.
            이 값을 고쳐도 수량은 바뀌지 않습니다.
          </p>

          <div
            className={`text-ink-muted hidden gap-2 px-1 text-xs sm:grid ${GRID}`}
            aria-hidden
          >
            <span>옵션</span>
            <span>판매가</span>
            <span>원가</span>
            <span>수량</span>
            <span>최소재고</span>
            <span>{packLabel}</span>
            <span>바코드</span>
          </div>

          {variants.map((v) => {
            const m = marginLine(toInt(v.salePrice), toCost(v.costPrice))
            const qtyChanged = toInt(v.qty) !== v.stockQty
            const note = [
              m?.text,
              qtyChanged
                ? `수량 ${formatQty(v.stockQty)} → ${formatQty(toInt(v.qty))}${unitLabel} (저장하면 실사로 기록)`
                : null,
            ]
              .filter(Boolean)
              .join(' · ')

            return (
              <div
                key={v.variantId}
                className={`border-border-base grid grid-cols-2 gap-2 rounded-lg border p-3 sm:items-center sm:rounded-none sm:border-0 sm:border-b sm:p-0 sm:pb-3 ${GRID}`}
              >
                <div className="text-ink col-span-2 text-sm font-medium sm:col-span-1 sm:truncate">
                  {v.label}
                </div>

                <Cell label="판매가">
                  <NumberInput
                    aria-label={`${v.label} 판매가`}
                    value={v.salePrice}
                    onChange={(e) =>
                      setVariant(v.variantId, { salePrice: e.target.value })
                    }
                  />
                </Cell>
                <Cell label="원가">
                  <NumberInput
                    aria-label={`${v.label} 원가`}
                    value={v.costPrice}
                    onChange={(e) =>
                      setVariant(v.variantId, { costPrice: e.target.value })
                    }
                  />
                </Cell>
                <Cell label={`수량 (${unitLabel})`}>
                  <NumberInput
                    aria-label={`${v.label} 수량`}
                    value={v.qty}
                    onChange={(e) => setVariant(v.variantId, { qty: e.target.value })}
                  />
                </Cell>
                <Cell label="최소재고">
                  <NumberInput
                    aria-label={`${v.label} 최소재고`}
                    value={v.lowStockThreshold}
                    onChange={(e) =>
                      setVariant(v.variantId, { lowStockThreshold: e.target.value })
                    }
                  />
                </Cell>
                <Cell label={packLabel}>
                  <NumberInput
                    aria-label={`${v.label} ${packLabel}`}
                    placeholder="선택"
                    value={v.unitsPerPack}
                    onChange={(e) =>
                      setVariant(v.variantId, { unitsPerPack: e.target.value })
                    }
                  />
                </Cell>
                <div className="col-span-2 sm:col-span-1">
                  <Cell label="바코드">
                    <Input
                      aria-label={`${v.label} 바코드`}
                      placeholder="선택"
                      inputMode="numeric"
                      autoComplete="off"
                      value={v.barcode}
                      onChange={(e) =>
                        setVariant(v.variantId, { barcode: e.target.value })
                      }
                      maxLength={64}
                    />
                  </Cell>
                </div>

                {note ? (
                  <p
                    className={cn(
                      'col-span-2 -mt-1 text-xs sm:col-span-full',
                      m?.negative ? 'text-danger' : 'text-ink-muted',
                    )}
                    data-numeric
                  >
                    {note}
                  </p>
                ) : null}
              </div>
            )
          })}

          <p className="text-ink-muted text-sm leading-relaxed">
            수량을 바꾸면 실사로 기록됩니다 — 언제 얼마로 맞췄는지 입출고 내역에
            남습니다. 원가를 고치는 것은 입고와 무관한 수동 정정입니다. 지난
            판매의 마진은 바뀌지 않고, 다음 입고부터 이 값 기준으로 이동평균이
            다시 계산됩니다.
          </p>
          <p className="text-ink-subtle text-sm leading-relaxed">
            옵션 축과 재고 단위 개수는 이 화면에서 바뀌지 않습니다.
          </p>
        </CardBody>
      </Card>

      <p aria-live="polite" className="min-h-5 text-sm">
        {state?.status === 'error' ? (
          <span className="text-danger">{state.message}</span>
        ) : state?.status === 'ok' ? (
          <span className="text-in">{state.message}</span>
        ) : null}
      </p>

      <Button type="submit" size="lg" full disabled={pending || !name.trim()}>
        {pending ? '저장 중…' : '저장'}
      </Button>
    </form>
  )
}
