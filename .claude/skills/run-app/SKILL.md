---
name: run-app
description: ZERO STORE 앱을 실제로 띄우고 브라우저로 몰아본다. 화면을 확인하거나 스크린샷을 찍어야 할 때, "앱 실행해줘 / 띄워줘 / 화면 보여줘 / 스크린샷" 같은 요청에 쓴다. 개발 서버 실행, 로그인 통과, 헤드리스 Chromium 구동 방법과 이 환경에서 실제로 막히는 지점까지 담고 있다.
---

# ZERO STORE 실행하기

한 번 처음부터 다 밟아보고 적은 것이다. 순서대로 하면 된다.

## 0. 먼저 이걸 읽어라 — 이 환경에서 막히는 지점

**컨테이너의 egress 정책이 `*.supabase.co` 를 막고 있을 수 있다.** 막혀 있으면
앱은 정상적으로 뜨지만 로그인이 안 되고, 로그인 뒤 화면은 전부 못 본다.
(사용자 PC 에서 직접 돌릴 때는 안 막힌다. 컨테이너에서만 겪는 문제다.)

확인:

```bash
node -e 'fetch("https://jnacpoqvnajjjfwwotnw.supabase.co/auth/v1/health").then(r=>console.log(r.status)).catch(e=>console.log("ERR",e.message))'
```

`403 Host not in allowlist` 가 나오면 **여기서 멈추고 사용자에게 보고해라.**
프록시 문서(`/root/.ccr/README.md`)가 egress 차단은 우회하지 말고 보고하라고
명시한다. 사용자가 환경 설정에서 호스트를 허용 목록에 넣어줘야 진행된다.
`401 No API key found` 가 나오면 **닿은 것이다** — 통과다.

증상이 헷갈릴 수 있다: 차단되면 로그인 화면이 **"아이디 또는 비밀번호가 올바르지
않습니다"** 가 아니라 **"지금 로그인 서버에 연결할 수 없습니다"** 를 띄운다.
(전자가 뜨면 진짜 자격 증명 문제다 — 이 구분은 73d896e 에서 넣었다.)
**다만 뒤 문구는 egress 차단만 뜻하지 않는다.** 4xx 가 아닌 모든 오류가 저 문구로
나오므로 GoTrue 500 도 똑같이 보인다. 3절의 토큰 컬럼 함정을 함께 봐라.

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

**화면은 아이디만 받고, Supabase 에는 여전히 이메일이 저장된다.** Supabase Auth
자체는 이메일로만 로그인하므로, `lib/username.ts` 의 `usernameToEmail()` 이
서버에서 입력값 뒤에 `@zerostore.kr` 을 붙여 이메일을 만든다(이미 `@` 가
있으면 그대로 둔다). `auth.users.email` 에 실제로 들어가는 값은 항상 이 변환을
거친 이메일이다. **새 계정을 만들 때는 이메일을 `<아이디>@zerostore.kr` 로
지어야** 그 아이디로 로그인이 된다 — 대시보드에서 이메일을 다른 도메인으로
지으면(예: `sujin@gmail.com`) 로그인 칸에 `sujin` 을 쳐도 서버가 조회하는
이메일은 `sujin@zerostore.kr` 이라 어긋난다.

DB 에 로그인 계정이 있다 (`docs/HANDOFF.md` 참고). 없으면 `auth.users` 에 직접
넣어야 하는데, **세 가지** 함정이 있다:

- 비밀번호는 `extensions.crypt(pw, extensions.gen_salt('bf'))` — pgcrypto 가
  `extensions` 스키마에 있다
- `auth.identities.email` 은 **생성 컬럼**이라 INSERT 에 넣으면 에러가 난다.
  `identity_data` 의 `email` 에서 자동으로 나온다. `provider_id` 는 필수다.
- **토큰 컬럼을 NULL 로 두면 안 된다.** GoTrue 는 이 컬럼들을 Go 의
  non-nullable string 으로 스캔해서, NULL 이면 로그인 요청이 500 으로 죽는다
  (`error finding user: sql: Scan error on column index 3, name
  "confirmation_token": converting NULL to string is unsupported`).
  빈 문자열이 GoTrue 가 기대하는 값이다. 실제로 이 함정 때문에 로그인이 통째로
  막혀 있었다 — 계정은 멀쩡해 보이고 비밀번호도 맞는데 500 만 났다.

```sql
-- 계정을 만든 뒤 반드시 한 번 돌려라. 이미 만든 계정을 고칠 때도 같은 쿼리다.
-- 계정을 지우고 다시 만들지 마라: 기존 데이터의 created_by 가 user id 를 참조한다.
update auth.users set
  confirmation_token         = coalesce(confirmation_token, ''),
  recovery_token             = coalesce(recovery_token, ''),
  email_change_token_new     = coalesce(email_change_token_new, ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  email_change               = coalesce(email_change, ''),
  phone_change               = coalesce(phone_change, ''),
  phone_change_token         = coalesce(phone_change_token, ''),
  reauthentication_token     = coalesce(reauthentication_token, '')
where email = '<만든 이메일>';
```

