'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Camera } from 'lucide-react'

import { BarcodeScanner } from '@/components/scanner/barcode-scanner'
import { Button } from '@/components/ui/button'

/**
 * 찾기 입력칸 옆 카메라 버튼.
 *
 * 스캔한 값으로 여기서 직접 상품을 조회하지 않는다. `router.replace` 로 이
 * 화면의 `?q=` 검색 경로를 그대로 태워서, page.tsx 에 이미 있는 로직("검색
 * 결과가 한 건이면 목록을 거치지 않고 바로 폼으로")을 공짜로 얻는다 — 조회
 * 조건이 여기와 page.tsx 두 곳에 따로 있으면 나중에 한쪽만 고치는 사고가 난다.
 *
 * push 가 아니라 replace 인 이유: 스캐너는 한 번 찍고 끝나는 게 아니라 "아니다,
 * 다시" 하며 여러 번 열 수 있다. push 로 쌓으면 스캔할 때마다 히스토리 항목이
 * 늘어 뒤로가기를 누르면 화면이 안 바뀌는 것처럼 보이면서 스캔 기록을 하나씩
 * 되밟는다 — 사용자 입장에선 그냥 "이전 화면으로" 한 번에 나가고 싶을 뿐이다.
 */
export function ScanSearchButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        aria-label="카메라로 바코드 찾기"
        onClick={() => setOpen(true)}
      >
        <Camera size={18} aria-hidden />
      </Button>
      <BarcodeScanner
        open={open}
        onDetect={(code) => router.replace(`/movements?q=${encodeURIComponent(code)}`)}
        onClose={() => setOpen(false)}
      />
    </>
  )
}
