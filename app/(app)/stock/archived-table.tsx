'use client'

import { useState, useTransition } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/cn'
import { formatDateTime, formatQty } from '@/lib/constants'
import type { Tables } from '@/lib/database.types'

import { restoreProduct } from './actions'

export type ArchivedProduct = Tables<'v_archived_products'>

type Notice = { ok: boolean; text: string }

/**
 * "삭제됨" 탭 표.
 *
 * 되살리기는 확인 단계가 없다(설계 그대로) — 성공하면 문구를 띄우는데, 그
 * 문구는 restoreProduct 가 부른 revalidatePath 로 행 자체가 다음 렌더에서
 * 사라지는 자리(그 행 칸)가 아니라 이 컴포넌트 자체 상태(notice)에 남겨야
 * 한다. 페이지가 새 rows 로 다시 그려도 ArchivedTable 인스턴스는 그대로
 * 유지되므로 notice 는 살아남는다.
 *
 * 휴대폰은 표 대신 카드다. 표는 최소폭이 736px 라 휴대폰에서는 상품명 칸만
 * 보이고 되살리기 버튼은 옆으로 밀어야 나왔다(재고 목록이 카드인 것과 같은 이유).
 */
export function ArchivedTable({
  rows,
  device,
}: {
  rows: ArchivedProduct[]
  device: 'mobile' | 'desktop'
}) {
  const [notice, setNotice] = useState<Notice | null>(null)

  return (
    <div className="flex flex-col gap-3">
      {notice ? (
        <Card className="px-5 py-3">
          <p className={cn('text-sm', notice.ok ? 'text-in' : 'text-danger')}>{notice.text}</p>
        </Card>
      ) : null}

      {device === 'mobile' ? (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <ArchivedProductCard key={row.product_id} row={row} onNotice={setNotice} />
          ))}
        </ul>
      ) : (
        // relative: 머리칸의 sr-only(position:absolute)가 이 카드를 기준으로 자리 잡게 한다.
        // 없으면 기준이 문서 전체가 되어 옆 스크롤 안에 갇히지 않고, 표 오른쪽 끝(732px)
        // 자리에서 페이지 폭을 늘렸다 — 휴대폰에서 화면 전체가 옆으로 밀렸다.
        <Card className="relative overflow-x-auto">
          <table className="w-full min-w-[46rem] text-sm">
            <thead className="bg-surface-sunken text-ink-muted text-xs font-medium">
              <tr>
                <th scope="col" className="px-4 py-3 pl-5 text-left">
                  상품
                </th>
                <th scope="col" className="px-4 py-3 text-left">
                  바코드
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  남은 수량
                </th>
                <th scope="col" className="px-4 py-3 text-left">
                  삭제일
                </th>
                <th scope="col" className="px-4 py-3 pr-5 text-right">
                  <span className="sr-only">되살리기</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <ArchivedProductRow key={row.product_id} row={row} onNotice={setNotice} />
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}

/** 표 줄과 카드가 같은 되살리기를 쓴다 — 두 벌로 두면 문구·오류 처리가 갈라진다. */
function useRestore(row: ArchivedProduct, onNotice: (n: Notice) => void) {
  const [pending, startTransition] = useTransition()
  const name = row.product_name ?? '상품'

  function restore() {
    if (!row.product_id) return
    startTransition(async () => {
      const res = await restoreProduct(row.product_id!)
      if (!res.ok) {
        onNotice({ ok: false, text: res.error })
        return
      }
      onNotice({ ok: true, text: `${name} 을(를) 되살렸습니다` })
    })
  }

  return { name, pending, restore }
}

function RestoreButton({ pending, onClick }: { pending: boolean; onClick: () => void }) {
  return (
    // shrink-0·nowrap: 표 마지막 칸이 최소폭으로 눌리면 글자가 "되살리/기" 두 줄로 꺾여
    // 36px 버튼 위로 삐져나갔다.
    <Button
      size="sm"
      variant="secondary"
      disabled={pending}
      onClick={onClick}
      className="shrink-0 whitespace-nowrap"
    >
      {pending ? '처리 중…' : '되살리기'}
    </Button>
  )
}

function ArchivedProductRow({
  row,
  onNotice,
}: {
  row: ArchivedProduct
  onNotice: (n: Notice) => void
}) {
  const { name, pending, restore } = useRestore(row, onNotice)

  return (
    <tr className="border-border-base border-b opacity-70 last:border-0 hover:opacity-100">
      <td className="px-4 py-3.5">
        <strong className="text-ink text-sm font-semibold">{name}</strong>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Badge tone="neutral">삭제됨 · 기록은 남음</Badge>
          {row.category_name ? (
            <span className="text-ink-subtle text-xs">{row.category_name}</span>
          ) : null}
          {row.channel ? <span className="text-ink-subtle text-xs">{row.channel}</span> : null}
        </div>
      </td>
      <td className="text-ink-subtle px-4 py-3.5 text-xs whitespace-nowrap" data-numeric>
        {row.barcode ?? '—'}
      </td>
      <td className="text-ink-muted px-4 py-3.5 text-right" data-numeric>
        {formatQty(row.stock_qty)}
      </td>
      <td className="text-ink-muted px-4 py-3.5 text-xs whitespace-nowrap" data-numeric>
        {formatDateTime(row.archived_at)}
      </td>
      <td className="px-4 py-3.5 pr-5 text-right">
        <RestoreButton pending={pending} onClick={restore} />
      </td>
    </tr>
  )
}

function ArchivedProductCard({
  row,
  onNotice,
}: {
  row: ArchivedProduct
  onNotice: (n: Notice) => void
}) {
  const { name, pending, restore } = useRestore(row, onNotice)

  return (
    <li>
      <Card className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-ink text-[0.9375rem] font-semibold">{name}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge tone="neutral">삭제됨 · 기록은 남음</Badge>
              {row.category_name ? (
                <span className="text-ink-subtle text-xs">{row.category_name}</span>
              ) : null}
              {row.channel ? <span className="text-ink-subtle text-xs">{row.channel}</span> : null}
            </div>
          </div>
          <RestoreButton pending={pending} onClick={restore} />
        </div>
        <div className="text-ink-muted flex flex-wrap gap-x-3 gap-y-1 text-xs" data-numeric>
          <span>남은 수량 {formatQty(row.stock_qty)}</span>
          {row.barcode ? <span>바코드 {row.barcode}</span> : null}
          <span>{formatDateTime(row.archived_at)} 삭제</span>
        </div>
      </Card>
    </li>
  )
}
