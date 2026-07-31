import { getDevice } from '@/lib/server-device'

import { ImportFlow } from './import-flow'

export const metadata = { title: '판매기록 올리기' }

/**
 * 판매기록 파일 일괄 반영. 파일 읽기부터 확정까지 전부 클라이언트 상태기계
 * (ImportFlow)가 맡고, 서버는 매칭·확정 액션으로만 관여한다.
 */
export default async function SalesImportPage() {
  const device = await getDevice()

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-ink text-lg font-semibold tracking-tight">
        판매기록 올리기
      </h1>
      {device === 'mobile' ? (
        <p className="text-ink-muted text-sm leading-relaxed">
          엑셀 올리기는 PC 에서 하는 것이 편합니다. 휴대폰에서도 되긴 합니다.
        </p>
      ) : null}
      <ImportFlow device={device} />
    </div>
  )
}
