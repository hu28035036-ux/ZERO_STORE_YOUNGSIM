---
name: run-app
description: ZERO STORE 앱을 실제로 띄우고 브라우저로 몰아본다. 화면을 확인하거나 스크린샷을 찍어야 할 때, "앱 실행해줘 / 띄워줘 / 화면 보여줘 / 스크린샷" 같은 요청에 쓴다. 개발 서버 실행, 로그인 통과, 헤드리스 Chromium 구동 방법과 이 환경에서 실제로 막히는 지점까지 담고 있다.
---

# ZERO STORE 실행하기

한 번 처음부터 다 밟아보고 적은 것이다. 순서대로 하면 된다.

## 0. 먼저 이걸 읽어라 — 이 환경에서 막히는 지점

**컨테이너의 egress 정책이 `*.supabase.co` 를 막고 있을 수 있다.** 막혀 있으면
앱은 정상적으로 뜨지만 로그인이 안 되고, 로그인 뒤 화면은 전부 못 본다.

확인:

```bash
node -e 'fetch("https://jnacpoqvnajjjfwwotnw.supabase.co/auth/v1/health").then(r=>console.log(r.status)).catch(e=>console.log("ERR",e.message))'
```

`403 Host not in allowlist` 가 나오면 **여기서 멈추고 사용자에게 보고해라.**
프록시 문서(`/root/.ccr/README.md`)가 egress 차단은 우회하지 말고 보고하라고
명시한다. 사용자가 환경 설정에서 호스트를 허용 목록에 넣어줘야 진행된다.

증상이 헷갈릴 수 있다: 차단되면 로그인 화면이 **"이메일 또는 비밀번호가 올바르지
않습니다"** 가 아니라 **"지금 로그인 서버에 연결할 수 없습니다"** 를 띄운다.
(전자가 뜨면 진짜 자격 증명 문제다 — 이 구분은 73d896e 에서 넣었다.)

## 1. 환경 변수

`.env.local` 이 없으면 빌드가 그 자리에서 실패한다 (`lib/supabase/env.ts`).
gitignore 라 저장소에 없다.

```
NEXT_PUBLIC_SUPABASE_URL=https://jnacpoqvnajjjfwwotnw.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<프로젝트 설정 > API 의 publishable 키>
```

## 2. 개발 서버

```bash
pnpm dev > /tmp/dev.log 2>&1 &
timeout 60 bash -c 'until curl -sf -o /dev/null http://localhost:3000/login; do sleep 1; done'
```

`sleep` 으로 기다리지 말고 포트를 폴링해라 — Turbopack 이 라우트를 요청 시점에
컴파일해서 첫 요청이 5초 넘게 걸린다.

멈출 때:

```bash
lsof -ti:3000 -sTCP:LISTEN | xargs -r kill
```

## 3. 로그인 계정

DB 에 데모 계정이 있다 (`docs/HANDOFF.md` 참고). 없으면 `auth.users` 에 직접
넣어야 하는데, 두 가지 함정이 있다:

- 비밀번호는 `extensions.crypt(pw, extensions.gen_salt('bf'))` — pgcrypto 가
  `extensions` 스키마에 있다
- `auth.identities.email` 은 **생성 컬럼**이라 INSERT 에 넣으면 에러가 난다.
  `identity_data` 의 `email` 에서 자동으로 나온다. `provider_id` 는 필수다.

```
demo@example.com / demo-1234!
```

## 4. 브라우저로 몰기

Playwright 는 **전역에만** 설치돼 있다 (프로젝트 `node_modules` 에는 없다).
Chromium 도 경로를 직접 줘야 한다.

- 모듈: `/opt/node22/lib/node_modules/playwright/index.mjs`
- 실행 파일: `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`

모바일 화면을 보려면 **모바일 UA 를 줘야 한다.** 이 앱은 반응형이 아니라
proxy 가 UA 로 판별해 서버에서 셸을 하나만 렌더링한다. 창 크기만 줄이면
데스크톱 셸이 그대로 나온다.

```js
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent: MOBILE_UA, // 빼면 데스크톱 셸이 나온다
})
const page = await ctx.newPage()

await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('input[name="email"]')
await page.fill('input[name="email"]', 'demo@example.com')
await page.fill('input[name="password"]', 'demo-1234!')
await page.click('button[type="submit"]')

// redirect() 는 클라이언트 내비게이션이라 'load' 가 안 뜬다.
// waitForURL 기본값으로 기다리면 타임아웃 난다. 결과를 직접 봐라.
await page.waitForTimeout(3000)
console.log('URL:', page.url())
console.log('메시지:', await page.locator('p[aria-live]').innerText())

await page.screenshot({ path: '/tmp/shot.png' })
await browser.close()
```

**찍은 스크린샷을 반드시 눈으로 봐라.** 빈 화면이면 실행 실패다.

## 5. 이 앱에서 특히 볼 것

- `/sell` — 담을 때마다 스캔 칸으로 포커스가 돌아오는지. 이 앱에서 제일 중요한
  상호작용이고 아직 실기기로 확인이 안 됐다.
- `/sell` 모바일 — 합계 막대가 하단 탭에 가리지 않는지
  (`sell-terminal.tsx` 의 `STICKY`).
- `/stock/new` 좁은 화면 — 옵션 조합이 여러 개일 때 변형 표가 읽히는지.

## 함정 모음

- **첫 `nav` 가 느리다.** Turbopack 이 라우트를 그때 컴파일한다. `waitForSelector`
  로 기다려라, `sleep` 말고.
- **`page.fill` 을 써라.** `el.value = …` 는 React onChange 를 안 태운다.
- **개발 오버레이의 "1 Issue" 배지**는 Playwright 가 입력에 주입하는
  `caret-color` 때문에 나는 hydration 경고다. 앱 버그가 아니다.
- **서버 컴포넌트 화면은 `h1` 이 뜰 때까지 기다려라.** 데이터를 받아야 그린다.
