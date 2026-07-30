'use client'

import { useActionState, useState } from 'react'

import { Button } from '@/components/ui/button'

import { voidMovement, type MovementState } from './actions'

/**
 * 전표 정정 버튼.
 *
 * 두 번 눌러야 실행된다. window.confirm 을 쓰지 않는 이유는 휴대폰에서
 * 시스템 대화상자가 화면을 덮어 어느 줄을 정정하는지 안 보이기 때문이다.
 * 자리에서 문구가 바뀌면 무엇을 되돌리는지 보면서 누를 수 있다.
 *
 * 원장은 지워지지 않는다. 이 버튼은 반대 부호 전표를 하나 더 넣을 뿐이고,
 * 그래서 되돌린 기록도 내역에 남는다.
 */
export function VoidButton({ id, label }: { id: number; label: string }) {
  const [state, formAction, pending] = useActionState<MovementState, FormData>(
    voidMovement,
    null,
  )
  const [armed, setArmed] = useState(false)

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="reason" value={`정정: ${label}`} />

      {armed ? (
        <div className="flex items-center gap-1">
          <Button
            type="submit"
            size="sm"
            variant="danger"
            disabled={pending}
            aria-label={`${label} 정정 실행`}
          >
            {pending ? '처리 중…' : '정말 정정'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setArmed(false)}>
            취소
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setArmed(true)}
          aria-label={`${label} 정정`}
        >
          정정
        </Button>
      )}

      {state?.error ? (
        <p role="alert" className="text-danger text-xs">
          {state.error}
        </p>
      ) : null}
    </form>
  )
}
