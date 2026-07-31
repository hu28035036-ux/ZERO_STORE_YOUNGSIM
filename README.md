# ZERO STORE 영심

작은 가게 하나를 여러 명이 함께 쓰는 재고·판매 관리 앱.
휴대폰으로 바코드를 찍어 팔고, 데스크톱에서 재고와 통계를 본다.

- **Next.js 16** (App Router) + **React 19**
- **Supabase** (Postgres + Auth + RLS)
- **Tailwind CSS 4**

## 설정

```bash
pnpm install
cp .env.example .env.local   # Supabase URL / publishable 키 채우기
pnpm dev
```

`.env.local` 에 들어가는 값은 프로젝트 설정 > API 에서 가져온다.
레거시 anon JWT 가 아니라 신형 publishable 키(`sb_publishable_...`)를 쓴다.
secret 키는 이 앱에 두지 않는다. 모든 쓰기가 로그인 사용자 권한으로 RLS 를 통과해야
`created_by` 감사 기록이 성립하기 때문이다.

**`pnpm dev`/`pnpm build` 를 그대로 써야 한다.** 두 스크립트 다
`node scripts/copy-zxing-wasm.mjs && next dev`(또는 `next build`)로 묶여 있어서,
카메라 바코드 스캔(아래 "카메라 바코드 스캔" 절)이 쓰는 wasm 을 먼저
`public/` 으로 복사한다. `./node_modules/.bin/next dev` 처럼 `next` 를 직접
부르면 이 복사를 건너뛴다 — 안드로이드는 내장 해독기를 쓰므로 멀쩡해 보이지만,
**아이폰 경로만 조용히 깨진다.**

## 카메라 바코드 스캔

`/stock/new`(변형별 바코드 칸) · `/movements/new`(찾기 칸) · `/stock`(재고
검색칸) · `/sales/new`(판매 적기 스캔칸)는 휴대폰 카메라로 바코드를 찍어
입력칸을 채울 수 있다. 공용 컴포넌트는
`components/scanner/barcode-scanner.tsx` 이고, GET 검색 폼 안에 끼울 때는
`components/scanner/scan-button.tsx` 를 쓴다(폼의 hidden 필터를 그대로 실어
보낸다).

해독기는 기기에 따라 다른 경로를 탄다. 안드로이드 크롬은 브라우저 내장
`BarcodeDetector` 를 그대로 쓴다. 아이폰 사파리는 그게 없어서(2026-07 기준,
애플이 넣을 조짐도 없다) `barcode-detector` 의 ponyfill(ZXing WebAssembly)을
스캐너를 여는 순간에만 동적으로 불러온다 — 정적 import 로 두면 안드로이드
기기까지 1.1MB wasm 을 받는다.

wasm 파일은 `barcode-detector` 기본값인 jsDelivr CDN 이 아니라 이 앱이 직접
서빙한다. `scripts/copy-zxing-wasm.mjs` 가 `node_modules` 의
`zxing_reader.wasm` 을 `public/zxing_reader.wasm` 으로 복사하고, 복사본은
`.gitignore` 에 있어 커밋하지 않는다(zxing-wasm 버전이 오를 때 복사본만
옛것으로 남는 어긋남을 막기 위해서다). CDN 을 그대로 썼다면 CDN 이 막히거나
죽을 때 아이폰에서만, 그것도 조용히 스캔이 실패한다 — 안드로이드는 내장
기능을 쓰므로 원인을 찾기가 특히 어렵다.

## 계정 만들기

가입 화면은 없다. 같이 쓰는 사람만 들어오는 앱이라 계정은 Supabase 대시보드에서
만든다. **Authentication > Users > Add user** 에서 이메일과 비밀번호를 넣고,
"Auto Confirm User" 를 켠다 (메일 발송 설정을 안 했으면 확인 메일이 안 간다).

