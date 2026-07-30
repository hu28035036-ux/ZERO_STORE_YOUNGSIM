'use client'

import type { InputHTMLAttributes, SelectHTMLAttributes } from 'react'
import { useId } from 'react'

import { cn } from '@/lib/cn'

const CONTROL = cn(
  'w-full rounded-lg border bg-surface text-ink',
  'border-border-strong placeholder:text-ink-subtle',
  // 16px 미만이면 iOS 사파리가 포커스할 때 화면을 확대한다.
  // 계산대에서 이게 일어나면 스캔 흐름이 끊기므로 text-base 아래로 내리지 않는다.
  'h-touch px-3 text-base',
  'focus:border-primary outline-none',
  'disabled:opacity-50',
  'aria-invalid:border-danger',
)

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string
  hint?: string
  error?: string
  children: React.ReactNode
  htmlFor?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-ink text-sm font-medium">
        {label}
      </label>
      {children}
      {/* 오류는 색만이 아니라 글로 말한다. 그리고 role=alert 로 읽어주게 한다. */}
      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : hint ? (
        <p className="text-ink-muted text-sm">{hint}</p>
      ) : null}
    </div>
  )
}

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string
  hint?: string
  error?: string
}

export function Input({ label, hint, error, className, id, ...props }: InputProps) {
  const generated = useId()
  const inputId = id ?? generated

  const control = (
    <input
      id={inputId}
      aria-invalid={error ? true : undefined}
      className={cn(CONTROL, className)}
      {...props}
    />
  )

  if (!label) return control

  return (
    <Field label={label} hint={hint} error={error} htmlFor={inputId}>
      {control}
    </Field>
  )
}

/**
 * 수량·금액 입력.
 *
 * type="number" 를 쓰지 않는다. 휠 스크롤로 값이 바뀌고, 브라우저마다 화살표가
 * 제각각이고, 한국어 IME 와 섞이면 입력이 씹히는 일이 있다.
 * inputMode 로 숫자 키패드만 띄우고 검증은 zod 로 한다.
 */
export function NumberInput({ className, ...props }: InputProps) {
  return (
    <Input
      inputMode="numeric"
      autoComplete="off"
      className={cn('text-right', className)}
      data-numeric
      {...props}
    />
  )
}

export function Select({
  label,
  hint,
  error,
  className,
  id,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string
  hint?: string
  error?: string
}) {
  const generated = useId()
  const selectId = id ?? generated

  const control = (
    <select
      id={selectId}
      aria-invalid={error ? true : undefined}
      className={cn(CONTROL, 'appearance-none pr-8', className)}
      {...props}
    >
      {children}
    </select>
  )

  if (!label) return control

  return (
    <Field label={label} hint={hint} error={error} htmlFor={selectId}>
      {control}
    </Field>
  )
}
