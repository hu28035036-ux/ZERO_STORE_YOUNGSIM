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
    <Card className="px-4 py-3">
      {/* 한 줄 배치: 상품 · 종류 토글 · 수량 · 등록. 세로로 쌓으면 한 화면에 세 품목이
          겨우 들어와서, 연달아 여러 상품을 손보는 사람이 계속 스크롤하게 된다. 좁은
          화면(모바일)에서는 자연스럽게 두 줄로 접힌다. */}
      <form action={formAction} className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <input type="hidden" name="variantId" value={target.variantId} />
        <input type="hidden" name="type" value={type} />

        <div className="flex min-w-[14rem] flex-1 items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-ink truncate text-[0.9375rem] leading-snug font-semibold">
              {target.productName}
            </p>
            <p className="text-ink-muted truncate text-xs">
              {target.optionLabel ? `${target.optionLabel} · ` : ''}
              {formatWon(target.salePrice)}
            </p>
          </div>
          <div className="shrink-0">
            <StockBadge qty={target.stockQty} threshold={target.threshold} unit={target.unit} />
          </div>
        </div>

        {/* 좁은 화면에서는 이 묶음이 줄바꿈된다 — 고정·자세히가 다음 줄로 내려간다.
            shrink-0 으로 고정하면 390px 에서 오른쪽으로 잘려 나갔다. */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 종류 선택은 세그먼트 컨트롤. 버튼 세 개가 각자 테두리를 가지면 "어느
              것이 켜졌나"보다 "버튼이 셋"이 먼저 보인다. */}
          <div
            role="radiogroup"
            aria-label="종류"
            className="bg-surface-sunken flex shrink-0 rounded-lg p-0.5"
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
                    'h-9 min-w-[3.5rem] rounded-md px-2.5 text-sm font-medium transition-[background-color,color,transform] duration-150 select-none active:scale-[0.97]',
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

          <NumberInput
            name="qty"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder={type === 'stocktake' ? '센 수량' : '수량'}
            aria-label={`${target.productName} ${MOVEMENT_LABEL[type]} 수량`}
            autoFocus={autoFocus}
            className="bg-surface-sunken focus:bg-surface h-10 w-20 min-w-0 rounded-lg border-transparent font-semibold sm:w-24"
          />
          <Button
            type="submit"
            size="sm"
            disabled={!canSubmit}
            className="h-10 shrink-0 rounded-lg px-4"
          >
            {pending ? '등록 중…' : '등록'}
          </Button>

          <div className="flex items-center">
            {onTogglePin ? (
              // 체크한 줄은 quick-list 가 sessionStorage 에 들고 있어 검색해도 안 사라진다.
              <label
                className={cn(
                  'flex h-9 cursor-pointer items-center gap-1 rounded-md px-2 text-xs select-none transition-colors',
                  pinned
                    ? 'bg-primary-soft text-primary font-medium'
                    : 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
                )}
              >
                <input
                  type="checkbox"
                  checked={pinned}
                  onChange={onTogglePin}
                  className="accent-primary size-3.5"
                />
                고정
              </label>
            ) : null}
            <Link
              href={`/movements?variant=${target.variantId}`}
              className="text-ink-muted hover:bg-surface-sunken hover:text-ink flex h-9 items-center rounded-md px-2 text-xs whitespace-nowrap transition-colors"
            >
              자세히
            </Link>
          </div>
        </div>

        {/* 미리보기·결과·오류는 값이 있을 때만 한 줄 더 쓴다 — 평소엔 카드가 한 줄이다. */}
        {state && 'error' in state ? (
          <p aria-live="polite" className="text-danger w-full text-xs">
            {state.error}
          </p>
        ) : filled && (type === 'stocktake' || n >= 1) ? (
          <p aria-live="polite" className="w-full text-xs">
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
            {after < 0 ? <span className="text-low ml-2">재고가 음수가 됩니다</span> : null}
          </p>
        ) : state && 'ok' in state ? (
          <p aria-live="polite" className="text-in w-full text-xs">
            반영됐습니다 — 현재{' '}
            <span data-numeric>
              {formatQty(state.after)}
              {unitLabel}
            </span>
          </p>
        ) : null}
      </form>
    </Card>
  )
}
