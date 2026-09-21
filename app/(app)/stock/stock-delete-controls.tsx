'use client'

import { useState, useTransition } from 'react'
import { Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'

import { archiveProduct, archiveProducts } from './actions'

/**
 * 표 안 한 줄 삭제.
 *
 * ActionForm 의 confirmLabel 2단계와 같은 결이지만 그 컴포넌트를 그대로 못 쓴다 —
 * archiveProduct 는 폼 제출이 아니라 버튼 클릭에서 바로 부르는 함수라
 * (prev, formData) 시그니처가 아니다. 성공 문구는 이 칸이 아니라 표 위 배너에
 * 뜨므로(행이 사라진 자리에 남길 곳이 없다) onSuccess 로 부모에 알리기만 한다.
 */
export function RowDeleteCell({
  productId,
  productName,
  onSuccess,
}: {
  productId: string
  productName: string
  onSuccess: () => void
}) {
  const [armed, setArmed] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function confirm() {
    setError(null)
    startTransition(async () => {
      const res = await archiveProduct(productId, true)
      if (!res.ok) {
        setError(res.error)
        setArmed(false)
        return
      }
      // revalidatePath 로 이 행이 다음 렌더에서 사라진다 — 로컬 상태를
      // 되돌릴 필요가 없다.
      onSuccess()
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {armed ? (
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="danger"
            disabled={pending}
            onClick={confirm}
            aria-label={`${productName} 정말 삭제`}
          >
            {pending ? '처리 중…' : '정말 삭제'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setArmed(false)} disabled={pending}>
            취소
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setArmed(true)}
          aria-label={`${productName} 삭제`}
        >
          <Trash2 size={14} aria-hidden />
          삭제
        </Button>
      )}
      {error ? (
        <p role="alert" className="text-danger text-xs">
          {error}
        </p>
      ) : null}
    </div>
  )
}

/**
 * 표 위(툴바 바로 아래) 선택 삭제 바. "N개 선택" 문구가 그 자리에서
 * "정말 삭제 · N개" 로 바뀐다 — VoidButton(입출고 정정)과 같은 무모달 2단계.
 */
export function BulkDeleteBar({
  ids,
  onClear,
  onSuccess,
}: {
  ids: string[]
  onClear: () => void
  onSuccess: (count: number) => void
}) {
  const [armed, setArmed] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function confirm() {
    setError(null)
    startTransition(async () => {
      const res = await archiveProducts(ids, true)
      if (!res.ok) {
        setError(res.error)
        setArmed(false)
        return
      }
      setArmed(false)
      onSuccess(res.count)
    })
  }

  return (
    <div className="bg-danger-soft flex flex-col gap-2 rounded-xl px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-danger text-sm">
        {armed ? (
          <strong>정말 삭제 · {ids.length}개</strong>
        ) : (
          <>
            <strong>{ids.length}개 선택</strong> · 재고 목록에서 숨깁니다. 입출고·판매
            기록은 그대로 남습니다.
          </>
        )}
      </p>
      <div className="flex shrink-0 items-center gap-2">
        {armed ? (
          <>
            <Button size="sm" variant="danger" disabled={pending} onClick={confirm}>
              {pending ? '처리 중…' : '정말 삭제'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setArmed(false)} disabled={pending}>
              취소
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="ghost" onClick={onClear}>
              선택 해제
            </Button>
            <Button size="sm" variant="danger" onClick={() => setArmed(true)}>
              선택 삭제
            </Button>
          </>
        )}
      </div>
      {error ? (
        <p role="alert" className="text-danger w-full text-xs">
          {error}
        </p>
      ) : null}
    </div>
  )
}
