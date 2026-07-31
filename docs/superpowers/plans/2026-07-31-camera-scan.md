# 카메라 바코드 스캔 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 휴대폰 카메라로 바코드를 찍어 상품 등록과 입출고 등록의 입력을 채운다.

**Architecture:** 카메라 오버레이 컴포넌트 하나를 만들어 두 화면이 가져다 쓴다. 안드로이드 크롬은 브라우저 내장 `BarcodeDetector` 를, 아이폰 사파리는 `barcode-detector` 의 ponyfill(ZXing WebAssembly)을 **필요할 때만 동적으로** 불러온다.

**Tech Stack:** Next.js 16, React 19, `barcode-detector@3.2.1` (내부적으로 `zxing-wasm@3.1.1`)

## Global Constraints

- **테스트 러너가 없다.** `package.json` 에 test 스크립트도 jest/vitest 도 없다. 검증은 `tsc`/`eslint`/`next build` 와 Playwright 뿐이다. **테스트 파일을 만들지 마라** — 러너가 없어서 아무도 안 돌린다.
- **pnpm 11 정책 때문에 `pnpm lint`/`pnpm exec` 가 막힌다.** 바이너리를 직접 불러라: `./node_modules/.bin/tsc --noEmit`, `./node_modules/.bin/eslint`, `./node_modules/.bin/next build`, `./node_modules/.bin/next start --port 3100`.
- **주석은 한국어로, 무엇이 아니라 왜를 쓴다.** 특히 "이렇게 안 하면 무엇이 깨지는지".
- **색은 토큰으로** (`bg-danger`, `text-ink-muted`. `bg-red-500` 같은 원색 금지).
- **Next.js 16.** `params`/`searchParams` 는 Promise. middleware 가 아니라 `proxy.ts`.
- **외부 CDN 에 런타임 의존을 만들지 마라.** 이 앱은 지금까지 외부에서 받아오는 코드가 하나도 없다. `barcode-detector` 의 기본값은 jsDelivr 에서 wasm 을 받는 것인데, 그대로 두면 CDN 이 막히거나 죽을 때 **아이폰에서만** 스캔이 조용히 실패한다. wasm 은 우리가 서빙한다.
- **프로덕션 Supabase 직결.** 이 작업은 DB 를 건드리지 않는다.
- 브랜치 `claude/inventory-management-planning-fk6i1t`. main 을 건드리지 마라.
- 커밋 메시지는 한국어. 끝에 `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## 사실 확인 (2026-07-31 웹 검색으로 확인)

- **아이폰 사파리에는 `BarcodeDetector` 가 없다.** 애플이 넣을 조짐도 없다. WebAssembly 가 현실적인 유일한 경로다.
- 안드로이드 크롬에는 있다. 거기서는 wasm 을 받을 이유가 없다.
- `zxing_reader.wasm` 은 1.1MB 다. 아이폰에서 **스캐너를 처음 열 때만** 받으면 감당할 만하다. 화면 진입만으로 받게 하지 마라.

---

### Task 1: 스캐너 컴포넌트 + wasm 자급

**Files:**
- Create: `scripts/copy-zxing-wasm.mjs`
- Create: `components/scanner/barcode-scanner.tsx`
- Modify: `package.json` (build 스크립트에 wasm 복사를 끼운다)
- Modify: `.gitignore` (복사된 wasm 은 커밋하지 않는다)

**Interfaces:**
- Produces: `<BarcodeScanner open={boolean} onDetect={(code: string) => void} onClose={() => void} />`
  - `onDetect` 는 바코드를 읽은 **직후 한 번만** 불린다. 부른 뒤 스스로 닫힌다.
  - 카메라·해독기 준비는 `open` 이 true 가 될 때 시작하고, 닫힐 때 반드시 스트림을 끈다.

- [ ] **Step 1: wasm 복사 스크립트**

`scripts/copy-zxing-wasm.mjs`:

```js
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
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const pkg = require.resolve('zxing-wasm/package.json')
const src = join(dirname(pkg), 'dist', 'reader', 'zxing_reader.wasm')

