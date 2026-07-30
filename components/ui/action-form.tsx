'use client'

import { useActionState, useState } from 'react'

import { Button, type ButtonProps } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import type { ActionState } from '@/lib/action-state'

/**
 * 서버 액션 하나를 감싸는 폼.
 *
 * 설정 화면에는 작은 폼이 여러 개 있고 전부 같은 것을 필요로 한다 —
 * 저장 중 표시, 오류 문구, 성공 문구. 화면마다 useActionState 를 다시 쓰는 대신
 * 여기 한 번만 둔다.
 *
 * 서버 액션을 prop 으로 받는다. 클라이언트 컴포넌트 안에서는 액션을 정의할 수
 * 없지만, 서버에서 정의한 것을 넘겨받아 쓰는 것은 된다.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  submitVariant = 'primary',
  submitSize = 'md',
  full = false,
  /** 채우면 두 번 눌러야 실행된다. 되돌릴 수 없는 동작에만 쓴다. */
  confirmLabel,
  /** 'row' 는 목록 한 줄 안에 입력과 버튼을 나란히 둘 때. */
  layout = 'stack',
  className,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>
  children?: React.ReactNode
  submitLabel: string
  submitVariant?: ButtonProps['variant']
  submitSize?: ButtonProps['size']
  full?: boolean
  confirmLabel?: string
  layout?: 'stack' | 'row'
  className?: string
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    action,
    null,
  )
  const [armed, setArmed] = useState(false)

  return (
    <form
      action={formAction}
      className={cn(
        layout === 'row'
          ? 'flex flex-wrap items-end gap-2'
          : 'flex flex-col gap-3',
        className,
      )}
    >
      {children}

      <div className="flex items-center gap-2">
        {confirmLabel && !armed ? (
          <Button
            variant={submitVariant}
            size={submitSize}
            full={full}
            onClick={() => setArmed(true)}
          >
            {submitLabel}
          </Button>
        ) : (
          <>
            <Button
              type="submit"
              variant={confirmLabel ? 'danger' : submitVariant}
              size={submitSize}
              full={full && !confirmLabel}
              disabled={pending}
            >
              {pending ? '처리 중…' : (confirmLabel ?? submitLabel)}
            </Button>
            {confirmLabel && armed ? (
              <Button size={submitSize} variant="ghost" onClick={() => setArmed(false)}>
                취소
              </Button>
            ) : null}
          </>
        )}
      </div>

      {/* aria-live 로 저장 결과가 스크린리더에도 읽히게 한다.
          한 줄 배치일 때는 폭을 다 써서 아래로 내려가게 한다. */}
      <p
        aria-live="polite"
        className={cn('text-sm empty:hidden', layout === 'row' && 'w-full')}
      >
        {state?.status === 'error' ? (
          <span className="text-danger">{state.message}</span>
        ) : state?.status === 'ok' ? (
          <span className="text-in">{state.message}</span>
        ) : null}
      </p>
    </form>
  )
}
