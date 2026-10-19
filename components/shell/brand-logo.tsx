import Image from 'next/image'

import { cn } from '@/lib/cn'

import logo from './logo.png'

/**
 * 앱 로고 — 상자와 체크리스트(2026-10-19 사용자가 준 그림). 상단 바와 로그인 화면이 같이
 * 쓴다. 두 곳이 같은 그림이라야 로그인 화면과 안쪽 화면이 한 앱으로 보인다.
 *
 * `logo.png` 는 받은 그림을 원에 맞춰 자르고 원 바깥만 투명하게 한 것이다. 바깥 흰 여백을
 * 남기면 회색 로그인 바탕과 어두운 화면의 상단 바에서 흰 네모 판이 드러난다. 선은 원본보다
 * 아주 조금 굵혔다 — 상단 바 32px 에서는 원본 굵기가 1픽셀이 안 돼 흐린 회색으로 뭉개졌다.
 * 브라우저 탭 아이콘(`app/favicon.ico`)과 휴대폰 설치 아이콘(`app/apple-icon.png`,
 * `public/icons/*` — `app/manifest.ts`)도 같은 그림에서 만들었다. 로고를 바꾸면 그것들도 같이 바꿔라.
 */
export function BrandLogo({ size, className }: { size: number; className?: string }) {
  return (
    <Image
      src={logo}
      // 바로 옆에 가게 이름·ZERO STORE 글자가 있어 읽어 줄 내용이 겹친다.
      alt=""
      width={size}
      height={size}
      // 192px 한 장이면 3배 화면까지 또렷하다. 최적화 서버를 태우면 크기마다 변환만 늘어난다.
      unoptimized
      // 모든 화면 맨 위라 늦게 받을 이유가 없다. 기본값(lazy)이면 상단 바에 빈 자리가 잠깐 보인다.
      loading="eager"
      className={cn('shrink-0', className)}
    />
  )
}
