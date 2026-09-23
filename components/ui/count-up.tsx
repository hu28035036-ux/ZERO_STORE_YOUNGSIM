'use client'

import { useEffect, useState } from 'react'

import { formatQty, formatWon } from '@/lib/constants'

/** 원그래프가 한 바퀴 도는 시간과 같다(globals.css 의 donut-reveal). 숫자와 그림이 같이 멈춰야 한다. */
export const COUNT_UP_MS = 900

const FORMAT = {
  won: (n: number) => formatWon(n),
  qty: (n: number) => formatQty(Math.round(n)),
  /** 소수 첫째 자리까지. 비중(%)에 쓴다. */
  percent: (n: number) => (Math.round(n * 10) / 10).toFixed(1),
} as const

/**
 * 0 에서 목표값까지 올라가며 적히는 숫자.
 *
 * 서버 렌더와 첫 클라이언트 렌더는 **최종값**을 낸다. 0 으로 시작하면 JS 가 없는
 * 환경(또는 로딩 중)에서 화면이 0원으로 남고, hydration 도 어긋난다. 마운트 뒤
 * 효과에서만 0 으로 되감아 올라간다.
 *
 * 포맷은 함수가 아니라 이름으로 받는다 — 서버 컴포넌트에서 클라이언트로 함수를
 * 넘길 수 없다.
 */
export function CountUp({
  value,
  format,
  suffix = '',
}: {
  value: number
  format: keyof typeof FORMAT
  suffix?: string
}) {
  const [shown, setShown] = useState(value)

  useEffect(() => {
    // 움직임을 줄여 달라고 한 기기에서는 첫 프레임에 바로 최종값.
    const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 0
      : COUNT_UP_MS

    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = duration === 0 ? 1 : Math.min(1, (now - start) / duration)
      // ease-out cubic: 처음에 빨리 올라가고 끝에서 천천히 멈춘다. 선형이면
      // 마지막 자리가 계속 튀어서 최종값을 언제 읽어야 하는지 알 수 없다.
      const eased = 1 - Math.pow(1 - t, 3)
      setShown(value * eased)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value])

  return (
    <>
      {FORMAT[format](shown)}
      {suffix}
    </>
  )
}
