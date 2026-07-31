import { getDevice } from '@/lib/server-device'

import { SaleLinesForm } from './sale-lines-form'

export const metadata = { title: '판매 적기' }

/**
 * 판매 목록을 직접 쓰는 화면. 옛 계산대(/sell)가 이 자리로 왔다.
 *
 * 오늘 요약 타일은 /sales 홈으로 옮겼다 — 이 화면은 "이미 일어난 판매를
 * 기록하는 손"이고 숫자를 읽는 눈은 홈이 맡는다. 같이 두면 좁은 화면에서
 * 장바구니가 접히는 자리를 요약이 차지한다.
 */
export default async function SaleNewPage() {
  const device = await getDevice()
  return <SaleLinesForm device={device} />
}