**로그인 화면은 이메일이 아니라 아이디를 받는다** (`lib/username.ts`). 입력한
아이디 뒤에 서버가 `@zerostore.kr` 을 붙여 Supabase 에 이메일로 넘기므로,
대시보드에서 계정을 만들 때 **이메일을 `<아이디>@zerostore.kr` 형태로 지어야**
그 아이디로 로그인할 수 있다 — 예를 들어 이메일을 `sujin@gmail.com` 으로 만들면
로그인 칸에 `sujin` 을 쳐도 서버가 조회하는 이메일은 `sujin@zerostore.kr` 이라
서로 어긋나 로그인이 안 된다. 이미 다른 도메인으로 계정을 만들어 버렸다면,
로그인 칸에 `@` 가 포함된 전체 주소를 그대로 치면 된다 — `usernameToEmail()`
이 `@` 가 있는 입력은 도메인을 붙이지 않고 그대로 통과시킨다.

사용자가 생기면 트리거가 `profiles` 행을 자동으로 만든다. 화면에 표시할 이름은
User Metadata 에 `display_name` 으로 넣으면 그대로 쓰이고, 없으면 이메일의
아이디 부분을 쓴다.

## 배포 (Vercel)

**이미 배포돼 있다: https://zero-store-youngsim.vercel.app** (2026-07-31)

- 프로젝트: `hu28035036-2116s-projects/zero-store-youngsim`
- 저장소가 연결돼 있고 환경변수 두 개는 Production / Preview / Development 에
  모두 들어가 있다. 아래 1~2 는 이미 끝난 단계다.
- **Preview 환경변수는 `claude/inventory-management-planning-fk6i1t` 브랜치에만
  걸려 있다.** CLI(v54.7.1)가 "모든 preview 브랜치" 옵션을 비대화형으로 받지 못해
  브랜치를 명시했다. 다른 브랜치로 preview 를 띄우려면 그 브랜치에도 넣어야 한다.

아래는 처음부터 다시 만들 때의 절차다.

1. Vercel 에서 **Add New > Project > Import Git Repository** 로 이 저장소를 고른다.
   프레임워크는 Next.js 로 자동 인식된다. 빌드 설정은 건드릴 것이 없다.
2. **Environment Variables** 에 두 개를 넣는다. Production / Preview / Development
   세 환경에 모두 넣어야 프리뷰 배포도 동작한다.

   | 이름 | 값 |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://jnacpoqvnajjjfwwotnw.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 프로젝트 설정 > API 의 publishable 키 |

   둘 다 없으면 빌드가 그 자리에서 실패한다 (`lib/supabase/env.ts`). 런타임에
   "Invalid API key" 같은 엉뚱한 메시지로 터지는 것보다 낫다고 보고 그렇게 두었다.
3. 배포 후 Supabase 대시보드의 **Authentication > URL Configuration** 에서
   Site URL 을 배포된 주소로 바꾼다. 비밀번호 재설정 메일의 링크가 이 값을 쓴다.
   **이 단계는 아직 안 했다** — MCP 에 auth 설정을 바꾸는 도구가 없어서 대시보드에서
   직접 해야 한다. 지금은 앱에 비밀번호 재설정 흐름 자체가 없어서(계정은 관리자가
   만든다) 당장 깨지는 것은 없다.

### 어느 브랜치가 프로덕션인가

Vercel 의 프로덕션 브랜치는 저장소 기본 브랜치(`main`)다. 작업은
`claude/inventory-management-planning-fk6i1t` 에서 하고 있으므로 **거기에 푸시하면
preview 배포가 된다.** https://zero-store-youngsim.vercel.app 를 갱신하려면 둘 중
하나다:

- 작업 폴더에서 `vercel --prod` (지금 올라가 있는 것이 이 방식이다)
- `main` 에 머지 — 그러면 이후로는 푸시마다 자동으로 프로덕션이 갱신된다

## 데이터 모델

마이그레이션은 `supabase/migrations/` 에 번호순으로 있다.
다음 네 가지가 이 스키마의 뼈대다.

### 1. 원장이 진실이고 재고 수량은 캐시다

`stock_movements` 는 append-only 원장이고 `variants.stock_qty` 는 그 합계의 캐시다.
재고를 바꾸는 모든 경로는 원장에 한 줄을 남긴다. 수정도 삭제도 안 된다
(RLS 에 UPDATE/DELETE 정책이 없고, 테이블 트리거가 SQL 편집기 경로까지 막는다).
정정은 `void_movement()` 가 반대 부호 전표를 넣어서 한다.

