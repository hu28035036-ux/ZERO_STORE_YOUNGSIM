'use client'

import { ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'

import { backAction } from '@/lib/back-navigation'
import { cn } from '@/lib/cn'

/**
 * 상단 탭 줄 맨 왼쪽의 "뒤로가기" — 직전 화면으로 간다(2026-09-28 사용자 요청).
 *
 * 설치한 앱(홈 화면에 추가)으로 켜면 브라우저의 뒤로 버튼이 없어서, 화면을 건너간 뒤 돌아올
 * 길이 화면 안의 링크뿐이었다. 탭이 아니라 동작이라 활성 밑줄이 없고, 탭 목록(ul) 밖에 선다.
 * 돌아갈 곳이 없을 때 홈으로 가는 판단은 lib/back-navigation.ts 에 있다(테스트 포함).
 */
export function BackButton({ compact }: { compact: boolean }) {
  const router = useRouter()

  function goBack() {
    // Navigation API 는 크롬 계열에만 있다 — 없으면 undefined 로 넘겨 history 길이로 가늠하게 한다.
    const nav = (window as Window & { navigation?: { canGoBack?: boolean } }).navigation
    if (backAction({ canGoBack: nav?.canGoBack, historyLength: window.history.length }) === 'back') {
      router.back()
    } else {
      router.push('/')
    }
  }

  return (
    <button
      type="button"
      onClick={goBack}
      className={cn(
        'text-ink-muted flex h-11 shrink-0 items-center rounded-t-lg font-medium transition-colors',
        'hover:bg-ink/[0.06] active:bg-ink/[0.12]',
        // 탭과 같은 꼴(아이콘 위·글자 아래)로 맞춘다. 56px 는 "뒤로가기" 네 글자가 한 줄로 들어가는 폭.
        compact ? 'w-14 flex-col justify-center gap-0.5 text-[0.6875rem]' : 'gap-2 px-3 text-sm',
      )}
    >
      <ArrowLeft size={compact ? 16 : 18} aria-hidden />
      뒤로가기
    </button>
  )
}
