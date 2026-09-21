import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

import { cn } from '@/lib/cn'

/**
 * 모든 화면의 머리글. 작은 대문자 라벨(eyebrow) → 제목 → 한 줄 설명 → 오른쪽 동작.
 *
 * 화면마다 h1 을 따로 그리면 크기와 여백이 조금씩 어긋나서 화면을 오갈 때
 * 제목이 "튀는" 느낌이 난다. 리디자인(2026-09)에서 머리글을 한 조각으로 모았다.
 *
 * eyebrow 는 영문 대문자다 — 한글로 두면 제목과 같은 뜻을 두 번 읽게 되고,
 * 영문 소문자는 대문자만큼 "라벨"로 보이지 않는다. 뜻을 전달하는 건 h1 이고
 * eyebrow 는 화면의 구역을 알리는 장식에 가깝다.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  backHref,
  backLabel,
  className,
}: {
  eyebrow?: string
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  /** 있으면 제목 왼쪽에 뒤로 가기 링크를 그린다 (상세·수정 화면). */
  backHref?: string
  backLabel?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-2">
        {backHref ? (
          <Link
            href={backHref}
            aria-label={backLabel ?? '뒤로'}
            className="text-ink-muted hover:bg-surface hover:text-ink mt-1 -ml-2 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors"
          >
            <ChevronLeft size={20} aria-hidden />
          </Link>
        ) : null}
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-primary mb-1.5 text-[0.6875rem] font-bold tracking-[0.18em]">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="text-ink text-2xl font-semibold tracking-tight">{title}</h1>
          {description ? (
            <p className="text-ink-muted mt-1.5 text-sm leading-relaxed">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  )
}