mkdirSync('public', { recursive: true })
copyFileSync(src, join('public', 'zxing_reader.wasm'))
console.log('copied zxing_reader.wasm -> public/')
```

- [ ] **Step 2: `package.json` 의 build 를 고친다**

```json
"build": "node scripts/copy-zxing-wasm.mjs && next build",
```

`postinstall` 이 아니라 `build` 에 붙이는 이유: Vercel 은 빌드를 반드시 돌린다. postinstall 은 설치 방식에 따라 건너뛸 수 있고, 그러면 아이폰에서만 깨진다.

로컬 개발(`next dev`)에서도 필요하므로 `dev` 앞에도 같이 붙여라:
```json
"dev": "node scripts/copy-zxing-wasm.mjs && next dev",
```

- [ ] **Step 3: `.gitignore` 에 복사본을 넣는다**

```
# 빌드 때 node_modules 에서 복사해온다 (scripts/copy-zxing-wasm.mjs)
/public/zxing_reader.wasm
```

- [ ] **Step 4: 스캐너 컴포넌트**

`components/scanner/barcode-scanner.tsx` 를 만든다. 요구사항:

- `'use client'`
- `open` 이 true 가 될 때만 카메라를 켜고, false 가 되거나 언마운트될 때 **반드시** `stream.getTracks().forEach(t => t.stop())` 한다. 안 끄면 카메라 표시등이 계속 켜져 있고 다음에 열 때 실패한다
- `navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })` — 후면 카메라
- 해독기 고르기:
  ```ts
  // 안드로이드 크롬에는 내장 기능이 있다. 있으면 그걸 쓴다 — 1.1MB 를 받을 이유가 없다.
  // 아이폰 사파리에는 없어서(2026-07 확인) 그때만 ponyfill 을 불러온다.
  if ('BarcodeDetector' in globalThis) { /* 내장 */ }
  else {
    const { BarcodeDetector, prepareZXingModule } = await import('barcode-detector/ponyfill')
    // 기본값은 jsDelivr CDN 이다. 우리 것으로 바꾼다.
    await prepareZXingModule({ overrides: { locateFile: () => '/zxing_reader.wasm' } })
  }
  ```
  **`prepareZXingModule` 의 정확한 인자 모양은 `node_modules/barcode-detector` 의 타입 정의를 열어 확인하고 맞춰라.** 버전에 따라 다르다. 추측하지 마라.
- 읽을 형식은 소매 바코드로 좁힌다: `['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128']`. 다 켜면 느려지고 오인식이 는다
- 인식 루프는 `requestAnimationFrame` 이 아니라 `setInterval` 정도(150~250ms)로 돌려라. rAF 는 화면이 꺼지면 안 돈다
- 같은 코드가 연달아 여러 번 잡히므로 **첫 인식에서 즉시 멈추고 닫는다.** `onDetect` 가 두 번 불리면 장바구니에 두 번 담긴다
- 오버레이는 전체 화면. 닫기 버튼과 조준 틀(가운데 사각형)을 둔다
- **실패 상태를 각각 다른 문구로** 보여준다:
  | 상황 | 문구 |
  |---|---|
  | HTTPS 가 아님 (`!window.isSecureContext`) | 카메라는 보안 연결(https)에서만 열립니다 |
  | 권한 거부 (`NotAllowedError`) | 카메라 사용을 허용해야 찍을 수 있습니다. 브라우저 설정에서 이 사이트의 카메라를 켜 주세요 |
  | 카메라 없음 (`NotFoundError`) | 이 기기에서 카메라를 찾지 못했습니다 |
  | 그 밖 | 카메라를 열지 못했습니다 + `error.message` |

  **원인을 뭉뚱그리지 마라.** 이 저장소는 로그인 문구에서 같은 실수를 한 적이 있다(커밋 73d896e) — 원인을 감추는 문구는 사람을 엉뚱한 데로 보낸다.
- 접근성: 오버레이에 `role="dialog"` `aria-modal="true"` `aria-label="바코드 스캔"`, 닫기 버튼에 `aria-label`, 상태 문구는 `aria-live`

- [ ] **Step 5: 타입체크·lint·빌드**

```bash
./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/eslint && ./node_modules/.bin/next build
```

빌드 로그에 `copied zxing_reader.wasm -> public/` 이 찍히고 `public/zxing_reader.wasm` 이 생겨야 한다.

- [ ] **Step 6: 커밋**

```bash
git add scripts/copy-zxing-wasm.mjs components/scanner/barcode-scanner.tsx package.json .gitignore pnpm-lock.yaml
git commit -m "카메라로 바코드 읽는 조각"
```

---

### Task 2: 두 화면에 붙이기

**Files:**
- Modify: `app/(app)/stock/new/product-form.tsx` (변형별 바코드 칸 옆 카메라 버튼)
- Modify: `app/(app)/movements/new/movement-form.tsx` 또는 그 화면의 찾기 입력칸 (카메라 버튼)

**Interfaces:**
- Consumes: Task 1 의 `<BarcodeScanner open onDetect onClose />`

- [ ] **Step 1: 상품 등록에 붙인다**

`product-form.tsx` 의 변형별 바코드 `Input` 옆에 카메라 버튼을 둔다. 누르면 스캐너가 열리고, 읽으면 **그 변형의** 바코드 칸에 값이 들어가야 한다. 어느 줄에서 열었는지 기억해야 하므로 `scanningKey` 같은 상태 하나가 필요하다.

기존 `setDraft(key, { barcode: code })` 를 그대로 쓴다.

- [ ] **Step 2: 입출고 등록에 붙인다**

이 화면은 `?q=` 로 검색하고, 바코드가 한 건만 맞으면 자동으로 폼으로 넘어간다(`app/(app)/movements/new/page.tsx` 의 `target` 계산). 그러므로 스캔 결과로 **검색을 실행**하면 나머지는 기존 흐름이 처리한다.

찾기 입력칸 옆에 카메라 버튼을 두고, 읽으면 그 값으로 검색되게 한다.

- [ ] **Step 3: 타입체크·lint·빌드**

- [ ] **Step 4: 브라우저로 확인한다**

`.claude/skills/run-app/SKILL.md` 를 읽어라. **IDE 브라우저 패널로는 검증할 수 없다** (함정 모음의 `requestAnimationFrame`).

Playwright 로 확인할 것:
- 두 화면에 카메라 버튼이 뜬다
- 버튼을 누르면 오버레이가 열린다
- **카메라 권한을 막았을 때** 안내 문구가 뜬다 (`context.grantPermissions` 를 주지 않으면 된다)
- **가짜 카메라로 오버레이가 열리는 것**까지 확인한다. Chromium 에 `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream` 을 주면 권한 창 없이 가짜 영상이 물린다
- 닫으면 오버레이가 사라진다

**실제 바코드가 읽히는지는 확인할 수 없다.** 가짜 카메라 영상에는 바코드가 없다. 보고서에 그렇게 적어라 — 확인 못 한 것을 확인했다고 쓰지 마라.

- [ ] **Step 5: 커밋**

---

### Task 3: 문서와 배포

- [ ] **Step 1: `docs/HANDOFF.md`**
  - "만든 것" 에 카메라 스캔 추가
  - **검증하지 못한 것에 "실제 바코드가 실제 카메라로 읽히는지"를 반드시 적어라.** 이게 이 기능의 핵심인데 자동 검증이 불가능하다
  - wasm 을 빌드 때 복사한다는 것과 그 이유(CDN 의존 회피, 버전 어긋남 방지)
  - 아이폰만 1.1MB 를 받는다는 것
- [ ] **Step 2: `README.md`** 에 카메라 스캔과 wasm 복사 단계를 한 대목
- [ ] **Step 3: 커밋하고 푸시**
- [ ] **Step 4: 프로덕션 배포는 사용자에게 물어보고** (`vercel --prod`)
