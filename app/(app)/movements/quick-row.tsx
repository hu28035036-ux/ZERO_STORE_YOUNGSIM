'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useActionState, useEffect, useRef, useState } from 'react'
import { CalendarDays } from 'lucide-react'

import { StockBadge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { NumberInput } from '@/components/ui/field'
import { cn } from '@/lib/cn'
import { formatQty, formatWon, MOVEMENT_LABEL } from '@/lib/constants'

import { quickMovement, type QuickState } from './actions'
import { entryDateLabel, entryDateShort } from './entry-date'

/**
 * 검색 결과 한 줄에서 바로 등록하는 빠른 폼.
 *
 * 원래는 줄을 눌러 상품별 폼으로 들어가야 했는데, 여러 상품의 수량을 연달아
 * 손보는 사람은 그 왕복(목록 → 폼 → 등록 → 목록)이 상품 수만큼 반복된다 —
 * 사용자가 "하나하나 들어가서 고쳐야 한다"고 리포트한 지점이다. 지난 날짜는
 * 줄의 달력으로 상품마다 고르고(2026-09-27 사용자 요청 — 화면 공용 날짜 하나보다
 * 상품별이 낫다고 했다), 단가·거래처·박스가 필요한 등록은 여전히 "자세히"로 간다.
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
  today,
  autoFocus = false,
}: {
  target: QuickTarget
  /** 서버의 KST 오늘. 달력의 기본값이자 상한이다. */
  today: string
  /** 검색 결과가 이 한 건뿐일 때(스캔 직후 등) 수량 칸에 바로 커서를 준다 */
  autoFocus?: boolean
}) {
  const [type, setType] = useState<QuickType>('purchase')
  const [qty, setQty] = useState('')
  const [date, setDate] = useState(today)
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
      // 날짜도 오늘로 되돌린다. 날짜는 그 한 건의 것이다 — 남겨 두면 같은 상품의 다음
      // 등록(오늘 들어온 것)이 조용히 지난 날짜로 들어간다. 무엇으로 들어갔는지는
      // 아래 완료 문구가 서버가 돌려준 날짜로 말한다.
      setDate(today)
      // 서버 목록을 다시 받아 재고 배지가 방금 등록을 반영하게 한다
      router.refresh()
    }
  }, [state, router, today])

  const pastDate = date < today ? date : null

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
        {/* 오늘이면 아예 안 보낸다. 늘 보내면 자정을 넘겨 켜 둔 화면이 어제 날짜를
            실어 보내 오늘 등록이 조용히 어제로 들어간다. */}
        {pastDate ? <input type="hidden" name="date" value={pastDate} /> : null}

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

        {/* 좁은 화면에서는 이 묶음이 줄바꿈된다 — 자세히가 다음 줄로 내려간다.
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

          <RowDate
            date={date}
            today={today}
            // record_stocktake 에는 날짜 인자가 없다(actions.ts) — 실사는 늘 "지금 센 것"이다.
            disabled={type === 'stocktake'}
            onChange={(next) => setDate(next && next <= today ? next : today)}
          />

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

          <Link
            // 고른 날짜를 들고 간다 — 큰 폼의 발생일이 오늘로 돌아가 있으면 박스·단가를
            // 넣는 데 정신이 팔린 사이 그 한 건만 오늘로 들어간다.
            href={`/movements?variant=${target.variantId}${pastDate ? `&date=${pastDate}` : ''}`}
            className="text-ink-muted hover:bg-surface-sunken hover:text-ink flex h-9 items-center rounded-md px-2 text-xs whitespace-nowrap transition-colors"
          >
            자세히
          </Link>
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
            {pastDate ? (
              type === 'stocktake' ? (
                // 날짜를 골라 둔 채 실사로 바꾼 경우. 그 날로 안 들어간다는 걸 누르기 전에 말한다.
                <span className="text-ink-muted ml-2">실사는 오늘 날짜로 남습니다</span>
              ) : (
                <span className="text-primary ml-2">{entryDateLabel(pastDate)}로 등록</span>
              )
            ) : null}
          </p>
        ) : state && 'ok' in state ? (
          <p aria-live="polite" className="text-in w-full text-xs">
            {state.date ? `${entryDateLabel(state.date)}로 ` : ''}반영됐습니다 — 현재{' '}
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

/**
 * 줄의 달력 버튼. 오늘이면 아이콘만, 지난 날짜면 "9/26"을 붙이고 색을 바꾼다 —
 * 날짜를 바꿔 둔 줄이 한눈에 보여야 그 줄만 다른 날로 들어가는 걸 놓치지 않는다.
 *
 * 날짜 칸을 그대로 보이면 "2026-09-27" 폭이 한 줄을 넘겨서, 버튼만 보이고 진짜
 * date 입력칸은 그 밑에 투명하게 깔아 둔다. 누르면 showPicker() 로 브라우저의
 * 달력을 연다. display:none 으로 숨기면 브라우저에 따라 showPicker 가 안 먹고,
 * 달력은 입력칸 자리에 뜨므로 버튼과 같은 자리·크기로 깐다. showPicker 가 없는
 * 옛 브라우저에는 포커스라도 준다(옛 아이폰 사파리는 포커스로 달력을 띄운다 —
 * 실기기로는 확인 못 했다. 데스크톱 크롬에서 showPicker 가 불리는 것까지 봤다).
 */
function RowDate({
  date,
  today,
  disabled,
  onChange,
}: {
  date: string
  today: string
  disabled: boolean
  onChange: (next: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const past = date < today
  const label = past ? entryDateLabel(date) : '오늘'

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          const input = inputRef.current
          if (!input) return
          try {
            input.showPicker()
          } catch {
            input.focus()
          }
        }}
        aria-label={`등록 날짜 ${label}, 바꾸기`}
        title={disabled ? '실사는 오늘 날짜로만 남습니다' : `등록 날짜: ${label}`}
        className={cn(
          'flex h-10 items-center gap-1.5 rounded-lg px-2.5 text-sm transition-[background-color,color,transform] duration-150 select-none active:scale-[0.97]',
          past
            ? 'bg-primary-soft text-primary font-semibold'
            : 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
          'disabled:pointer-events-none disabled:opacity-45',
        )}
      >
        <CalendarDays size={18} aria-hidden />
        {past ? <span data-numeric>{entryDateShort(date)}</span> : null}
      </button>
      <input
        ref={inputRef}
        type="date"
        value={date}
        // max 는 달력이 지켜 주길 바라는 것일 뿐이다. 앞날짜가 들어와도 onChange
        // 쪽에서 오늘로 되돌린다 — 서버 액션도 앞날짜를 거부한다.
        max={today}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        tabIndex={-1}
        aria-hidden
        // text-base: 아이폰은 16px 보다 작은 입력칸에 포커스가 가면 화면을 확대한다.
        className="pointer-events-none absolute inset-0 h-full w-full text-base opacity-0"
      />
    </div>
  )
}
