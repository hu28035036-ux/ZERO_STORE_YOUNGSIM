'use client'

import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

/**
 * 스캔 대상 바코드 형식을 소매 유통에서 실제로 쓰는 다섯 가지로 좁힌다.
 * ZXing 이 지원하는 형식을 다 켜면(QR·PDF417·Aztec 등) 프레임마다 해독이
 * 오래 걸리고, 상품과 무관한 코드까지 잡아 오인식이 는다.
 */
type BarcodeFormat = 'ean_13' | 'ean_8' | 'upc_a' | 'upc_e' | 'code_128'
const FORMATS: BarcodeFormat[] = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128']

/**
 * 인식 주기. requestAnimationFrame 을 안 쓰는 이유는 화면이 꺼지거나 탭이
 * 백그라운드로 가면 rAF 콜백이 멈추기 때문이다 — 권한 창 등으로 잠깐 포커스를
 * 잃었다 돌아오면 스캐너가 죽은 것처럼 보이는 사고로 이어진다. setInterval 은
 * 백그라운드에서도(느려질 뿐) 계속 돈다.
 */
const SCAN_INTERVAL_MS = 200

/**
 * 네이티브 BarcodeDetector 와 barcode-detector 의 ponyfill 이 공통으로 만족하는
 * 최소 인터페이스. rawValue 외에는 안 쓰므로 그만큼만 타입을 요구해서 둘을
 * 같은 변수로 다룰 수 있게 한다.
 */
interface DetectorLike {
  detect(image: HTMLVideoElement): Promise<{ rawValue: string }[]>
}

type ScannerState =
  | { status: 'starting' }
  | { status: 'scanning' }
  | { status: 'error'; message: string }

/**
 * 카메라를 못 연 이유를 실패 유형별로 다른 문구로 보여준다.
 *
 * 이 저장소는 로그인 실패 문구를 원인과 무관하게 "비밀번호가 틀렸습니다" 하나로
 * 뭉뚱그렸다가, 실제로는 인증 서버에 못 붙는 상황을 비밀번호 탓으로 돌려 한참
 * 헤맨 적이 있다(커밋 73d896e). 카메라도 같은 실수를 반복하지 않는다 — 권한
 * 거부/카메라 없음/그 밖을 구분해야 사람이 무엇을 해야 할지 알 수 있다.
 */
function describeFailure(error: unknown): string {
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return '카메라 사용을 허용해야 찍을 수 있습니다. 브라우저 설정에서 이 사이트의 카메라를 켜 주세요'
  }
  if (error instanceof DOMException && error.name === 'NotFoundError') {
    return '이 기기에서 카메라를 찾지 못했습니다'
  }
  const detail = error instanceof Error ? error.message : String(error)
  return `카메라를 열지 못했습니다: ${detail}`
}

/**
 * 브라우저가 가진 바코드 해독기를 고른다.
 *
 * 안드로이드 크롬에는 BarcodeDetector 가 내장돼 있다 — 있으면 그걸 쓴다. 1.1MB
 * wasm 을 받을 이유가 없다. 아이폰 사파리에는 없어서(2026-07 확인) 그때만
 * barcode-detector 의 ponyfill(ZXing WebAssembly)을 동적으로 불러온다. 정적
 * import 로 두면 이 컴포넌트를 쓰는 모든 기기가 안드로이드에서도 wasm 을 물게
 * 되므로, 반드시 여기서 필요한 순간에만 불러온다.
 */
