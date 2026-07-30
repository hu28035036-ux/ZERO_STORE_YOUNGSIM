'use client'

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { Minus, Plus, ScanLine, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/field'
import { cn } from '@/lib/cn'
import { formatQty, formatWon } from '@/lib/constants'
import type { Device } from '@/lib/device'

import { findItems, recordSale, type FoundItem, type SaleState } from './actions'

type CartLine = {
  variantId: string
  productName: string
  optionLabel: string | null
  stockQty: number
  qty: number
  /** 문자열로 들고 있어야 지웠다 다시 칠 수 있다. 숫자로 두면 빈 칸이 0 이 된다. */
  priceText: string
}

function toInt(value: string): number {
  const n = Number(value.replace(/[^\d]/g, ''))
  return Number.isFinite(n) ? n : 0
}

/**
 * 합계 막대가 앉을 위치.
 *
 * 휴대폰 셸은 하단 탭이 fixed 라 sticky bottom-0 을 그냥 두면 그 아래로 숨는다.
 * 어느 셸이 그려졌는지는 서버가 UA 로 정하므로 화면 폭(lg:)으로는 맞출 수 없다.
 */
const STICKY: Record<Device, string> = {
  mobile: 'bottom-[calc(4.5rem+env(safe-area-inset-bottom))]',
  desktop: 'bottom-0',
}

export function SellTerminal({ device }: { device: Device }) {
  const [state, formAction, saving] = useActionState<SaleState, FormData>(
    recordSale,
    null,
  )

  const [cart, setCart] = useState<CartLine[]>([])
  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState<FoundItem[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [searching, startSearch] = useTransition()

  const scanRef = useRef<HTMLInputElement>(null)
  const doneRef = useRef<string | null>(null)

  // 판매가 성사되면 다음 손님을 받을 수 있게 비운다.
  // orderId 를 기억해 두는 이유는 같은 state 로 리렌더될 때 두 번 비우지 않기 위해서다.
  useEffect(() => {
    if (state?.status === 'done' && doneRef.current !== state.orderId) {
      doneRef.current = state.orderId
      setCart([])
      setCandidates([])
      setQuery('')
      setNotice(null)
      scanRef.current?.focus()
    }
  }, [state])

  function addItem(item: FoundItem) {
    setCart((prev) => {
      // 같은 것을 또 찍으면 줄을 늘리지 않고 수량을 올린다.
      const at = prev.findIndex((l) => l.variantId === item.variantId)
      if (at >= 0) {
        const next = [...prev]
        next[at] = { ...next[at], qty: next[at].qty + 1 }
        return next
      }
      return [
        ...prev,
        {
          variantId: item.variantId,
          productName: item.productName,
          optionLabel: item.optionLabel,
          stockQty: item.stockQty,
          qty: 1,
          priceText: String(item.salePrice),
        },
      ]
    })
    setCandidates([])
    setQuery('')
    setNotice(null)
    // 스캐너는 연속으로 찍는다. 포커스를 돌려놓지 않으면 두 번째 스캔이 허공에 간다.
    scanRef.current?.focus()
  }

  function handleScan(e: React.FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (!q) return

    startSearch(async () => {
      const found = await findItems(q)
      if (found.length === 1) {
        addItem(found[0])
      } else if (found.length === 0) {
        setCandidates([])
        setNotice(`“${q}” 로 찾은 상품이 없습니다`)
      } else {
        setCandidates(found)
        setNotice(null)
      }
    })
  }

  const total = useMemo(
    () => cart.reduce((sum, l) => sum + l.qty * toInt(l.priceText), 0),
    [cart],
  )
  const count = useMemo(() => cart.reduce((sum, l) => sum + l.qty, 0), [cart])

  const payload = useMemo(
    () =>
      JSON.stringify(
        cart.map((l) => ({
          variant_id: l.variantId,
          qty: l.qty,
          unit_price: toInt(l.priceText),
        })),
      ),
    [cart],
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-ink text-lg font-semibold tracking-tight">판매</h1>
        {cart.length > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setCart([])
              scanRef.current?.focus()
            }}
          >
            전체 비우기
          </Button>
        ) : null}
      </div>

      {/* 판매 폼과 별개의 폼이다. 폼은 중첩될 수 없고, 스캔의 엔터가 판매를
          확정시키면 안 된다. */}
      <form onSubmit={handleScan}>
        <div className="relative">
          <ScanLine
            size={20}
            aria-hidden
            className="text-ink-subtle pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
          />
          <input
            ref={scanRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="바코드를 찍거나 상품명을 치세요"
            aria-label="바코드 또는 상품명"
            autoFocus
            autoCapitalize="none"
            autoComplete="off"
            // 스캐너는 코드를 치고 엔터를 누른다. 폼의 submit 이 그대로 조회가 된다.
            enterKeyHint="search"
            className="bg-surface text-ink border-border-strong placeholder:text-ink-subtle focus:border-primary h-touch-lg w-full rounded-lg border pr-3 pl-11 text-base outline-none"
          />
        </div>
      </form>

      {searching ? <p className="text-ink-muted text-sm">찾는 중…</p> : null}

      {notice ? (
        <Card className="p-4">
          <p className="text-ink text-sm">{notice}</p>
        </Card>
      ) : null}

      {candidates.length > 0 ? (
        <Card className="flex flex-col">
          <p className="text-ink-muted border-border-base border-b px-4 py-2 text-xs">
            {candidates.length}개 중에서 고르세요
          </p>
          <ul>
            {candidates.map((c) => (
              <li key={c.variantId}>
                <button
                  type="button"
                  onClick={() => addItem(c)}
                  className="hover:bg-surface-sunken border-border-base flex w-full items-center justify-between gap-3 border-b px-4 py-3 text-left last:border-0"
                >
                  <span className="min-w-0">
                    <span className="text-ink block truncate text-sm font-medium">
                      {c.productName}
                    </span>
                    {c.optionLabel ? (
                      <span className="text-ink-muted block truncate text-xs">
                        {c.optionLabel}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-ink text-sm" data-numeric>
                      {formatWon(c.salePrice)}
                    </span>
                    <Badge tone={c.stockQty <= 0 ? 'low' : 'neutral'}>
                      {formatQty(c.stockQty)}개
                    </Badge>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {state?.status === 'done' ? (
        <Card className="border-in/30 bg-in-soft p-4">
          <p className="text-in text-sm font-medium">
            판매 완료 — {formatQty(state.count)}점 {formatWon(state.total)}
          </p>
          <p className="text-ink-muted mt-1 text-sm">
            재고와 내역에 반영됐습니다. 다음 손님을 받으세요.
          </p>
        </Card>
      ) : null}

      {cart.length === 0 ? (
        <Card className="p-5">
          <p className="text-ink-muted text-sm leading-relaxed">
            아직 담긴 물건이 없습니다. 바코드를 찍으면 바로 담기고, 같은 것을 또
            찍으면 수량이 올라갑니다.
          </p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {cart.map((line, i) => {
            const price = toInt(line.priceText)
            const short = line.qty > line.stockQty

            return (
              <li key={line.variantId}>
                <Card className="flex flex-col gap-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-ink truncate text-[0.9375rem] font-medium">
                        {line.productName}
                      </p>
                      {line.optionLabel ? (
                        <p className="text-ink-muted truncate text-sm">
                          {line.optionLabel}
                        </p>
                      ) : null}
                      {short ? (
                        // 막지는 않는다. 입고를 깜빡한 물건 때문에 계산을 못 하는
                        // 것이 더 나쁘다. 대신 눈에 보이게 둔다.
                        <p className="text-low mt-1 text-xs">
                          재고 {formatQty(line.stockQty)}개보다 많이 팝니다
                        </p>
                      ) : null}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`${line.productName} 빼기`}
                      onClick={() =>
                        setCart((prev) => prev.filter((_, j) => j !== i))
                      }
                    >
                      <Trash2 size={16} aria-hidden />
                    </Button>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="secondary"
                        aria-label={`${line.productName} 수량 줄이기`}
                        onClick={() =>
                          setCart((prev) =>
                            prev.map((l, j) =>
                              j === i ? { ...l, qty: Math.max(1, l.qty - 1) } : l,
                            ),
                          )
                        }
                      >
                        <Minus size={16} aria-hidden />
                      </Button>
                      <span
                        className="text-ink w-10 text-center text-base font-medium"
                        data-numeric
                        aria-label={`${line.productName} 수량`}
                      >
                        {line.qty}
                      </span>
                      <Button
                        variant="secondary"
                        aria-label={`${line.productName} 수량 늘리기`}
                        onClick={() =>
                          setCart((prev) =>
                            prev.map((l, j) => (j === i ? { ...l, qty: l.qty + 1 } : l)),
                          )
                        }
                      >
                        <Plus size={16} aria-hidden />
                      </Button>
                    </div>

                    <div className="flex items-center gap-2">
                      <Input
                        aria-label={`${line.productName} 판매 단가`}
                        inputMode="numeric"
                        autoComplete="off"
                        value={line.priceText}
                        onChange={(e) =>
                          setCart((prev) =>
                            prev.map((l, j) =>
                              j === i ? { ...l, priceText: e.target.value } : l,
                            ),
                          )
                        }
                        className="w-24 text-right"
                      />
                      <span
                        className="text-ink w-24 text-right text-[0.9375rem] font-semibold"
                        data-numeric
                      >
                        {formatWon(price * line.qty)}
                      </span>
                    </div>
                  </div>
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      <form
        action={formAction}
        className={cn(
          'bg-surface border-border-base sticky z-10 -mx-4 border-t px-4 py-3',
          STICKY[device],
        )}
      >
        <input type="hidden" name="cart" value={payload} />

        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-ink-muted text-xs">
              {formatQty(count)}점
            </div>
            <div className="text-ink text-xl font-semibold tracking-tight" data-numeric>
              {formatWon(total)}
            </div>
          </div>
          <Button
            type="submit"
            size="lg"
            disabled={cart.length === 0 || saving}
            className="min-w-36"
          >
            {saving ? '저장 중…' : '판매 확정'}
          </Button>
        </div>

        {state?.status === 'error' ? (
          <p role="alert" className="text-danger mt-2 text-sm">
            {state.error}
          </p>
        ) : null}
      </form>
    </div>
  )
}