증상 구분: 이 경우 화면에는 **"지금 로그인 서버에 연결할 수 없습니다"** 가 뜬다
(500 은 4xx 가 아니므로). 즉 이 문구는 egress 차단만 뜻하지 않는다. 문구만 보고
네트워크를 의심하지 말고 `get_logs(service: 'auth')` 로 실제 오류를 봐라.

로그인 화면(아이디 칸)에 치는 값. Supabase 에는 `cwyh5088@zerostore.kr` 로
저장돼 있다 — 이메일로 로그인하려 하면 막힌다, 위 설명대로 아이디만 쳐야 한다.

```
cwyh5088 / dnjs1ghk5.
```

## 4. 브라우저로 몰기

**IDE 에 붙은 브라우저 패널로는 이 앱을 검증할 수 없다.** 아래 "함정 모음"의
`requestAnimationFrame` 항목을 먼저 읽어라 — `/stock`·`/movements`·`/stats` 가
로딩 스켈레톤에서 영영 멈춘 것처럼 보이고, 앱 버그로 착각하기 딱 좋다.
**Playwright 로 진짜 브라우저를 띄워라.**

컨테이너에는 Playwright 가 **전역에만** 있다 (프로젝트 `node_modules` 에는 없다).

- 모듈: `/opt/node22/lib/node_modules/playwright/index.mjs`
- 실행 파일: `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`

사용자 PC(Windows) 에는 없다. 저장소를 건드리지 않도록 작업 폴더 밖에 깐다:

```bash
mkdir -p /tmp/pw && cd /tmp/pw && npm init -y && npm install playwright
./node_modules/.bin/playwright install chromium
# 이러면 executablePath 를 줄 필요가 없다. chromium.launch() 만 부르면 된다.
```

모바일 화면을 보려면 **모바일 UA 를 줘야 한다.** 이 앱은 반응형이 아니라
proxy 가 UA 로 판별해 서버에서 셸을 하나만 렌더링한다. 창 크기만 줄이면
데스크톱 셸이 그대로 나온다. (`device-view` 쿠키로도 고를 수 있다 —
`lib/device.ts` 의 `DEVICE_COOKIE`.)

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
await page.waitForSelector('input[name="username"]')
await page.fill('input[name="username"]', 'cwyh5088')
await page.fill('input[name="password"]', 'dnjs1ghk5.')
await page.click('button[type="submit"]')

// redirect() 는 클라이언트 내비게이션이라 'load' 가 안 뜬다.
// waitForURL 기본값으로 기다리면 타임아웃 난다. 결과를 직접 봐라.
await page.waitForTimeout(3000)
console.log('URL:', page.url())
// 로그인이 성공하면 리다이렉트되어 /login 의 p[aria-live] 가 사라진다.
// 무조건 읽으면 Timeout 으로 스크립트 전체가 죽는다 — 실제로 겪었다.
// 아직 /login 에 남아있을 때(= 실패)만 오류 문구를 읽는다.
if (page.url().includes('/login')) {
  console.log('메시지:', await page.locator('p[aria-live]').innerText())
}

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
  더 확실한 건 `main` 에 글자가 들어올 때까지 기다리는 것이다:
  `page.waitForFunction(() => document.querySelector('main')?.innerText.trim().length > 0)`
- **화면이 꺼진 브라우저에서는 `loading.tsx` 가 있는 화면이 영영 안 열린다.**
  `/stock`·`/movements`·`/stats` 셋이 해당한다. React 는 스트리밍으로 받은 내용을
  `<div id="S:0" hidden>` 에 두고 `$RC` 로 자리를 바꾸는데, 그 마지막 단계를
  **`requestAnimationFrame` 으로 예약**한다. 프레임을 합성하지 않는 창(표시되지
  않은 IDE 브라우저 패널 등)에서는 rAF 콜백이 안 돌아서 스켈레톤에 멈춘 채로
  남는다. 증상이 앱 버그와 똑같이 보인다 — `main` 이 비어 있고 `h1` 은 존재하는데
  크기가 0×0 이다.
  구분법: `document.querySelector('main').childNodes[0]` 이 `<!--$~-->` 주석이고
  `$RB.length > 0` 이면 이 현상이다. 서버는 정상이고 (`GET /stock 200`), 원본
  HTML 끝에 `$RC("B:0","S:0")` 도 들어 있다.
  **고치려 들지 마라. 앱 문제가 아니다.** Playwright(헤드리스 포함)에서는 정상
  동작한다. 굳이 그 패널에서 봐야 하면 `$RV($RB)` 를 직접 불러 진행시킬 수 있다.
- **`fullPage: true` 스크린샷은 `position: fixed` 를 엉뚱한 데 그린다.** 하단 탭이
  페이지 한가운데 찍혀서 폼을 가리는 것처럼 보인다. 가림 여부는 뷰포트 스크린샷과
  `getBoundingClientRect()` 좌표로 판단해라.