async function createDetector(): Promise<DetectorLike> {
  if ('BarcodeDetector' in globalThis) {
    const Native = (
      globalThis as typeof globalThis & {
        BarcodeDetector: new (options: { formats: BarcodeFormat[] }) => DetectorLike
      }
    ).BarcodeDetector
    return new Native({ formats: FORMATS })
  }

  const { BarcodeDetector: Ponyfill, prepareZXingModule } = await import(
    'barcode-detector/ponyfill'
  )

  // prepareZXingModule 의 기본 locateFile 은 jsDelivr CDN 에서 wasm 을 받는다.
  // 이 앱은 지금까지 외부 CDN 에 런타임으로 의존하는 코드가 하나도 없다 — 그대로
  // 두면 CDN 이 막히거나 죽을 때 아이폰에서만, 그것도 조용히 스캔이 실패한다
  // (안드로이드는 내장 기능을 쓰므로 멀쩡해서 원인 찾기가 특히 어렵다).
  // scripts/copy-zxing-wasm.mjs 가 빌드 때 복사해 둔 우리 public/zxing_reader.wasm
  // 을 보게 한다.
  //
  // fireImmediately: true 로 실제 로딩이 끝날 때까지 여기서 기다린다. 기본값
  // (false)은 모듈 인스턴스화를 첫 인식 호출까지 미루는데, 그러면 wasm 로딩
  // 실패가 setInterval 콜백 안에서야 조용히 던져져 "카메라를 열지 못했습니다"
  // 로 드러나지 않고 그냥 계속 아무것도 안 읽히는 것처럼 보인다.
  await prepareZXingModule({
    overrides: { locateFile: () => '/zxing_reader.wasm' },
    fireImmediately: true,
  })

  return new Ponyfill({ formats: FORMATS })
}

/**
 * 카메라로 바코드를 찍는 전체 화면 오버레이.
 *
 * open 이 true 가 될 때 카메라를 열고, false 가 되거나 언마운트되면 반드시
 * 스트림을 끈다 — 안 그러면 카메라 표시등이 계속 켜져 있고, 일부 기기는 다음에
 * 열 때 트랙을 못 얻어 실패한다. onDetect 는 첫 인식 직후 한 번만 불리고 스스로
 * onClose 를 불러 닫힌다 — 같은 바코드가 초당 여러 번 잡히므로, 두 번 부르면
 * 호출부(장바구니 등)에 값이 두 번 들어간다.
 */