캐시가 원장과 어긋나면 `v_stock_integrity` 뷰에 행이 뜬다. **항상 0행이어야 정상이고**,
어긋났다면 `recalc_stock()` 으로 되맞춘다.

`qty_delta` 가 부호를 갖기 때문에 반품 회계가 따로 필요 없다. `type='sale'` 인데
수량이 양수면 그게 반품이고, 매출 금액이 자동으로 음수가 된다.

### 2. 재고 적용은 RPC 가 아니라 테이블 트리거에 있다

`fn_apply_stock_movement()` 는 `stock_movements` 의 BEFORE INSERT 트리거다.
RPC 안에만 두면 SQL 편집기나 나중에 붙일 임포트 스크립트로 들어온 삽입이
캐시를 갱신하지 않고 지나간다. 테이블에 걸어야 새는 곳이 없다.

트리거가 하는 일:
- `SELECT ... FOR UPDATE` 로 variant 행을 잠근다 → 두 사람이 같은 상품을 동시에 찍어도
  둘 다 10을 읽고 둘 다 9를 쓰는 사고가 안 난다
- 판매 전표에 **그 시점의 원가를 박아 넣는다** → 나중에 매입가가 올라도 과거 마진이
  소급해서 바뀌지 않는다
- 수량이 늘어나는 전표만 **이동평균 원가**를 다시 계산한다. 최종 입고가만 쓰면
  100개@1000 상태에서 1개@1500 을 사는 순간 이후 모든 판매 원가가 1500이 되어
  장부상 마진이 무너진다

**재고 음수는 막지 않는다.** 하드 제약을 걸면 입고 기록을 깜빡한 상품이 계산대에서
판매 거부된다. 틀린 숫자보다 나쁘다. 대신 UI 에서 빨간 배지로 드러내고 실사로 정리한다.

### 3. 옵션은 JSONB 지만 자유 입력이 아니다

상품마다 옵션 축이 다르다(`products.option_schema`). 실제 재고 단위는 `variants` 이고
옵션 조합을 `{"맛":"딸기","크기":"대"}` 로 갖는다. 옵션이 없는 상품도 `{}` 인 변형을
하나 갖는다 → 재고 경로가 하나로 통일되어 모든 화면이 단순해진다.

JSONB 설계가 보통 무너지는 지점은 오타로 들어간 키다. `fn_validate_variant_options()`
트리거가 상품에 선언되지 않은 옵션 키를 거부한다. 그리고 jsonb 는 키를 정규 순서로
저장하므로 `(product_id, options)` 유니크 인덱스가 키 순서만 다른 중복 변형까지 잡는다.

### 4. 날짜 버킷은 전부 KST 로 자른다

집계는 예외 없이 `(occurred_at at time zone 'Asia/Seoul')::date` 로 자른다.
UTC 로 자르면 밤 9시 이후 판매가 다음 날로 밀려 일별 매출이 하루씩 어긋난다.

### 5. 상품 생성·수정은 각각 RPC 하나로 묶는다

서버 액션에서 상품 기본정보와 변형을 N 번 나눠 update 하면 부분 실패가 남는다 —
이름은 저장됐는데 세 번째 변형에서 터지면 절반만 바뀐 채로 끝난다. 생성은
`create_product`, 수정은 `update_product` 가 각각 한 트랜잭션으로 묶어서 막는다.

`update_product` 는 `stock_qty`·`cost_price`·`options`·`sku`·`is_active` 를 건드리지
않는다. 재고와 원가는 원장(`stock_movements`)이 만드는 값이라 RPC 가 덮어쓰면
캐시가 원장과 어긋나거나 과거 마진이 거짓이 된다. 옵션 축을 바꾸면 기존 변형의
라벨이 깨지고, SKU 는 전역 unique 라 실수로 겹치면 저장이 통째로 막힌다.

