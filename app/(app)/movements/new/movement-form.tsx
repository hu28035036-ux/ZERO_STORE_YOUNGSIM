'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, NumberInput, Select } from '@/components/ui/field'
import { cn } from '@/lib/cn'
import { formatQty, formatWon, MOVEMENT_LABEL, todayInSeoul } from '@/lib/constants'
import type { MovementType } from '@/lib/constants'

import { recordMovement, type MovementState } from '../actions'
import { ENTRY_TYPES } from '../query'

export type VariantTarget = {
  variantId: string
  productName: string
  optionLabel: string | null
  stockQty: number
  costPrice: number
}

export type SupplierOption = { id: string; name: string }

/** 종류마다 수량 칸이 뜻하는 게 다르다. 라벨을 바꿔서 헷갈리지 않게 한다. */
const QTY_LABEL: Record<MovementType, string> = {
  purchase: '입고 수량',
  outbound: '출고 수량',
  adjustment: '조정 수량',
  stocktake: '실제로 센 수량',
  sale: '수량',
}

const HINT: Record<string, string> = {
  purchase: '단가를 넣으면 이동평균 원가가 다시 계산됩니다.',
  outbound: '폐기 · 증정 · 이동처럼 판매가 아닌 감소를 기록합니다.',
  adjustment: '이유를 알 수 없는 차이를 손으로 맞출 때 씁니다.',
  stocktake: '센 수량에 맞춰 재고를 덮어씁니다. 차이는 자동으로 계산됩니다.',
}

function toInt(value: string): number {
  const n = Number(value.replace(/[^\d]/g, ''))
  return Number.isFinite(n) ? n : 0
}

export function MovementForm({
  target,
  suppliers,
}: {
  target: VariantTarget
  suppliers: SupplierOption[]
}) {
  const [state, formAction, pending] = useActionState<MovementState, FormData>(
    recordMovement,
    null,
  )

  const [type, setType] = useState<MovementType>('purchase')
  const [qty, setQty] = useState('')
  const [direction, setDirection] = useState<'in' | 'out'>('out')
  const [unitCost, setUnitCost] = useState('')

  const n = toInt(qty)
  const today = todayInSeoul()

  // 등록하면 재고가 어떻게 되는지 미리 보여준다. 부호를 잘못 고른 것을
  // 저장하기 전에 알아차릴 수 있는 유일한 지점이다.
  const after =
    type === 'stocktake'
      ? n
      : type === 'purchase'
        ? target.stockQty + n
        : type === 'outbound'
          ? target.stockQty - n
          : direction === 'in'
            ? target.stockQty + n
            : target.stockQty - n

  return (
    <form action={formAction} className="flex flex-col gap-4 pb-4">
      <input type="hidden" name="variantId" value={target.variantId} />
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="direction" value={direction} />

      <Card>
        <CardHeader>
          <CardTitle>{target.productName}</CardTitle>
          <Link
            href="/movements/new"
            className="text-ink-muted hover:text-ink text-sm whitespace-nowrap"
          >
            다른 상품
          </Link>
        </CardHeader>
        <CardBody className="flex items-baseline justify-between gap-3">
          <div className="text-ink-muted text-sm">
            {target.optionLabel ? <span>{target.optionLabel} · </span> : null}
            <span data-numeric>원가 {formatWon(target.costPrice)}</span>
          </div>
          <div className="text-sm">
            <span className="text-ink-muted">현재 </span>
            <span className="text-ink font-medium" data-numeric>
              {formatQty(target.stockQty)}개
            </span>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>종류</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          {/* radiogroup 으로 만들어야 스크린리더가 "4개 중 1번째"로 읽는다. */}
          <div role="radiogroup" aria-label="입출고 종류" className="grid grid-cols-4 gap-2">
            {ENTRY_TYPES.map((t) => {
              const on = type === t
              return (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setType(t)}
                  className={cn(
                    'h-touch rounded-lg border text-sm font-medium transition-colors',
                    on
                      ? 'bg-primary text-primary-ink border-primary'
                      : 'bg-surface text-ink-muted border-border-strong hover:bg-surface-sunken',
                  )}
                >
                  {MOVEMENT_LABEL[t]}
                </button>
              )
            })}
          </div>
          <p className="text-ink-muted text-sm leading-relaxed">{HINT[type]}</p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>내용</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          {type === 'adjustment' ? (
            <div role="radiogroup" aria-label="조정 방향" className="grid grid-cols-2 gap-2">
              {(
                [
                  ['in', '늘리기 (+)'],
                  ['out', '줄이기 (−)'],
                ] as const
              ).map(([value, text]) => {
                const on = direction === value
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setDirection(value)}
                    className={cn(
                      'h-touch rounded-lg border text-sm font-medium transition-colors',
                      on
                        ? value === 'in'
                          ? 'bg-in-soft text-in border-in'
                          : 'bg-out-soft text-out border-out'
                        : 'bg-surface text-ink-muted border-border-strong hover:bg-surface-sunken',
                    )}
                  >
                    {text}
                  </button>
                )
              })}
            </div>
          ) : null}

          <NumberInput
            label={QTY_LABEL[type]}
            name="qty"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="0"
            required
            hint={
              type === 'stocktake'
                ? '0 도 넣을 수 있습니다 — 세어보니 없더라는 것도 기록입니다.'
                : undefined
            }
          />

          {type === 'purchase' ? (
            <>
              <NumberInput
                label="입고 단가"
                name="unitCost"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                placeholder="0"
                hint="비워두면 지금 원가를 그대로 씁니다."
              />
              <Select label="거래처" name="supplierId" defaultValue="">
                <option value="">선택 안 함</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </>
          ) : null}

          {type === 'stocktake' ? (
            <p className="text-ink-muted text-sm leading-relaxed">
              실사는 “지금 세었다”는 기록이라 언제나 오늘로 남습니다.
            </p>
          ) : (
            <Input
              label="발생일"
              name="date"
              type="date"
              defaultValue={today}
              max={today}
              hint="어제 들어온 물건을 오늘 넣을 때 바꾸세요."
            />
          )}

          <Input
            label="메모"
            name="note"
            placeholder="선택 입력"
            maxLength={200}
          />
        </CardBody>
      </Card>

      <Card className="flex items-baseline justify-between gap-3 px-4 py-3">
        <span className="text-ink-muted text-sm">등록하면</span>
        <span className="text-sm">
          <span className="text-ink-muted" data-numeric>
            {formatQty(target.stockQty)}개
          </span>
          <span className="text-ink-subtle"> → </span>
          <span
            className={cn(
              'font-semibold',
              after < 0 ? 'text-danger' : 'text-ink',
            )}
            data-numeric
          >
            {formatQty(after)}개
          </span>
        </span>
      </Card>

      {after < 0 ? (
        <p className="text-low text-sm">
          재고가 음수가 됩니다. 막지는 않지만 실사로 정리해야 할 신호입니다.
        </p>
      ) : null}

      <p aria-live="polite" className="min-h-5 text-sm">
        {state?.error ? <span className="text-danger">{state.error}</span> : null}
      </p>

      <Button
        type="submit"
        size="lg"
        full
        disabled={pending || (type !== 'stocktake' && n < 1)}
      >
        {pending ? '등록 중…' : `${MOVEMENT_LABEL[type]} 등록`}
      </Button>
    </form>
  )
}
