import type { MetadataRoute } from 'next'

/**
 * 휴대폰에 설치(홈 화면에 추가)할 때 쓰는 정보 — 2026-10-19 사용자 요청: 설치한 아이콘이 앱 로고
 * (상자와 체크리스트)로 나와야 한다. 안드로이드 크롬은 이 파일이 있어야 "앱 설치"를 띄우고, 설치
 * 아이콘도 여기 목록에서 고른다.
 *
 * 아이콘 셋은 `components/shell/brand-logo.tsx` 의 로고와 같은 그림이다.
 * - any: 원 바깥이 투명한 로고 그대로. PC 크롬에서 설치할 때와 안드로이드 시작 화면이 쓴다.
 * - maskable: 흰 바탕을 꽉 채우고 로고는 가운데 72%. 안드로이드는 런처마다 아이콘을 원·둥근 네모로
 *   잘라 내는데, 어떤 모양에서도 안 잘리는 자리는 가운데 지름 80% 원뿐이다. 이게 없으면 안드로이드가
 *   any 아이콘을 흰 판 위에 작게 줄여 얹는다.
 * 아이폰은 이 목록이 아니라 `app/apple-icon.png` 를 쓴다.
 *
 * 이미 홈 화면에 추가해 둔 아이콘은 저절로 안 바뀐다 — 지우고 다시 추가해야 새 로고가 된다.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ZERO STORE',
    short_name: 'ZERO STORE',
    description: '영심 스토어 재고·판매 관리',
    start_url: '/',
    // 주소창 없이 앱처럼 연다. 브라우저 뒤로 단추가 사라져도 탭 줄 맨 왼쪽에 "← 뒤로가기"가 있다.
    display: 'standalone',
    // layout.tsx 의 themeColor(밝은 화면)와 같은 값 — 설치 앱을 켤 때 잠깐 보이는 첫 화면 바탕이다.
    background_color: '#f6f7f9',
    theme_color: '#f6f7f9',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
