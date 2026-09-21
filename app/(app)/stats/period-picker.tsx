import Link from 'next/link'

import { buttonClass } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/cn'
import { todayInSeoul } from '@/lib/constants'

import { periodHref, PRESET_LABEL, PRESETS, type Period } from './period'

/**
 * 기간 선택.
 *
 * 화면 맨 위에 한 줄로 둔다. 아래의 모든 숫자가 같은 기간을 본다 — 카드마다
 * 제 기간을 갖게 하면 나란히 놓인 두 숫자가 서로 다른 기간이라 비교가 안 된다.
 */
export function PeriodPicker({ period, days }: { period: Period; days: number }) {
  const today = todayInSeoul()

  return (
    <Card className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap gap-1">
        {PRESETS.map((p) => {
          const on = period.preset === p
          return (
            <Link
              key={p}
              href={periodHref({ preset: p })}
              aria-current={on ? 'true' : undefined}
              className={cn(
                'inline-flex h-9 shrink-0 items-center rounded-lg px-3 text-sm font-medium transition-colors',
                on
                  ? 'bg-primary-soft text-primary font-semibold'
                  : 'text-ink-muted hover:bg-surface-sunken',
              )}
            >
              {PRESET_LABEL[p]}
            </Link>
          )
        })}
      </div>

      <form action="/stats" className="flex flex-wrap items-center gap-2">
        {/* 기간 표시 문구 — 날짜 칸 위에 둘 이유가 없어 한 줄에 놓는다. */}
        <span className="text-ink-muted text-sm whitespace-nowrap" data-numeric>
          {period.from} ~ {period.to} ({days}일)
        </span>
        <input
          type="date"
          name="from"
          defaultValue={period.from}
          max={today}
          required
          aria-label="시작일"
          className="bg-surface text-ink border-border-strong focus:border-primary h-9 rounded-lg border px-3 text-sm outline-none"
        />
        <span className="text-ink-subtle text-sm">~</span>
        <input
          type="date"
          name="to"
          defaultValue={period.to}
          max={today}
          required
          aria-label="종료일"
          className="bg-surface text-ink border-border-strong focus:border-primary h-9 rounded-lg border px-3 text-sm outline-none"
        />
        <button type="submit" className={buttonClass('secondary', 'sm')}>
          기간 보기
        </button>
      </form>
    </Card>
  )
}