변형이 그 상품 것인지는 `product_id` 로 다시 검사한다. 이 공동 사용 앱은 RLS 가
로그인 사용자에게 모든 변형에 대한 접근을 열어 두므로, 이 조건이 없으면 남의
상품 `variant_id` 를 payload 에 실어 보내는 것만으로 가격이 바뀐다. 바코드는
변형당 여러 개를 가질 수 있지만 화면은 대표 한 줄만 보여주므로, RPC 도
`v_variant_stock` 과 같은 규칙(대표 우선·생성일 순)으로 그 한 줄만 교체하고
나머지는 그대로 둔다.

## 조회 인터페이스

기간 파라미터가 필요 없는 것은 뷰, 필요한 것은 함수다. 뷰는 전부 `security_invoker`
라서 기반 테이블의 RLS 가 그대로 적용된다 (이 옵션이 없으면 RLS 를 우회한다).

| 뷰 | 용도 |
| --- | --- |
| `v_variant_stock` | 재고 현황. 모바일 카드와 데스크톱 테이블의 공용 소스 |
| `v_low_stock` | 재고 부족 |
| `v_daily_sales` | 일별 매출 |
| `v_stock_valuation` | 재고 자산 총액 |
| `v_stock_integrity` | 캐시-원장 불일치. 0행이어야 정상 |

| 함수 | 용도 |
| --- | --- |
| `record_sale(items, memo, at)` | 장바구니 전체를 한 트랜잭션으로 판매 등록 |
| `import_sales(groups, memo, force)` | 판매기록 파일 일괄 반영. 날짜별 영수증을 한 트랜잭션으로 |
| `void_sale_order(order, reason)` | 영수증 단위 판매 취소 + 합계 재계산 |
| `void_import_batch(batch, reason)` | 임포트 배치(파일 한 번) 통째 취소 |
| `record_stock_movement(...)` | 입고 / 출고 / 조정 단건 |
| `record_stocktake(variant, counted)` | 실사. 델타는 트리거가 계산 |
| `void_movement(id, reason)` | 반대 전표로 정정 (입출고용 — 판매는 위 두 함수로) |
| `lookup_by_barcode(code)` | 스캐너 hot path. `barcodes.code` 가 PK 라 단일 조회 |
| `stats_summary / top_products / by_category / by_supplier / turnover` | 통계 화면 |

**임포트는 내용 지문으로 중복을 막는다.** 같은 판매기록 파일을 두 번 올리면
재고가 두 번 빠지는데, 판매 전표는 화면에서 개별 정정이 안 되므로 사고가 나면
복구가 어렵다. 그래서 `sale_orders.import_fingerprint` (정규화된 날짜·변형·수량·
단가의 SHA-256, 영수증마다 하나)에 부분 유니크 인덱스를 걸어 DB 차원에서
거부한다. 직접 쓰기(`record_sale`)는 지문이 NULL 이라 영향이 없다 — 같은 날
같은 커피를 두 번 파는 것은 정상이다. 판매 취소의 반대 전표는 **원본과 같은
날짜**에 앉는다(`void_movement` 가 정정 시점을 남기는 것과 다르다) — 임포트
취소는 반품이 아니라 "잘못 넣은 기록의 취소"라서, 일별 매출이 그 판매가 없던
모습으로 돌아가야 한다.

`stats_turnover()` 의 회전율은 **추정치**다. 정확한 값은 기간 중 평균 재고가 필요하고
그러려면 일별 스냅샷이 있어야 한다. v1 은 기간 매출원가 ÷ 현재 재고자산을 연환산하며,
화면에도 추정치라고 표기한다.

## 권한

역할 구분이 없는 공동 사용 앱이다. `authenticated` 는 전부 허용, `anon` 은 전부 차단.
테넌트 컬럼도 소유자 필터도 없다. 예외는 두 가지다.

- `profiles` — 조회는 전체(처리자 이름 표시용), 수정은 본인만
- `stock_movements` — 조회와 추가만. 추가할 때 `created_by = auth.uid()` 를 강제하므로
  남의 이름으로 전표를 넣을 수 없다

정책에서 `auth.uid()` 는 항상 `(select auth.uid())` 로 감싼다. 괄호가 없으면 행마다
재평가되고, 원장처럼 행이 많은 테이블에서 체감 차이가 난다.

Supabase 보안 어드바이저에 `rls_policy_always_true` 경고가 남아 있는데, 위 설계에서
의도한 것이다.