export function BarcodeScanner({
  open,
  onDetect,
  onClose,
}: {
  open: boolean
  onDetect: (code: string) => void
  onClose: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [state, setState] = useState<ScannerState>({ status: 'starting' })

  // 매 렌더마다 부모가 새 함수를 넘겨도(흔히 인라인 화살표 함수) 아래 effect 가
  // 재실행되면 안 된다 — 재실행되면 카메라를 껐다 켜는 일이 렌더마다 반복된다.
  // 그래서 effect 의존성에는 open 만 두고, 콜백은 항상 최신 값을 ref 로 읽는다.
  const onDetectRef = useRef(onDetect)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onDetectRef.current = onDetect
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return

    // stopped 가 true 라는 것은 teardown() 이 이미 실행됐다는 뜻이다(아래에서
    // stopped 를 true 로 만드는 곳은 teardown() 뿐이다) — 그래서 await 뒤에서
    // stopped 만 확인하면 스트림·인터벌을 다시 정리할 필요가 있는지 알 수 있다.
    let stopped = false
    let busy = false
    let intervalId: ReturnType<typeof setInterval> | undefined

    function teardown() {
      stopped = true
      if (intervalId !== undefined) clearInterval(intervalId)
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }

    async function start() {
      setState({ status: 'starting' })

      if (!window.isSecureContext) {
        setState({ status: 'error', message: '카메라는 보안 연결(https)에서만 열립니다' })
        return
      }

      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        })
      } catch (err) {
        if (stopped) return
        setState({ status: 'error', message: describeFailure(err) })
        return
      }

      if (stopped) {
        // 권한 창이 떠 있는 사이 닫혔다 — teardown() 은 이 스트림의 존재를
        // 몰랐으므로(그때는 아직 못 받았으니) 여기서 직접 꺼야 표시등이 안 남는다.
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream

      try {
        const video = videoRef.current
        if (!video) throw new Error('비디오 엘리먼트를 찾지 못했습니다')

        video.srcObject = stream
        // JSX 의 muted 속성만으로는 일부 브라우저에서 자동재생 시점까지 반영되지
        // 않는다 — React 가 muted 를 attribute 로만 설정하고 미디어 엘리먼트의
        // 런타임 .muted 프로퍼티는 안 바뀌는 경우가 있어서, 여기서 직접 건드려
        // 확실히 무음으로 재생되게 한다.
        video.muted = true
        await video.play()

        const detector = await createDetector()
        if (stopped) return
        setState({ status: 'scanning' })

        async function tick() {
          if (stopped || busy) return
          const videoEl = videoRef.current
          if (!videoEl || videoEl.readyState < videoEl.HAVE_CURRENT_DATA) return

          busy = true
          try {
            const results = await detector.detect(videoEl)
            if (stopped || results.length === 0) return
            // 같은 바코드가 초당 여러 번 잡힌다. busy 로 한 번에 하나만 돌게
            // 막고, 첫 인식에서 바로 interval 을 세우고 스트림을 꺼야
            // onDetect 가 두 번 불리지 않는다.
            const code = results[0].rawValue
            teardown()
            onDetectRef.current(code)
            onCloseRef.current()
          } catch {
            // 프레임 하나 인식 실패는 무시한다 — 다음 tick 에서 다시 시도된다.
          } finally {
            busy = false
          }
        }

        intervalId = setInterval(() => {
          void tick()
        }, SCAN_INTERVAL_MS)
      } catch (err) {
        if (stopped) return
        teardown()
        setState({ status: 'error', message: describeFailure(err) })
      }
    }

    start()

    return teardown
  }, [open])

  if (!open) return null

  return (
    // 카메라 뷰파인더라 라이트/다크 테마 토큰을 따르지 않는다 — 항상 어두운
    // 배경에 흰 글자여야 실제 카메라 영상과 자연스럽게 겹치고 밝은 곳에서도
    // 조준 틀이 잘 보인다. 네이티브 카메라 앱이 시스템 테마와 무관하게 늘
    // 어두운 것과 같은 이유다.
    <div
      role="dialog"
      aria-modal="true"
      aria-label="바코드 스캔"
      className="fixed inset-0 z-50 flex flex-col bg-black"
    >
      <video
        ref={videoRef}
        aria-hidden="true"
        playsInline
        muted
        className="absolute inset-0 h-full w-full object-cover"
      />

      {/* 조준 틀. 장식일 뿐 실제 인식 범위를 제한하지는 않는다. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <div className="aspect-[3/2] w-[75%] max-w-sm rounded-2xl border-4 border-white/80" />
      </div>

      {/* relative + z-10 이 있어야 이 안의 닫기 버튼이 absolute 인 비디오/조준틀
         보다 위에서 그려진다 — z-index 가 없으면 static 문서 순서상 비디오 뒤로
         깔려 눌리지 않는다. */}
      <div className="relative z-10 flex justify-end p-4">
        <button
          type="button"
          onClick={onClose}
          aria-label="바코드 스캔 닫기"
          className="flex h-touch w-touch items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70 active:bg-black/80"
        >
          <X className="h-6 w-6" />
        </button>
      </div>

      <div
        aria-live="polite"
        className="relative z-10 mt-auto flex flex-col items-center gap-3 p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-center"
      >
        {state.status === 'starting' && <p className="text-white">카메라를 여는 중…</p>}
        {state.status === 'scanning' && (
          <p className="text-white">바코드를 사각형 안에 맞춰 주세요</p>
        )}
        {state.status === 'error' && (
          <>
            <p className="text-white">{state.message}</p>
            <button
              type="button"
              onClick={onClose}
              className="h-touch rounded-lg bg-white px-5 text-[0.9375rem] font-medium text-black hover:bg-white/90 active:bg-white/80"
            >
              닫기
            </button>
          </>
        )}
      </div>
    </div>
  )
}
