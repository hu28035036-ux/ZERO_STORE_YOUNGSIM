'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Camera } from 'lucide-react'

import { BarcodeScanner } from '@/components/scanner/barcode-scanner'
import { Button } from '@/components/ui/button'

/**
 * 찾기 입력칸 옆 카메라 버튼.
 *
 * 스캔한 값으로 여기서 직접 상품을 조회하지 않는다. `router.push` 로 이 화면의
 * `?q=` 검색 경로를 그대로 태워서, page.tsx 에 이미 있는 로직("검색 결과가 한
 * 건이면 목록을 거치지 않고 바로 폼으로")을 공짜로 얻는다 — 조회 조건이 여기와
 * page.tsx 두 곳에 따로 있으면 나중에 한쪽만 고치는 사고가 난다.
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
        onDetect={(code) => router.push(`/movements/new?q=${encodeURIComponent(code)}`)}
        onClose={() => setOpen(false)}
      />
    </>
  )
}
