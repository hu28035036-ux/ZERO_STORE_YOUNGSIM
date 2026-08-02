'use client'

import { useActionState, useState, useTransition } from 'react'
import Link from 'next/link'
import { Plus, Search, X } from 'lucide-react'

import { Button, buttonClass } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, NumberInput } from '@/components/ui/field'
import { formatQty } from '@/lib/constants'
import type { ActionState } from '@/lib/action-state'

import { saveKit } from './actions'
import type { KitItemRow } from './query'
import { findItems, type FoundItem } from '../sales/actions'

/**
 * 박스 구성 만들기·고치기.
 *
 * 구성품 찾기는 판매 적기와 같은 findItems 를 쓴다. 상품명·POS 메뉴명·SKU·
 * 바코드를 한 번에 훑는 그 경로 그대로라, 매장 이름으로 찾아도 걸린다.
 */
export function KitForm({
  kitId,
  initialName,
  initialNote,
  initialItems,
}: {
  kitId: string | null
  initialName: string
  initialNote: string
  initialItems: KitItemRow[]
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(saveKit, null)

  const [name, setName] = useState(initialName)
  const [note, setNote] = useState(initialNote)
  const [items, setItems] = useState<Line[]>(
    initialItems.map((i) => ({
      variantId: i.variant_id!,
      label: i.product_name ?? '',
      option: i.option_label,
      unit: i.unit || '개',
      qty: String(i.default_qty ?? 1),
    })),
  )

  const total = items.reduce((s, i) => s + (toInt(i.qty) ?? 0), 0)

  // useMemo 를 안 쓴다 — React Compiler 가 알아서 메모하고, 손으로 감싸면
  // deps 를 보존하지 못한다며 최적화를 통째로 건너뛴다.
  const payload = JSON.stringify({
    kitId,
    name: name.trim(),
    note: note.trim() || null,
    items: items
      .map((i) => ({ variantId: i.variantId, qty: toInt(i.qty) ?? 0 }))
      .filter((i) => i.qty > 0),
  })

  function add(found: FoundItem) {
    setItems((prev) =>
      prev.some((p) => p.variantId === found.variantId)
        ? prev
        : [
            ...prev,
            {
              variantId: found.variantId,
              label: found.productName,
              option: found.optionLabel,
              unit: found.unit,
              qty: '1',
            },
          ],
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 pb-4">
      <input type="hidden" name="payload" value={payload} />

      <Card>
        <CardHeader>
          <CardTitle>박스 정보</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <Input
            label="박스 이름"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 더존건강 한끼곤약젤리 버라이어티팩"
            required
            maxLength={120}
            hint="발주할 때 부르는 이름으로 두면 찾기 쉽습니다"
          />
          <Input
            label="메모"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="예: 발주코드 494645"
            maxLength={200}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>박스에 든 것</CardTitle>
          <p className="text-ink-muted text-sm">
            보통 한 박스에 몇 개씩 드는지 적어 주세요. 실제로 다르게 오는 날은
            입고할 때 그 자리에서 고칠 수 있습니다.
          </p>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <ItemPicker onPick={add} chosen={items.map((i) => i.variantId)} />

          {items.length === 0 ? (
            <p className="text-ink-subtle py-6 text-center text-sm">
              아직 담은 것이 없습니다. 위에서 찾아 담아 주세요.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {items.map((it, idx) => (
                <li
                  key={it.variantId}
                  className="border-border-base flex items-center gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-ink truncate text-sm font-medium">{it.label}</p>
                    {it.option ? (
                      <p className="text-ink-subtle truncate text-xs">{it.option}</p>
                    ) : null}
                  </div>
                  <NumberInput
                    aria-label={`${it.label} 박스당 개수`}
                    className="w-20 text-right"
                    inputMode="numeric"
                    value={it.qty}
                    onChange={(e) =>
                      setItems((prev) =>
                        prev.map((p, i) => (i === idx ? { ...p, qty: e.target.value } : p)),
                      )
                    }
                  />
                  <span className="text-ink-muted w-8 text-xs">{it.unit}</span>
                  <button
                    type="button"
                    aria-label={`${it.label} 빼기`}
                    onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                    className="text-ink-subtle hover:text-danger hover:bg-surface-sunken inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {items.length > 0 ? (
            <p className="text-ink-muted text-sm">
              한 박스에 <b className="text-ink" data-numeric>{formatQty(total)}</b>개 ·{' '}
              {items.length}종류
            </p>
          ) : null}
        </CardBody>
      </Card>

      {state?.status === 'error' ? (
        <p className="text-danger text-sm">{state.message}</p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={pending || items.length < 2} full>
          {pending ? '저장 중…' : '저장'}
        </Button>
        <Link href="/kits" className={buttonClass('ghost')}>
          취소
        </Link>
      </div>
      {items.length < 2 ? (
        <p className="text-ink-subtle text-xs">
          두 종류 이상 담아야 저장할 수 있습니다. 한 종류만 든 박스는 상품 수정의
          “박스당 개수” 로 넣으세요.
        </p>
      ) : null}
    </form>
  )
}

type Line = {
  variantId: string
  label: string
  option: string | null
  unit: string
  qty: string
}

/** 구성품 찾기. 판매 적기와 같은 검색 경로(findItems)를 쓴다. */
function ItemPicker({
  onPick,
  chosen,
}: {
  onPick: (item: FoundItem) => void
  chosen: string[]
}) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<FoundItem[]>([])
  const [pending, start] = useTransition()

  function search() {
    const query = q.trim()
    if (!query) return setHits([])
    start(async () => setHits(await findItems(query)))
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          label="상품 찾기"
          className="flex-1"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              search()
            }
          }}
          placeholder="상품명 · POS 메뉴명 · 바코드"
        />
        <Button type="button" variant="secondary" onClick={search} className="mt-6 shrink-0">
          <Search className="h-4 w-4" />
          찾기
        </Button>
      </div>

      {pending ? <p className="text-ink-subtle text-sm">찾는 중…</p> : null}

      {!pending && hits.length > 0 ? (
        <ul className="border-border-base divide-border-base divide-y rounded-lg border">
          {hits.map((h) => {
            const already = chosen.includes(h.variantId)
            return (
              <li key={h.variantId}>
                <button
                  type="button"
                  disabled={already}
                  onClick={() => onPick(h)}
                  className="hover:bg-surface-sunken flex w-full items-center gap-3 p-3 text-left disabled:opacity-45"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-ink truncate text-sm font-medium">{h.productName}</p>
                    <p className="text-ink-subtle truncate text-xs">
                      재고 {formatQty(h.stockQty)}
                      {h.unit}
                      {h.optionLabel ? ` · ${h.optionLabel}` : ''}
                    </p>
                  </div>
                  {already ? (
                    <span className="text-ink-subtle text-xs">담음</span>
                  ) : (
                    <Plus className="text-ink-muted h-4 w-4 shrink-0" />
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}

function toInt(v: string): number | null {
  const n = Number(String(v).replace(/[^\d-]/g, ''))
  return Number.isFinite(n) ? Math.trunc(n) : null
}
