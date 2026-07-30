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
| `record_stock_movement(...)` | 입고 / 출고 / 조정 단건 |
| `record_stocktake(variant, counted)` | 실사. 델타는 트리거가 계산 |
| `void_movement(id, reason)` | 반대 전표로 정정 |
| `lookup_by_barcode(code)` | 스캐너 hot path. `barcodes.code` 가 PK 라 단일 조회 |
| `stats_summary / top_products / by_category / by_supplier / turnover` | 통계 화면 |

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
