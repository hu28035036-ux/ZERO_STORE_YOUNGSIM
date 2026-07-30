/**
 * 기기 구분.
 *
 * 이 앱은 모바일과 데스크톱이 반응형으로 같은 화면을 늘였다 줄였다 하는 구조가 아니다.
 * 휴대폰은 "바코드 찍어서 판다"가 중심이고, 데스크톱은 "표로 보고 분석한다"가 중심이라
 * 화면 구성 자체가 다르다.
 *
 * 그래서 CSS 로 양쪽을 다 그려놓고 숨기는 대신, 서버에서 한쪽만 골라 렌더링한다.
 * 계산대에서 쓰는 화면에 안 보이는 마크업까지 실어 보낼 이유가 없다.
 */
export type Device = 'mobile' | 'desktop'

/** proxy 가 심고 서버 컴포넌트가 읽는 요청 헤더 */
export const DEVICE_HEADER = 'x-device'

/** 사용자가 직접 고른 화면. 태블릿처럼 애매한 기기를 위해 열어둔다. */
export const DEVICE_COOKIE = 'device-view'

// 태블릿은 데스크톱으로 본다. 화면이 넓어서 표가 읽히고,
// 아이패드 UA 에는 'Mobile' 이 없어서 아래 정규식에도 걸리지 않는다.
const MOBILE_UA = /Android|iPhone|iPod|Windows Phone|BlackBerry|Opera Mini|IEMobile/i

export function detectDevice(userAgent: string | null | undefined): Device {
  if (!userAgent) return 'desktop'
  return MOBILE_UA.test(userAgent) ? 'mobile' : 'desktop'
}

export function isDevice(value: string | null | undefined): value is Device {
  return value === 'mobile' || value === 'desktop'
}
