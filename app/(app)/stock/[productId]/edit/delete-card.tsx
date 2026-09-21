'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { formatQty } from '@/lib/constants'

import { archiveProduct, restoreProduct } from '../../actions'

/**
 * 수정 화면 맨 아래 삭제/되살리기 카드.
 *
 * updateProduct 와 별개 액션(archiveProduct/restoreProduct)이라 폼 밖에 둔다 —
 * 같은 <form> 안에 있으면 이 카드의 버튼이 실수로 상품 정보 저장까지 같이
 * 트리거할 위험이 있다.
 */
export function DeleteProductCard({
  productId,
  productName,
  isActive,
  stockSum,
}: {
  productId: string
  productName: string
  isActive: boolean
  stockSum: number
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [armed, setArmed] = useState(false)
  // 재고가 있으면 실사 0 정리가 기본 — 자산 집계에서 조용히 남는 것보다
  // 눈에 보이게 정리하는 쪽을 권장값으로 둔다.
  const [zeroStock, setZeroStock] = useState(stockSum > 0)
  const [error, setError] = useState<string | null>(null)
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null)

  function confirmDelete() {
    setError(null)
    startTransition(async () => {
      const res = await archiveProduct(productId, zeroStock)
      if (!res.ok) {
        setError(res.error)
        setArmed(false)
        return
      }
      // 재고 화면이 이 쿼리로 "삭제했습니다" 안내를 한 번 띄운다.
      router.push(`/stock?archived=${encodeURIComponent(productName)}`)
    })
  }

  function restore() {
    setError(null)
    startTransition(async () => {
      const res = await restoreProduct(productId)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setRestoreMessage(`${productName} 을(를) 되살렸습니다`)
      // is_active 가 서버 컴포넌트 프롭이라 새로 받아와야 이 카드가
      // "삭제 카드" 쪽으로 다시 바뀐다.
      router.refresh()
    })
  }

  if (!isActive) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>삭제된 상품입니다</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          <Badge tone="neutral" className="self-start">
            삭제됨 · 기록은 남음
          </Badge>
          <p className="text-ink-muted text-sm leading-relaxed">
            재고 목록과 검색·판매 담기에서 숨겨져 있습니다. 입출고·판매 기록은
            그대로 남아 있습니다. 되살리면 다시 목록에 나타납니다.
          </p>
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={restore}
            className="self-start"
          >
            {pending ? '처리 중…' : '되살리기'}
          </Button>
          {restoreMessage ? <p className="text-in text-sm">{restoreMessage}</p> : null}
          {error ? <p className="text-danger text-sm">{error}</p> : null}
        </CardBody>
      </Card>
    )
  }

  return (
    <Card className="border-danger/30">
      <CardHeader>
        <CardTitle>상품 삭제</CardTitle>
      </CardHeader>
      <CardBody className="flex flex-col gap-3">
        <p className="text-ink-muted text-sm leading-relaxed">
          재고 목록과 검색·판매 담기에서 사라집니다. 입출고 내역과 판매 기록은
          지워지지 않고 그대로 남습니다. 삭제한 상품은 재고 화면의 &lsquo;삭제됨&rsquo;
          탭에서 되살릴 수 있습니다.
        </p>

        {stockSum > 0 ? (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={zeroStock}
              onChange={(e) => setZeroStock(e.target.checked)}
              className="border-border-strong mt-0.5 size-4 rounded"
            />
            <span className="text-ink">
              남아 있는 재고 {formatQty(stockSum)}개를 실사 0으로 정리하고 삭제 (권장)
            </span>
          </label>
        ) : null}
        {stockSum > 0 && !zeroStock ? (
          <p className="text-ink-muted text-xs leading-relaxed">
            수량 기록은 그대로 둔 채 목록에서만 숨깁니다. 숨긴 상품은 재고 자산
            집계에서 빠집니다.
          </p>
        ) : null}
        {stockSum < 0 ? (
          <p className="text-low text-sm">
            재고가 음수입니다. 삭제 전에 실사로 정리하는 편이 안전합니다.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {armed ? (
            <>
              <Button type="button" variant="danger" disabled={pending} onClick={confirmDelete}>
                {pending ? '처리 중…' : '정말 삭제 · 재고 목록에서 사라집니다'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setArmed(false)}
                disabled={pending}
              >
                취소
              </Button>
            </>
          ) : (
            <Button type="button" variant="danger" onClick={() => setArmed(true)}>
              이 상품 삭제
            </Button>
          )}
        </div>
        {error ? <p className="text-danger text-sm">{error}</p> : null}
      </CardBody>
    </Card>
  )
}
