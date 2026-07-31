// zxing 의 wasm 을 public/ 으로 복사한다.
//
// barcode-detector 의 기본값은 jsDelivr CDN 에서 wasm 을 받는 것이다. 그대로 두면
// CDN 이 막히거나 죽을 때 아이폰에서만 스캔이 조용히 실패한다 — 안드로이드는 내장
// 기능을 쓰므로 멀쩡해서 원인을 찾기도 어렵다. 우리가 서빙한다.
//
// 커밋하지 않고 빌드마다 다시 복사하는 이유: 커밋해두면 zxing-wasm 버전이 오를 때
// public/ 의 파일만 옛것으로 남는다. 그 어긋남은 아이폰에서만, 그것도 런타임에야
// 드러난다.
import { copyFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const require = createRequire(import.meta.url)

// zxing-wasm 은 이 프로젝트의 직접 의존성이 아니라 barcode-detector 의 의존성이다.
// pnpm 은 엄격 격리 구조라 이렇게 한 단계 건너 있는 패키지를 프로젝트 루트
// node_modules 로 끌어올리지 않는다 — 그래서 require.resolve('zxing-wasm/...') 를
// 여기서 바로 부르면 못 찾는다(실제로 이 저장소에서 그렇게 실패하는 것을 확인했다).
// barcode-detector 가 보는 node_modules 안에서부터 찾아야 zxing-wasm 이 잡힌다.
const barcodeDetectorEntry = require.resolve('barcode-detector')
const requireFromBarcodeDetector = createRequire(barcodeDetectorEntry)

// zxing-wasm 의 package.json 은 "exports" 맵에 "./package.json" 을 안 열어놔서
// require.resolve('zxing-wasm/package.json') 자체가 막힌다. 대신 zxing-wasm 이
// 스스로 내보내는 "./reader/zxing_reader.wasm" 서브패스를 바로 찾는다 — 이러면
// dist/reader 같은 내부 경로 구조를 우리가 따로 가정하지 않아도 된다.
const src = requireFromBarcodeDetector.resolve('zxing-wasm/reader/zxing_reader.wasm')

mkdirSync('public', { recursive: true })
copyFileSync(src, join('public', 'zxing_reader.wasm'))
console.log('copied zxing_reader.wasm -> public/')
