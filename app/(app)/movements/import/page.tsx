import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

import { ActionForm } from '@/components/ui/action-form'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { chunks } from '@/lib/chunks'
import { formatDateTime, formatQty, formatWon } from '@/lib/constants'
import { createClient } from '@/lib/supabase/server'

import { voidPurchaseBatch } from './actions'
import { PurchaseImportFlow } from './import-flow'

export const metadata = { title: '입고 파일 반영' }

type BatchRow = {
  id: number
  import_batch_id: string | null
  qty_delta: number
  purchase_amount: number | null
  note: string | null
  created_at: string
}

/** 전표 메모에서 파일 이름만. 박스 줄은 "[2박스 × 12개] 파일명" 꼴이다. */
function fileLabel(note: string | null): string {
  if (!note) return ''
  return note.replace(/^\[[^\]]*\]\s*/, '')
}

/**
 * 입고 파일 올리기 + 이력·되돌리기.
 *
 * 판매 임포트가 /sales/import(올리기)와 /sales/batches(이력)로 나뉜 것과 달리
 * 여기는 한 화면이다 — 입고 파일은 빈도가 낮고, "방금 올린 걸 바로 되돌린다"
 * 가 이력의 주 용도라 올리는 자리 바로 아래가 맞다.
 */
export default async function PurchaseImportPage() {
  const supabase = await createClient()

  // 배치 집계를 SQL 로 하지 않고 최근 전표를 받아 여기서 묶는다. 파일 하나가
  // 수백 줄이라 1,000이면 최근 배치 몇 개 몫이고, 이 화면은 그 몇 개만 보여준다.
  const { data } = await supabase
    .from('stock_movements')
    .select('id, import_batch_id, qty_delta, purchase_amount, note, created_at')
    .not('import_batch_id', 'is', null)
    .order('id', { ascending: false })
    .limit(1000)

  const movements = (data ?? []) as BatchRow[]

  const batches = new Map<string, BatchRow[]>()
  for (const m of movements) {
    if (!m.import_batch_id) continue
    const list = batches.get(m.import_batch_id) ?? []
    list.push(m)
    batches.set(m.import_batch_id, list)
  }
  const recent = [...batches.entries()].slice(0, 10)

  // 어느 전표가 이미 되돌려졌는지. 정정 전표는 배치에 안 들어가므로 따로 묻는다.
  const reversed = new Set<number>()
  const ids = recent.flatMap(([, list]) => list.map((m) => m.id))
  for (const part of chunks(ids)) {
    const { data: rev } = await supabase
      .from('stock_movements')
      .select('reverses_id')
      .in('reverses_id', part)
    for (const r of rev ?? []) {
      if (r.reverses_id != null) reversed.add(r.reverses_id)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link
          href="/movements"
          aria-label="입출고로 돌아가기"
          className="text-ink-muted hover:bg-surface-sunken hover:text-ink -ml-2 inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors"
        >
          <ChevronLeft size={20} aria-hidden />
        </Link>
        <h1 className="text-ink text-lg font-semibold tracking-tight">
          입고 파일 반영
        </h1>
      </div>

      <PurchaseImportFlow />

      <section className="flex flex-col gap-2">
        <h2 className="text-ink text-sm font-semibold">파일 입고 이력</h2>
        {recent.length === 0 ? (
          <Card className="p-5">
            <p className="text-ink-muted text-sm leading-relaxed">
              아직 파일로 반영한 입고가 없습니다. 파일을 올리면 여기에 쌓이고,
              잘못 올린 것을 통째로 되돌릴 수 있습니다.
            </p>
          </Card>
        ) : (
          recent.map(([batchId, list]) => {
            const qty = list.reduce((s, m) => s + m.qty_delta, 0)
            const amount = list.reduce((s, m) => s + Number(m.purchase_amount ?? 0), 0)
            const voided = list.every((m) => reversed.has(m.id))
            const label = fileLabel(list[0].note)

            return (
              <Card key={batchId}>
                <CardHeader>
                  <CardTitle>
                    {formatDateTime(list[0].created_at)} 에 올린 파일
                  </CardTitle>
                  {voided ? (
                    <span className="text-ink-subtle text-xs">되돌림</span>
                  ) : null}
                </CardHeader>
                <CardBody className="flex flex-col gap-3">
                  <p className="text-ink-muted text-sm">
                    <span data-numeric>{list.length}줄</span> ·{' '}
                    <span data-numeric>{formatQty(qty)}점</span> ·{' '}
                    <span className="text-ink font-medium" data-numeric>
                      {formatWon(amount)}
                    </span>
                    {label ? <span className="text-ink-subtle"> · {label}</span> : null}
                  </p>
                  {voided ? (
                    <p className="text-ink-subtle text-sm">
                      이미 되돌린 배치입니다. 재고와 매입에 영향이 없습니다.
                    </p>
                  ) : (
                    <ActionForm
                      action={voidPurchaseBatch}
                      submitLabel="이 파일 통째로 되돌리기"
                      submitVariant="secondary"
                      submitSize="sm"
                      confirmLabel="정말 되돌리기 — 재고와 매입이 반영 전으로 돌아갑니다"
                    >
                      <input type="hidden" name="batchId" value={batchId} />
                    </ActionForm>
                  )}
                </CardBody>
              </Card>
            )
          })
        )}
      </section>
    </div>
  )
}
