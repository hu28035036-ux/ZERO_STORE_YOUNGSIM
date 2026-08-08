'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'

import { Button, buttonClass } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, NumberInput, Select } from '@/components/ui/field'
import { formatQty, formatWon } from '@/lib/constants'
import { unitCostFromBox } from '@/lib/kit-cost'
import type { ActionState } from '@/lib/action-state'

import { receiveKit } from '../../actions'
import type { KitItemRow } from '../../query'

/**
 * 박스 입고 — 이 기능의 핵심 화면.
 *
 * 박스는 하나로 오는데 안에 든 맛은 여러 가지고, 팔릴 때는 맛별로 팔린다.
 * 그래서 여기서 하는 일은 "박스 하나를 맛별 입고 전표 여러 장으로 펴는 것"이다.
 *
 * 수량을 미리 채워 두되 **고칠 수 있게** 둔다. 구성이 대체로 같지만 가끔
 * 다르다는 것이 사용자 확인 사항이고, 기본값을 강제하면 다르게 온 날 사람이
 * 앱을 이길 방법이 없다. 안 온 맛은 0 으로 두면 전표가 안 생긴다.
 */
export function ReceiveForm({
  kitId,
  kitName,
  items,
  suppliers,
  today,
}: {
  kitId: string
  kitName: string
  items: KitItemRow[]
  suppliers: { id: string; name: string }[]
  today: string
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(receiveKit, null)

  const [boxes, setBoxes] = useState('1')
  const [boxCost, setBoxCost] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(today)
  // 줄마다 사람이 고친 값만 담는다. 안 건드린 줄은 박스 수에 따라 자동으로
  // 다시 계산돼야 하기 때문에, 계산값을 상태로 굳히지 않는다.
  const [edited, setEdited] = useState<Record<string, string>>({})

  const boxCount = toInt(boxes) ?? 0

  const lines = items.map((it) => {
    const vid = it.variant_id!
    const auto = String((it.default_qty ?? 0) * Math.max(boxCount, 0))
    const raw = edited[vid] ?? auto
    return {
      vid,
      name: it.product_name ?? '',
      option: it.option_label,
      unit: it.unit || '개',
      stock: it.stock_qty ?? 0,
      per: it.default_qty ?? 0,
      raw,
      qty: toInt(raw) ?? 0,
      touched: edited[vid] != null && edited[vid] !== auto,
    }
  })

  const totalQty = lines.reduce((s, l) => s + Math.max(l.qty, 0), 0)
  const cost = toInt(boxCost)
  // SQL 의 receive_kit 과 같은 식을 쓴다. 미리보기와 전표가 어긋나면 안 된다.
  const unitCost = unitCostFromBox(cost, boxCount, totalQty)
  const missing = lines.filter((l) => l.qty === 0).length

  // useMemo 를 안 쓴다 — lines 가 매 렌더 새 배열이라 deps 가 맞을 수 없고,
  // React Compiler 도 손으로 감싼 메모를 보존 못 한다며 최적화를 건너뛴다.
  const payload = JSON.stringify({
    kitId,
    boxes: boxCount,
    lines: lines.map((l) => ({ variantId: l.vid, qty: Math.max(l.qty, 0) })),
    boxCost: cost,
    supplierId: supplierId || null,
    note: note.trim() || null,
    date,
  })

  if (state?.status === 'ok') {
    return (
      <Card>
        <CardBody className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-ink font-medium">{state.message}</p>
          <p className="text-ink-muted text-sm">재고와 입출고 내역에 반영됐습니다.</p>
          <div className="flex gap-2">
            <Link href="/kits" className={buttonClass('secondary')}>
              박스 목록
            </Link>
            <Link href="/movements/history" className={buttonClass('primary')}>
              입출고 내역 보기
            </Link>
          </div>
        </CardBody>
      </Card>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 pb-4">
      <input type="hidden" name="payload" value={payload} />

      <Card>
        <CardHeader>
          <CardTitle>몇 박스 들어왔나요</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <NumberInput
              label="박스 수"
              inputMode="numeric"
              value={boxes}
              onChange={(e) => setBoxes(e.target.value)}
              hint="아래 개수가 따라 바뀝니다"
            />
            <NumberInput
              label="박스 하나 매입가"
              inputMode="numeric"
              value={boxCost}
              onChange={(e) => setBoxCost(e.target.value)}
              placeholder="비워두면 원가 그대로"
              hint="개수대로 나눠 낱개 원가가 됩니다"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="들어온 날"
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
            />
            <Select
              label="거래처"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <option value="">선택 안 함</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <Input
            label="메모"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="예: 8월 1차 발주"
            maxLength={200}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>들어온 개수 확인</CardTitle>
          <p className="text-ink-muted text-sm">
            박스 수에 맞춰 미리 채워 뒀습니다. <b>실제로 다르게 왔으면 그 줄만 고쳐</b>
            주세요. 안 들어온 맛은 <b>0</b> 으로 두면 기록되지 않습니다.
          </p>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          <ul className="flex flex-col gap-2">
            {lines.map((l) => (
              <li
                key={l.vid}
                className={
                  'flex items-center gap-3 rounded-lg border p-3 ' +
                  (l.qty === 0
                    ? 'border-border-base bg-surface-sunken'
                    : l.touched
                      ? 'border-low'
                      : 'border-border-base')
                }
              >
                <div className="min-w-0 flex-1">
                  <p className="text-ink truncate text-sm font-medium">{l.name}</p>
                  <p className="text-ink-subtle truncate text-xs">
                    지금 {formatQty(l.stock)}
                    {l.unit}
                    {l.per ? ` · 보통 박스당 ${l.per}` : ''}
                    {l.option ? ` · ${l.option}` : ''}
                  </p>
                </div>
                {l.touched ? (
                  <span className="text-low shrink-0 text-xs font-medium">고침</span>
                ) : null}
                <NumberInput
                  aria-label={`${l.name} 들어온 개수`}
                  className="w-20 text-right"
                  inputMode="numeric"
                  value={l.raw}
                  onChange={(e) =>
                    setEdited((prev) => ({ ...prev, [l.vid]: e.target.value }))
                  }
                />
                <span className="text-ink-muted w-8 shrink-0 text-xs">{l.unit}</span>
              </li>
            ))}
          </ul>

          {Object.keys(edited).length > 0 ? (
            <button
              type="button"
              onClick={() => setEdited({})}
              className="text-ink-muted hover:text-ink self-start text-xs underline"
            >
              고친 값 되돌리기
            </button>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="flex flex-col gap-2">
          <p className="text-ink-muted flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span>
              모두 <b className="text-ink" data-numeric>{formatQty(totalQty)}</b>개 ·{' '}
              {lines.length - missing}종류
            </span>
            {unitCost != null ? (
              <span>
                낱개 원가 <b className="text-ink" data-numeric>{formatWon(unitCost)}</b>
              </span>
            ) : null}
          </p>
          {missing > 0 ? (
            <p className="text-ink-subtle text-xs">
              {missing}종류는 0 개라 기록하지 않습니다.
            </p>
          ) : null}
          {unitCost == null && cost != null ? (
            <p className="text-low text-xs">개수가 0 이라 원가를 나눌 수 없습니다.</p>
          ) : null}
        </CardBody>
      </Card>

      {state?.status === 'error' ? (
        <p className="text-danger text-sm">{state.message}</p>
      ) : null}

      <Button type="submit" disabled={pending || totalQty === 0 || boxCount < 1} full size="lg">
        {pending ? '반영 중…' : `${kitName} 입고하기`}
      </Button>
      {totalQty === 0 ? (
        <p className="text-ink-subtle text-xs">개수를 하나 이상 채워 주세요.</p>
      ) : null}
    </form>
  )
}

function toInt(v: string): number | null {
  const cleaned = String(v).replace(/[^\d-]/g, '')
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? Math.trunc(n) : null
}
