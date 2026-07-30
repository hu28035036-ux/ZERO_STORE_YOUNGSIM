import 'server-only'

import { headers } from 'next/headers'
import { cache } from 'react'

import { DEVICE_HEADER, isDevice, type Device } from '@/lib/device'

/**
 * proxy 가 심어둔 기기 구분을 읽는다.
 *
 * 헤더가 없다는 건 proxy 를 거치지 않았다는 뜻이다 (matcher 에서 빠졌거나,
 * 파일 이름이 잘못됐거나). 그때는 데스크톱으로 본다 — 표가 좁은 화면에서
 * 깨지는 편이, 큰 화면에 휴대폰 UI 가 뜨는 것보다 원인을 찾기 쉽다.
 */
export const getDevice = cache(async (): Promise<Device> => {
  const value = (await headers()).get(DEVICE_HEADER)
  return isDevice(value) ? value : 'desktop'
})
