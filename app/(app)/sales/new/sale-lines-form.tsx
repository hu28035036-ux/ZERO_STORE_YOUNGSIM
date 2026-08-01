'use client'

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { Camera, Minus, Plus, ScanLine, Trash2 } from 'lucide-react'

import { BarcodeScanner } from '@/components/scanner/barcode-scanner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/field'
import { cn } from '@/lib/cn'
import { formatQty, formatWon, todayInSeoul } from '@/lib/constants'
import type { Device } from '@/lib/device'

import { findItems, recordSale, type FoundItem, type SaleState } from '../actions'

type CartLine = {
  variantId: string
  productName: string
  optionLabel: string | null
  stockQty: number
  unit: string
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

export function SaleLinesForm({ device }: { device: Device }) {
  const [state, formAction, saving] = useActionState<SaleState, FormData>(
    recordSale,
    null,
  )

  const [cart, setCart] = useState<CartLine[]>([])
  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState<FoundItem[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [searching, startSearch] = useTransition()

  // 렌더마다 부르면 자정을 넘는 순간 서버 HTML 과 어긋난다. 처음 한 번만 만든다.
  const [today] = useState(() => todayInSeoul())

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
          unit: item.unit,
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

  function lookup(raw: string) {
    const q = raw.trim()
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

  function handleScan(e: React.FormEvent) {
    e.preventDefault()
    lookup(query)
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
        <h1 className="text-ink text-lg font-semibold tracking-tight">판매 적기</h1>
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
      <form onSubmit={handleScan} className="flex gap-2">
        <div className="relative min-w-0 flex-1">
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
        {/* 컨트롤드 입력이라 공용 ScanButton(DOM 에 값을 직접 넣는 방식)을 못
            쓴다 — React 가 되돌린다. 조회 함수를 직접 부른다. */}
        <Button
          type="button"
          variant="secondary"
          size="lg"
          className="shrink-0"
          aria-label="카메라로 바코드 찍기"
          onClick={() => setCameraOpen(true)}
        >
          <Camera size={20} aria-hidden />
        </Button>
      </form>
      <BarcodeScanner
        open={cameraOpen}
        onDetect={(code) => {
          setQuery(code)
          lookup(code)
        }}
        onClose={() => setCameraOpen(false)}
      />

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
                      {formatQty(c.stockQty)}
                      {c.unit}
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
                          재고 {formatQty(line.stockQty)}
                          {line.unit}보다 많이 팝니다
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

                  <div className="flex flex-wrap items-center justify-between gap-3">
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

                    {/*
                      390px 화면에서는 수량 스테퍼(터치 크기라 못 줄인다)와 단가 칸과
                      줄 합계가 한 줄에 물리적으로 안 들어간다. 억지로 끼우면 다섯 자리
                      금액이 카드 밖으로 잘리고 페이지가 가로로 밀린다. 그렇다고 단가
                      칸만 좁히면 이번엔 치는 값이 안 보인다 — 계산대에서 금액을 못 읽는
                      쪽이 줄이 한 칸 늘어나는 것보다 나쁘다. 그래서 자리가 모자라면
                      이 묶음을 통째로 아랫줄로 내린다. 데스크톱은 폭이 남아 안 내려간다.
                      min-w-56 이 그 줄바꿈을 일으키는 값이라 임의로 낮추지 마라.
                    */}
                    <div className="flex min-w-56 flex-1 items-center justify-end gap-2">
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
                        className="w-24 shrink-0 text-right"
                      />
                      <span
                        className="text-ink min-w-24 shrink-0 text-right text-[0.9375rem] font-semibold"
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

      {/* 이미 일어난 판매를 나중에 적는 화면이라 날짜가 필요하다. 확정 폼은
          sticky 막대라 여기 두면 계산이 어수선해져서, 밖에 두고 form 속성으로
          잇는다. 실사와 달리 판매는 지난 날짜 등록이 정상 경로다. */}
      <Card className="p-4">
        <Input
          label="판매한 날"
          name="date"
          type="date"
          form="sale-form"
          defaultValue={today}
          max={today}
          hint="어제 판 것을 오늘 적을 때 바꾸세요. 시각은 남지 않습니다."
        />
      </Card>

      <form
        id="sale-form"
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
