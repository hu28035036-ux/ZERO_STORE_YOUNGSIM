import Link from 'next/link'

import { cn } from '@/lib/cn'
import { todayInSeoul } from '@/lib/constants'

import { periodHref, PRESET_LABEL, PRESETS, type Period } from './period'

/**
 * 기간 선택.
 *
 * 화면 맨 위에 한 줄로 둔다. 아래의 모든 숫자가 같은 기간을 본다 — 카드마다
 * 제 기간을 갖게 하면 나란히 놓인 두 숫자가 서로 다른 기간이라 비교가 안 된다.
 */
export function PeriodPicker({ period }: { period: Period }) {
  const today = todayInSeoul()

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 overflow-x-auto">
        {PRESETS.map((p) => {
          const on = period.preset === p
          return (
            <Link
              key={p}
              href={periodHref({ preset: p })}
              aria-current={on ? 'true' : undefined}
              className={cn(
                'inline-flex h-9 shrink-0 items-center rounded-full border px-3.5 text-sm font-medium transition-colors',
                on
                  ? 'bg-primary text-primary-ink border-primary'
                  : 'bg-surface text-ink-muted border-border-strong hover:bg-surface-sunken',
              )}
            >
              {PRESET_LABEL[p]}
            </Link>
          )
        })}
      </div>

      <form action="/stats" className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-ink-muted text-xs">시작일</span>
          <input
            type="date"
            name="from"
            defaultValue={period.from}
            max={today}
            required
            className="bg-surface text-ink border-border-strong focus:border-primary h-touch rounded-lg border px-3 text-base outline-none"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-ink-muted text-xs">종료일</span>
          <input
            type="date"
            name="to"
            defaultValue={period.to}
            max={today}
            required
            className="bg-surface text-ink border-border-strong focus:border-primary h-touch rounded-lg border px-3 text-base outline-none"
          />
        </label>
        <button
          type="submit"
          className="bg-surface text-ink border-border-strong hover:bg-surface-sunken h-touch inline-flex items-center rounded-lg border px-4 text-[0.9375rem] font-medium transition-colors"
        >
          기간 보기
        </button>
      </form>
    </div>
  )
}
