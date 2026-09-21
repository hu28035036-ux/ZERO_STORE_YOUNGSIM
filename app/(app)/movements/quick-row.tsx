'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useActionState, useEffect, useRef, useState } from 'react'

import { StockBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { NumberInput } from '@/components/ui/field'
import { cn } from '@/lib/cn'
import { formatQty, formatWon, MOVEMENT_LABEL } from '@/lib/constants'

import { quickMovement, type QuickState } from './actions'

/**
 * 검색 결과 한 줄에서 바로 등록하는 빠른 폼.
 *
 * 원래는 줄을 눌러 상품별 폼으로 들어가야 했는데, 여러 상품의 수량을 연달아
 * 손보는 사람은 그 왕복(목록 → 폼 → 등록 → 목록)이 상품 수만큼 반복된다 —
 * 사용자가 "하나하나 들어가서 고쳐야 한다"고 리포트한 지점이다. 단가·거래처·
 * 박스·날짜가 필요한 등록은 여전히 "자세히"로 들어간다.
 */

const QUICK_TYPES = ['purchase', 'outbound', 'stocktake'] as const
type QuickType = (typeof QUICK_TYPES)[number]

export type QuickTarget = {
  variantId: string
  productName: string
  optionLabel: string | null
  stockQty: number
  threshold: number
  salePrice: number
  unit: string
}

function toInt(value: string): number {
  const n = Number(value.replace(/[^\d]/g, ''))
  return Number.isFinite(n) ? n : 0
}

export function QuickRow({
  target,
  autoFocus = false,
  pinned = false,
  onTogglePin,
  onApplied,
}: {
  target: QuickTarget
  /** 검색 결과가 이 한 건뿐일 때(스캔 직후 등) 수량 칸에 바로 커서를 준다 */
  autoFocus?: boolean
  /** 체크하면 다음 검색에도 목록 위에 남는다 (quick-list.tsx 가 들고 있다) */
  pinned?: boolean
  onTogglePin?: () => void
  /** 등록 성공 시 잔여 재고 통지 — 고정 줄의 스냅샷을 최신으로 유지한다 */
  onApplied?: (after: number) => void
}) {
  const [type, setType] = useState<QuickType>('purchase')
  const [qty, setQty] = useState('')
  const [state, formAction, pending] = useActionState<QuickState, FormData>(
    quickMovement,
    null,
  )

  const router = useRouter()
  // 같은 state 로 리렌더될 때 두 번 비우지 않기 위한 표식 (판매 적기와 같은 패턴)
  const doneRef = useRef<QuickState>(null)

  useEffect(() => {
    if (state && 'ok' in state && doneRef.current !== state) {
      doneRef.current = state
      setQty('')
      onApplied?.(state.after)
      // 서버 목록을 다시 받아 재고 배지가 방금 등록을 반영하게 한다
      router.refresh()
    }
  }, [state, router, onApplied])

  const n = toInt(qty)
  const filled = qty.trim() !== ''
  const after =
    type === 'stocktake'
      ? n
      : type === 'purchase'
        ? target.stockQty + n
        : target.stockQty - n

  // 실사만 0 이 뜻을 갖는다 ("세어보니 없더라").
  const canSubmit = !pending && filled && (type === 'stocktake' || n >= 1)
  const unitLabel = target.unit || '개'

  return (
    <Card className="flex flex-col gap-4 p-5">
      {/* 머리: 상품 · 재고 배지. 고정/자세히는 아래 줄로 내려 이름 칸이 넓다 —
          긴 상품명이 한 줄에 다 보여야 스캔 직후 "이 상품 맞나"를 바로 안다. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-ink text-base leading-snug font-semibold">{target.productName}</p>
          <p className="text-ink-muted mt-0.5 text-sm">
            {target.optionLabel ? `${target.optionLabel} · ` : ''}
            {formatWon(target.salePrice)}
          </p>
        </div>
        <div className="shrink-0 pt-0.5">
          <StockBadge qty={target.stockQty} threshold={target.threshold} unit={target.unit} />
        </div>
      </div>

      <form action={formAction} className="flex flex-col gap-3">
        <input type="hidden" name="variantId" value={target.variantId} />
        <input type="hidden" name="type" value={type} />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* 종류 선택은 세그먼트 컨트롤. 버튼 세 개가 각자 테두리를 가지면 "어느
              것이 켜졌나"보다 "버튼이 셋"이 먼저 보인다. 홈통 하나에 선택만 흰
              칸으로 띄우는 편이 한눈에 읽힌다. */}
          <div
            role="radiogroup"
            aria-label="종류"
            className="bg-surface-sunken flex shrink-0 rounded-xl p-1"
          >
            {QUICK_TYPES.map((t) => {
              const on = type === t
              return (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setType(t)}
                  className={cn(
                    'h-10 min-w-[4.25rem] flex-1 rounded-lg px-3 text-sm font-medium transition-[background-color,color,transform] duration-150 select-none active:scale-[0.97]',
                    on
                      ? 'bg-surface text-primary shadow-sm font-semibold'
                      : 'text-ink-muted hover:text-ink',
                  )}
                >
                  {MOVEMENT_LABEL[t]}
                </button>
              )
            })}
          </div>

          <div className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-md">
            <NumberInput
              name="qty"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder={type === 'stocktake' ? '센 수량' : '수량'}
              aria-label={`${target.productName} ${MOVEMENT_LABEL[type]} 수량`}
              autoFocus={autoFocus}
              className="bg-surface-sunken focus:bg-surface h-12 min-w-0 flex-1 rounded-xl border-transparent text-lg font-semibold sm:w-40"
            />
            <Button
              type="submit"
              size="lg"
              disabled={!canSubmit}
              className="h-12 shrink-0 rounded-xl px-6"
            >
              {pending ? '등록 중…' : '등록'}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {/* 미리보기·결과가 같은 자리를 쓴다 — 줄이 아래로 덜컹거리지 않게 높이를 잡아둔다 */}
          <p aria-live="polite" className="min-h-5 text-sm">
            {state && 'error' in state ? (
              <span className="text-danger">{state.error}</span>
            ) : filled && (type === 'stocktake' || n >= 1) ? (
              <>
                <span className="text-ink-muted" data-numeric>
                  {formatQty(target.stockQty)}
                  {unitLabel}
                </span>
                <span className="text-ink-subtle"> → </span>
                <span
                  className={cn('font-semibold', after < 0 ? 'text-danger' : 'text-ink')}
                  data-numeric
                >
                  {formatQty(after)}
                  {unitLabel}
                </span>
                {after < 0 ? (
                  <span className="text-low ml-2">재고가 음수가 됩니다</span>
                ) : null}
              </>
            ) : state && 'ok' in state ? (
              <span className="text-in">
                반영됐습니다 — 현재{' '}
                <span data-numeric>
                  {formatQty(state.after)}
                  {unitLabel}
                </span>
              </span>
            ) : (
              <span className="text-ink-subtle">
                {type === 'stocktake' ? '실제로 센 수량을 넣으세요' : '수량을 넣으면 등록할 수 있어요'}
              </span>
            )}
          </p>

          <div className="flex shrink-0 items-center gap-1">
            {onTogglePin ? (
              // 검색할 때마다 결과가 바뀌어 이전에 보던 상품이 사라진다는 리포트.
              // 체크한 줄은 quick-list 가 sessionStorage 에 들고 있어 안 사라진다.
              <label
                className={cn(
                  'flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-sm select-none transition-colors',
                  pinned
                    ? 'bg-primary-soft text-primary font-medium'
                    : 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
                )}
              >
                <input
                  type="checkbox"
                  checked={pinned}
                  onChange={onTogglePin}
                  className="accent-primary size-4"
                />
                고정
              </label>
            ) : null}
            <Link
              href={`/movements?variant=${target.variantId}`}
              className="text-ink-muted hover:bg-surface-sunken hover:text-ink flex h-9 items-center rounded-lg px-2.5 text-sm whitespace-nowrap transition-colors"
            >
              자세히
            </Link>
          </div>
        </div>
      </form>
    </Card>
  )
}
