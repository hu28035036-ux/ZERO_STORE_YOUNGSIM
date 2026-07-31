'use client'

import { useRef, useState } from 'react'
import { Camera } from 'lucide-react'

import { BarcodeScanner } from '@/components/scanner/barcode-scanner'
import { Button } from '@/components/ui/button'

/**
 * GET 검색 폼 안에 끼우는 카메라 버튼.
 *
 * 스캔한 값을 같은 폼의 입력칸(inputName)에 넣고 폼을 통째로 제출한다.
 * URL 을 여기서 직접 조립하지 않는 이유: 폼에는 hidden 필드(필터·정렬)가 이미
 * 실려 있고, 그걸 여기서 다시 만들면 같은 지식이 폼과 버튼 두 곳에 생겨 한쪽만
 * 고치는 사고가 난다. requestSubmit() 은 폼이 아는 것을 폼이 보내게 한다.
 * movements/new 의 ScanSearchButton 이 router.replace 로 URL 을 만드는 것과
 * 다른 이유이기도 하다 — 거기는 버튼이 폼 밖에 있다.
 *
 * 폼은 ref 가 아니라 누른 순간의 currentTarget.form 으로 잡는다. Button 을
 * ref 로 잡으려면 Button 타입에 ref 를 뚫어야 해서 이쪽이 변경이 작다.
 */
export function ScanButton({ inputName }: { inputName: string }) {
  const [open, setOpen] = useState(false)
  const formRef = useRef<HTMLFormElement | null>(null)

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        className="shrink-0"
        aria-label="카메라로 바코드 검색"
        onClick={(event) => {
          formRef.current = event.currentTarget.form
          setOpen(true)
        }}
      >
        <Camera size={18} aria-hidden />
      </Button>
      <BarcodeScanner
        open={open}
        onDetect={(code) => {
          const form = formRef.current
          if (!form) return
          const input = form.elements.namedItem(inputName)
          if (input instanceof HTMLInputElement) {
            input.value = code
            form.requestSubmit()
          }
        }}
        onClose={() => setOpen(false)}
      />
    </>
  )
}
