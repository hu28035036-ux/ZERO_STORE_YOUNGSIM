# 설계: 상품 단위 · 원가 수정 · 묶음 매입

2026-08-01 사용자와 대화로 확정한 설계다. **이 브랜치에 구현은 없다** — 다른
PC 에서 구현을 시작하기 위한 기록이다. 구현 전에 `docs/HANDOFF.md` 를 먼저
읽어라. DB 는 프로덕션이고 **실사용 상품 358개가 이미 들어와 있다** (문서를
처음 쓸 때는 비어 있다고 알았으나 같은 날 확인으로 뒤집혔다 — 아래 2차 결정
절). 마이그레이션 version 어긋남 함정은 이 작업에서도 그대로 밟게 된다.

## 왜 시작했나

"원가·판매가·단위를 적을 곳이 없다"는 문제 제기에서 출발했다. 코드로 확인한
현재 상태는 절반은 오해, 절반은 사실이었다:

- 원가·판매가 입력칸은 등록 화면(`/stock/new`)에 **이미 있다.** 변형별 입력과
  "전체에 한 번에 넣기"까지. 기초수량을 넣으면 원가가 입고 전표 단가로 남고
  이후 이동평균으로 굴러간다 (0010).
- 수정 화면(`/stock/[productId]/edit`)에서는 판매가만 고칠 수 있고 **원가는
  읽기 전용**이다. 0014 가 "이동평균을 덮으면 과거 마진이 거짓이 된다"는
  이유로 의도적으로 뺐다 — 그런데 이 전제는 틀렸다. 과거 판매의 원가는 전표에
  스냅샷돼 있어서(0003, HANDOFF 스키마 뼈대 4번) cost_price 를 덮어도 과거
  마진은 안 바뀐다. 바뀌는 것은 앞으로의 판매와 재고 자산 평가뿐이다.
- **단위(세는 말)는 어디에도 없다.** 스키마에 컬럼이 없고 화면 곳곳에 `개`가
  하드코딩돼 있다 (아래 목록). 생수를 "병"으로, 과자 묶음을 "봉지"로 셀 방법이
  없다.
- **묶음 매입(1박스=30개)을 표현할 방법이 없다.** 박스로 사 와도 낱개 수량과
  낱개 단가를 사람이 암산해서 넣어야 한다.

## 확정된 결정

| 논점 | 결정 | 비고 |
|---|---|---|
| 단위를 어디에 | **상품마다 하나** (`products.unit`) | 변형별 아님. 변형(옵션 조합)은 같은 단위를 쓴다 |
| 단위 입력 방식 | **고르기 + 직접 입력** (datalist) | DB 에는 친 글자 그대로. 기본 '개' |
| 원가 수정 | **수정 화면에서 언제나 가능** | 입고와 무관한 수동 정정. 안내 문구 필수 |
| 묶음 매입 | **정식 필드** | 상품에 "1박스=30개" 저장, 입고를 박스 수로 입력 |

논란 여지가 없어 함께 넣기로 한 것:

- 등록·수정 폼의 변형 줄에서 판매가·원가가 둘 다 있으면 **마진(원·%)을 실시간
  표시**. 목록(`v_variant_stock.margin_rate`)에는 이미 있는데 정작 값을 정하는
  폼에는 없다.
- **판매가 < 원가 경고** (역마진). 목록 카드가 쓰는 `text-loss` 색과 같은 규칙.

### 단위 값을 한국어로 저장하는 것에 대해

`AGENTS.md` 는 "DB 값은 영문으로 저장하고 한국어 라벨은 `lib/constants.ts`
에서만"이라고 말한다. 단위는 **의도적으로 이 규칙의 예외다.** 그 규칙은 코드가
분기하는 enum(전표 type 같은 것)을 위한 것이고, 단위는 상품명처럼 화면에
그대로 붙는 사용자 데이터다. "직접 입력"을 허용하기로 한 이상 자유 입력값을
영문 코드로 만들 방법 자체가 없다. 정렬·마이그레이션·연동 어디에서도 이 값으로
분기하지 않는다는 것이 전제다 — 단위별 집계 같은 기능을 나중에 붙이고 싶어지면
그때 이 결정을 다시 봐라.

## 2차 결정 (같은 날, 사용자 피드백 + 실데이터 확인)

1차 설계를 보여준 뒤 사용자가 두 가지를 더 요구했다: "단위나 갯수 수정을
자유롭게 하고 싶다 — 처음 넣은 게 하드코딩처럼 박혀 있다", "판매가·원가가
박스 단위로 기입돼 있어서 낱개로 했을 때의 단가도 같이 나와야 한다".

프로덕션 DB 를 읽어 근거를 확인했다 (2026-08-01 기준): 실사용 상품
**358개**(변형 358 — 전부 옵션 없음)가 같은 시각으로 일괄 등록돼 있고, 기초
재고 전표 353건·바코드 351개·`v_stock_integrity` 0행으로 **원장까지 멀쩡하게**
들어왔다 — `recalc_stock()` 이 재고를 지워버릴 걱정은 없다. (처음에
LIMIT 50 조회만 보고 50개로 적었다가 전수 카운트로 바로잡았다.)

- 대부분이 **박스 기준**이다: "마이노멀 딸기잼" 판매가 118,800 · 원가
  83,160 · 재고 1 — 잼 한 병 가격일 리 없고, 재고 1 은 1박스라는 뜻이다.
- **낱개 기준인 행도 섞여 있다**: "스낵24 프로틴피자칩" 판매가 1,500 · 재고 12.
- 그래서 "일괄 ÷N SQL 마이그레이션" 같은 것은 **불가능하다** — 입수(박스당
  낱개 수)가 상품마다 다르고, 어느 행이 박스 기준인지 데이터만으로는 모른다.
  사람이 상품마다 입수를 넣고 환산하는 흐름이어야 한다 (아래 "기존 박스 기준
  데이터 정리" 절).

추가 결정:

| # | 결정 | 구현 방향 |
|---|---|---|
| 5 | 수정 화면에서 **수량도 자유롭게 수정** | 겉보기는 그냥 입력칸. 저장하면 달라진 변형만 **실사 전표로 기록**된다 — 원장 원칙(저장 원칙 4)을 지키면서 사용자 경험은 자유 수정 |
| 6 | 단위·매입 단위(이름/입수)도 **언제든 수정** | 1차 설계에 이미 있다. 과거 원장은 낱개 저장이라 입수를 바꿔도 안 흔들린다 |
| 7 | 등록 폼에 **박스 기준 입력 토글** | 판매가·원가·기초수량을 박스당 값으로 치면 낱개 환산이 줄마다 실시간으로 보이고, 저장은 언제나 낱개 |
| 8 | 수정 화면에 **낱개 환산 도우미** | 이미 박스 기준으로 들어간 상품을 정리하는 버튼. 입수 N 을 넣고 누르면 수량 ×N, 판매가·원가 ÷N 으로 폼 값을 바꿔준다. 저장 전까지 DB 에 안 닿는다 |

1차 '범위 밖'에 있던 "등록 화면의 기초수량 박스 입력"은 7번으로 **승격됐다** —
실데이터가 박스 기준으로 들어오는 것이 확인됐기 때문이다.

## 저장 원칙 (구현 전에 외울 것)

1. **원장과 variants 의 수량·금액은 전부 기준 단위(낱개)와 원이다.** 박스는
   입력·표시 편의일 뿐 저장 단위가 아니다. `stock_movements.qty_delta` 에 박스
   수가 들어가는 순간 이동평균·무결성 검사·통계 전부가 단위를 알아야 하게 된다.
2. **단위는 세는 말이지 계량 단위가 아니다.** `stock_qty` 가 integer 라 1.5kg
   은 표현할 수 없다. 그래서 추천 목록에 kg·g·ml 를 넣지 않는다. 직접 입력으로
   넣는 것을 막지는 않지만, 수량이 정수라는 사실은 변하지 않는다.
3. **원가 수동 수정은 `variants.cost_price` 만 덮는다.** 원장에는 아무것도 쓰지
   않는다. 과거 판매 마진은 전표 스냅샷이라 소급해서 안 바뀐다 — 이것이 수동
   수정을 허용해도 장부가 안 깨지는 근거다. 다음 입고부터는 덮어쓴 값을
   기준으로 다시 이동평균이 굴러간다.
4. **수량 수정은 원장을 우회하지 않는다.** 수정 화면의 수량 저장은
   `variants.stock_qty` 를 직접 덮는 게 아니라 **실사 전표를 넣는 것**이다.
   직접 덮으면 `v_stock_integrity` 가 불일치로 울고, 다음 `recalc_stock()` 이
   수정을 되돌려버린다. 사용자에게는 그냥 입력칸으로 보이면 된다 — 자유
   수정이라는 경험과 원장 원칙은 충돌하지 않는다.

## 스키마 — 마이그레이션 0016

파일: `supabase/migrations/20260801000001_unit_and_purchase_unit.sql`

```sql
alter table public.products
  add column unit text not null default '개'
    check (length(btrim(unit)) between 1 and 10),
  -- 묶음 매입: "1박스 = 30개". 둘은 반드시 짝으로 있거나 둘 다 없다.
  add column purchase_unit_name text
    check (purchase_unit_name is null
           or length(btrim(purchase_unit_name)) between 1 and 10),
  add column purchase_unit_qty integer
    check (purchase_unit_qty is null or purchase_unit_qty >= 2),
  add constraint chk_purchase_unit_pair
    check ((purchase_unit_name is null) = (purchase_unit_qty is null));
```

- `not null default '개'` 라 기존 행은 마이그레이션이 채운다 (PG11+ 는 테이블
  재작성 없이 처리).
- `purchase_unit_qty >= 2` — 1개들이 묶음은 뜻이 없고 십중팔구 입력 실수다.
  zod 가 먼저 한국어로 거르므로 사용자가 제약 원문을 볼 일은 없어야 한다.

### 뷰 — drop 금지, 끝에만 추가

- `v_variant_stock`: SELECT 목록 **맨 끝에** `p.unit`, `p.purchase_unit_name`,
  `p.purchase_unit_qty` 추가 후 `create or replace view`.
  `create or replace` 는 컬럼을 끝에 붙이는 것만 허용한다 — 순서를 바꾸거나
  중간에 끼우려면 drop 이 필요한데, **drop 하면 grants 가 같이 날아간다**
  (0009 가 준 권한). 절대 drop 하지 마라.
- `v_low_stock`: `select * from v_variant_stock ...` 인데 `*` 는 **뷰 생성
  시점에 펼쳐져 고정된다.** v_variant_stock 을 고쳐도 자동으로 안 늘어난다.
  v_variant_stock 다음에 v_low_stock 도 `create or replace` 로 다시 만들어야
  새 컬럼이 나온다 (홈 부족 목록이 이 뷰를 쓴다).
- `v_movements` (0011): 이미 products 를 조인하므로 맨 끝에 `p.unit` 추가.

### RPC — 반드시 drop 후 재생성

인자가 늘어나는 함수를 `create or replace` 만 하면 **옛 시그니처가 오버로드로
남는다.** PostgREST 가 어느 쪽을 부를지 못 정해 400 을 던지므로, 옛 시그니처를
명시적으로 drop 하고 새로 만든 뒤 revoke/grant 를 다시 실행해야 한다:

```sql
drop function public.create_product(text, uuid, text, jsonb, jsonb);
drop function public.update_product(uuid, text, uuid, text, jsonb);
```

**`create_product`** — 새 인자 3개, products INSERT 에 세 컬럼 추가:

```sql
create function public.create_product(
  p_name               text,
  p_category_id        uuid    default null,
  p_description        text    default null,
  p_option_schema      jsonb   default '[]'::jsonb,
  p_variants           jsonb   default '[]'::jsonb,
  p_unit               text    default '개',
  p_purchase_unit_name text    default null,
  p_purchase_unit_qty  integer default null
) returns uuid
-- unit 은 coalesce(nullif(btrim(p_unit), ''), '개') 로 정규화해서 넣는다
```

**`update_product`** — 같은 인자 3개 추가 + 변형 항목에 `cost_price`·
`counted_qty` 허용:

```sql
-- p_variants: [{ variant_id, sale_price, cost_price, counted_qty,
--                low_stock_threshold, barcode }]
update public.variants
   set sale_price          = coalesce((v_item->>'sale_price')::numeric, sale_price),
       cost_price          = coalesce((v_item->>'cost_price')::numeric, cost_price),
       low_stock_threshold = coalesce(...)
 where id = v_variant and product_id = p_product_id;  -- 방어선 조건 유지 (0014 주석 참고)

-- 수량은 UPDATE 가 아니라 실사다 (저장 원칙 4).
-- counted_qty 가 왔고 현재 재고와 다를 때만 전표를 넣는다.
if v_counted is not null then
  select stock_qty into v_stock from public.variants where id = v_variant;
  if v_counted <> v_stock then
    perform public.record_stocktake(v_variant, v_counted, '상품 수정에서 맞춤');
  end if;
end if;
```

**순서가 중요하다: 가격·원가 UPDATE 가 먼저, 실사 INSERT 가 나중이다.**
원장 트리거가 전표에 그 시점 원가를 스냅샷하는데(0003 의
`new.unit_cost := v_cost`), 박스 기준 데이터를 정리하는 저장은 원가(÷N)와
수량(×N)이 **한 번에** 오는 경우다 — 실사가 먼저 들어가면 낡은 박스 원가가
전표에 박힌다. 같은 값이면 전표를 만들지 않는다(멱등) — 안 그러면 상품명만
고쳐도 실사가 쌓인다. 실사 삽입은 `record_stocktake` 를 `perform` 으로
재사용해 로직을 한 곳에 둔다 (원장의 실사 가드가 "실사는 record_stocktake()
로 등록하세요"라고 직접 INSERT 를 막기도 한다 — 0004).

0014 머리 주석은 "cost_price 를 건드리지 않는 이유"를 적어두고 있다. 0016 에는
그 전제가 왜 뒤집혔는지(스냅샷 덕에 과거 마진이 소급되지 않음, 사용자 결정)를
주석으로 남겨라 — 안 그러면 다음 사람이 0014 주석을 읽고 되돌린다.

`record_stock_movement` 는 **손대지 않는다.** 박스 환산은 서버 액션에서 낱개로
끝내고, RPC 는 지금처럼 낱개 수량·낱개 단가만 받는다.

### 마이그레이션 뒤처리

- MCP `apply_migration` 이 자체 타임스탬프를 찍는 문제가 **0015 에서 예고대로
  재발했다** (HANDOFF). 적용 후 `supabase_migrations.schema_migrations` 의
  version 을 `20260801000001` 로 맞춰라.
- `lib/database.types.ts` 재생성 (MCP `generate_typescript_types`). 안 하면
  화면 쿼리에 unit 을 추가하는 순간 tsc 가 막는다.

## 서버 액션

### `app/(app)/stock/actions.ts`

- `payloadSchema`·`editPayloadSchema` 공통 추가:
  - `unit: z.string().trim().min(1).max(10)` — 폼이 기본 '개' 를 채워 보낸다
  - `purchaseUnitName: z.string().trim().min(1).max(10).nullable()`
  - `purchaseUnitQty: z.number().int().min(2, { error: '묶음은 2개 이상이어야 합니다' }).max(100_000).nullable()`
  - 짝 검증(한쪽만 있으면 거부)은 `.refine()` 으로: '묶음 이름과 묶음당 낱개
    수는 함께 넣어야 합니다'
- `editVariantSchema` 에:
  - `costPrice: z.number().int().min(0).max(1_000_000_000)`
  - `countedQty: z.number().int().min(0).max(1_000_000).nullable()` — 폼은
    수량이 처음 값에서 안 바뀐 줄을 `null` 로 보낸다. RPC 의 멱등 조건과
    이중 방어다.
- 두 `rpc()` 호출에 새 인자 전달.

### `app/(app)/movements/actions.ts` — 입고 박스 모드

폼 필드 추가: `entryMode`(`each`|`bundle`, hidden), `bundleCount`, `bundlePrice`
(박스당 매입가). `bundle` 모드일 때:

- **환산은 서버가 한다. 클라이언트가 보낸 환산값을 믿지 않는다.** 서버 액션이
  variant → product 를 조회해 `purchase_unit_qty` 를 얻는다 (매입 단위가 없는
  상품이면 거부). hidden 으로 낱개 수를 실어 보내는 설계는 위조 한 번에 재고가
  틀어진다 — 서버 액션은 UI 없이도 POST 로 불린다 (HANDOFF 작업 방식).
- `qty = bundleCount × purchase_unit_qty`
- `unitCost = Math.round(bundlePrice / purchase_unit_qty * 100) / 100` —
  소수 2자리 반올림 (`stock_movements.unit_cost` 가 numeric(12,2)).
  `bundlePrice` 를 비우면 낱개 모드처럼 단가를 안 넘긴다(지금 원가 유지).
- **반올림 오차를 안다:** 박스가가 낱개 수로 정확히 안 나눠지면(15,000원/29개)
  `purchase_amount = qty × unit_cost` 생성 컬럼이 실제 지불액과 원 미만으로
  어긋난다. 재고 파악이라는 앱 목적에서 허용하고, 입고 폼 미리보기에 **저장될
  낱개 단가**를 보여줘 사람이 알 수 있게 한다.
- note 자동 구성: `[3박스 × 30개]` 를 앞에 붙이고 사용자 메모를 뒤에.
  합쳐서 200자 제한(zod)에 맞게 자른다.
- zod: `bundleCount` int 1~10,000 / `bundlePrice` int 0~1,000,000,000.
  `qty`(낱개 환산 결과)도 기존 상한 1,000,000 검증을 통과해야 한다.

## 화면

### 등록 `/stock/new` (`product-form.tsx`)

- **기본 정보 카드**에 추가:
  - 단위: `Input` + `<datalist>` (아래 UNIT_SUGGESTIONS). 기본값 '개'.
    hint: "재고를 세는 말입니다. 예: 개·병·봉지"
  - 매입 단위(선택): "묶음 이름" + "1묶음당 낱개 수" 두 칸 한 줄.
    hint: "박스로 사서 낱개로 팔면 넣으세요. 입고를 박스 수로 적을 수 있게
    됩니다." 한쪽만 채우면 등록 전에 인라인으로 짚어준다(옵션 축의
    halfFilled 와 같은 패턴).
- **변형 줄**: 판매가·원가 둘 다 0 보다 크면 줄 아래 보조 텍스트로
  "마진 800원 (33.3%)". 판매가 < 원가면 `text-danger` 로 "판매가가 원가보다
  낮습니다". 6열 GRID 에 칼럼을 더 넣는 게 아니라 **줄 아래 한 줄**이다 —
  표가 이미 꽉 차 있다.
- **박스 기준 입력 토글** (2차 결정 7): 매입 단위 두 칸이 채워지면 변형 표
  머리에 "박스 기준으로 입력" 토글이 나타난다. 켜면 판매가·원가·기초수량
  칸이 **박스당 값**을 뜻하고, 줄 아래 보조 텍스트가 낱개 환산으로 바뀐다
  ("낱개 3,960원 · 원가 2,772원 · 30개 — 마진 30.0%"). "전체에 한 번에
  넣기"도 같은 기준을 따른다. **payload 는 언제나 낱개다** — 토글은 순수
  UI 이고 제출 직전에 클라이언트가 환산한다(판매가는 원 단위 반올림, 원가는
  소수 2자리, 수량은 ×N 정수). 서버 zod·RPC 계약은 낱개 그대로라 이
  토글로 달라지는 서버 코드는 없다. 마진 표시·역마진 경고도 낱개 환산값
  기준이다.
- payload JSON 에 `unit`·`purchaseUnitName`·`purchaseUnitQty` 추가.

### 수정 `/stock/[productId]/edit` (`edit-form.tsx`, `page.tsx`)

- 기본 정보 카드: 등록과 같은 단위·매입 단위 칸 (page.tsx 조회에 세 컬럼 추가).
- 변형 줄: **원가·수량 `NumberInput` 추가** — GRID 를 4열 → 6열
  (옵션/판매가/원가/수량/최소재고/바코드). 등록 화면과 같은 열 구성이 된다.
  참고줄("재고 N개 · 원가 N원")은 둘 다 입력칸이 되므로 없앤다.
- **낱개 환산 도우미** (2차 결정 8): 매입 단위(입수 N)가 채워져 있으면 변형 표
  위에 "박스 값을 낱개로 환산" 버튼을 보여준다. 누르면 각 줄의 **폼 값**을
  수량 ×N, 판매가 ÷N(원 단위 반올림), 원가 ÷N(소수 2자리)로 바꾼다. 저장
  버튼을 누르기 전까지 DB 에는 아무것도 안 닿는다 — 사람이 환산 결과를 눈으로
  확인하고 저장한다. **두 번 누르면 두 번 나뉜다** — 누른 뒤에는 버튼을
  비활성화하고 "환산했습니다. 값을 확인하고 저장하세요"를 띄운다 (되돌리려면
  새로고침).
- 하단 안내 문구 교체 — 지금 문구("재고와 원가는 여기서 고칠 수 없습니다")가
  거짓이 된다:
  > 수량을 바꾸면 실사로 기록됩니다 — 언제 얼마로 맞췄는지 입출고 내역에
  > 남습니다. 원가를 고치는 것은 입고와 무관한 수동 정정입니다. 지난 판매의
  > 마진은 바뀌지 않고, 다음 입고부터 이 값 기준으로 이동평균이 다시
  > 계산됩니다.
- 마진 표시·역마진 경고는 등록 폼과 동일 (원가 입력값 기준으로 실시간).
- payload 에 `unit`·매입 단위·변형별 `costPrice`·`countedQty` 추가
  (`countedQty` 는 안 바뀐 줄이면 `null`).
- 모바일 확인: 열이 둘 늘었다. 좁은 화면(`Cell` 라벨 배치)에서 여섯 칸이
  제대로 접히는지, 저장 버튼이 하단 탭에 안 가리는지 다시 재라.

### 입고 `/movements/new` (`movement-form.tsx`, `page.tsx`)

- `VariantTarget` 에 `unit`·`purchaseUnitName`·`purchaseUnitQty` 추가
  (page.tsx 검색 쿼리에서 products 조인으로).
- `type === 'purchase'` 이고 매입 단위가 있으면 **낱개/박스 입력 모드 토글**
  (조정의 방향 라디오와 같은 패턴):
  - 박스 모드: 수량 칸 라벨 "박스 수" (묶음 이름을 그대로 써서 "박스 수"·"팩
    수"), 단가 칸 라벨 "박스당 매입가", hint 에 저장될 낱개 단가 환산을 보여준다
  - 미리보기: "3박스 = 90개 · 낱개 500원", 재고 미리보기("12개 → 102개")는
    낱개 기준 유지
- 매입 단위가 없는 상품은 지금과 완전히 같다 (토글 자체가 안 보인다).

### 공용 조각 (`lib/constants.ts`, `components/ui/badge.tsx`)

```ts
/** 단위 직접 입력의 추천 목록. 계량 단위(kg·ml)는 넣지 않는다 — 수량이 정수다. */
export const UNIT_SUGGESTIONS = ['개', '병', '캔', '봉지', '팩', '박스', '세트', '장', '권', '줄']

/** "12병" — unit 이 없는 호출부는 '개' 로 동작이 지금과 같다. */
export function formatQtyUnit(qty: number | null | undefined, unit?: string | null): string {
  return `${formatQty(qty)}${unit || '개'}`
}
```

`StockBadge` 는 `unit?: string` prop 을 받는다 (기본 '개').

## `개` 하드코딩 인벤토리 (이 커밋 기준)

구현 때 `'개'` 로 다시 grep 해서 새로 생긴 곳을 잡아라. 원칙: **재고·판매
수량에는 상품 단위를, 품목·조합·줄 수에는 '개'를 유지한다.**

교체 (상품 단위로):

| 위치 | 지금 |
|---|---|
| `components/ui/badge.tsx:65` | `StockBadge` 의 `{qty}개` |
| `app/(app)/stock/[productId]/edit/edit-form.tsx:143` | "재고 N개 · 원가 …" 참고줄 |
| `app/(app)/movements/new/movement-form.tsx:104·242·252` | 현재 재고·미리보기 "12개 → 32개" |
| `app/(app)/movements/movement-kind.tsx:33` | 실사 "20개로 맞춤" (`v_movements.unit` 사용) |
| `app/(app)/sales/new/sale-lines-form.tsx:244·295` | 후보 재고·"재고 N개보다 많이 팝니다" |
| `app/(app)/sales/import/preview.tsx:517·559·618` | 줄 수량·후보 재고·반영 후 재고 |
| `app/(app)/page.tsx:104` | 부족 목록 "N개 / 기준 N개" (`v_low_stock.unit` 사용) |

유지 (수량이 아니다): `stock/page.tsx:83·97`("N개 품목"·부족 품목 수),
`product-form.tsx:235·307·342`(재고 단위 N개·조합 N개), `edit-form.tsx:118·192`,
`settings/page.tsx:204`, 목록 "N개까지만", `import-flow.tsx:175`(시트 N개),
`preview.tsx:401`(건너뛴 줄 N개) 등.

단위가 화면까지 오는 길: `v_variant_stock`·`v_low_stock`·`v_movements` 는 뷰에
추가한 컬럼으로, 개별 조회(`movements/new/page.tsx` 검색, `sales/actions.ts`
후보 검색, `sales/import` 매칭, `stock/[productId]/edit/page.tsx`)는 각 select
에 추가해서 가져온다.

## 범위 밖 (이번에 안 한다, 이유와 함께)

- ~~등록 화면의 기초수량 박스 입력~~ — **2차 결정 7번으로 승격됐다.**
  실데이터가 박스 기준으로 들어오는 것이 확인됐다.
- **출고·실사·판매의 박스 단위.** 가게는 낱개로 팔고 낱개로 센다.
- **박스를 낱개와 별도 상품으로 판매(박스 SKU).** 통째로 파는 일이 생기면
  지금도 별도 상품으로 등록하면 된다. 같은 재고를 두 SKU 가 나눠 갖는 설계는
  이 앱 규모에 과하다.
- **계량 단위(소수 수량).** `stock_qty` 가 integer 다. 저울 품목이 생기면
  스키마부터 다시 설계해야 한다.
- **박스 바코드 UI.** `barcodes` 테이블은 이미 변형당 여러 코드(label 포함)를
  담을 수 있지만 화면이 대표 하나만 다룬다. 별개 작업이다.
- **변형별 단위.** 상품 하나로 확정했다.
- **원가 수정 이력.** 수동 정정은 흔적을 안 남긴다. 감사가 필요해지면 그때
  (원장에 zero-qty 전표를 남기는 방식은 부호 제약과 충돌하니 쓰지 마라).

## 기존 박스 기준 데이터 정리 (구현 후 사용자가 할 일)

DB 에 이미 있는 상품 358개는 코드가 못 고친다 — 어느 행이 박스 기준인지
데이터만으로 알 수 없다(피자칩처럼 낱개 기준이 섞여 있다). **자동 마이그레이션을
시도하지 마라.** 상품마다 사람이:

1. 수정 화면에서 단위(예: 개·병)와 매입 단위(예: 박스, 입수 30)를 넣는다
2. "박스 값을 낱개로 환산" → 수량 ×30, 판매가·원가 ÷30 이 폼에 채워진다
3. 값을 눈으로 확인하고(판매가 끝자리가 어색하면 여기서 고친다) 저장 —
   수량 변화는 실사 전표로 남는다
4. 원래 낱개 기준이던 상품(피자칩 등)은 단위만 넣고 끝낸다

기초 재고 입고 전표는 "1개 × 박스가"로 남는데 **금액이 실제 지불액과 같으므로
매입 통계는 정확하다.** 소급해서 고치지 않는다 (원장은 append-only 다).

### 열린 질문 — 358개를 화면 하나씩 열어서 정리할 것인가

상품이 358개라 수정 화면을 하나씩 여는 정리는 손이 꽤 간다. 대안으로 일괄
정리 화면(상품을 표로 늘어놓고 입수만 치면 환산 미리보기 → 모아서 저장)을
사용자에게 물었으나 **답을 받지 못했다 — 미결이다.** 구현 세션은 위의
상품별 도우미를 먼저 만들고, 사용자가 몇 개 정리해 보게 한 뒤 일괄 화면이
필요한지 다시 물어라. 매장에서 물건을 들고 하나씩 확인하며 정리하는 흐름이면
상품별 도우미로도 자연스럽다 — 책상에서 한 번에 밀어붙이는 흐름이면 일괄
화면이 맞다.

## 검증 계획

### SQL 스모크 (롤백 트랜잭션 — HANDOFF "작업 방식" 패턴 필수, 프로덕션 DB 다)

1. `create_product`: unit 생략 → '개' / unit='병' 저장 / 매입 단위 한쪽만 →
   `chk_purchase_unit_pair` 거부 / `purchase_unit_qty = 1` 거부 / 정상 저장
2. `update_product`: 단위·매입 단위 변경 / `cost_price` 수정이
   `variants.cost_price` 만 바꾸고 원장·`stock_qty` 불변, `v_stock_integrity`
   0행 유지
3. **원가 수정의 비소급**: 판매 전표를 만든 뒤 cost_price 를 덮고, 그 전표의
   `cost_amount` 가 수정 전 값 그대로인지
4. 뷰 3개가 unit 을 노출하는지, `v_low_stock` 재생성을 빠뜨리지 않았는지
5. 기존 행 backfill: 마이그레이션 후 모든 products.unit = '개'
6. **오버로드 잔존 검사**: `select count(*) from pg_proc where proname in
   ('create_product','update_product')` — 각 1 이어야 한다. 2 면 옛 시그니처가
   남아 PostgREST 400 의 원인이 된다.
7. **수량 수정 = 실사**: `update_product` 에 `counted_qty` → 실사 전표가
   생기고 재고가 바뀌며 `v_stock_integrity` 0행 / 같은 값을 보내면 전표
   0건(멱등) / 원가와 수량을 **같이** 보낼 때 실사 전표의 `unit_cost`
   스냅샷이 **새** 원가인지 (UPDATE→INSERT 순서 검증).

### 빌드·브라우저

- `./node_modules/.bin/tsc --noEmit` · eslint · `pnpm build` (pnpm 정책 우회는
  HANDOFF 저장소 상태 절)
- 프로덕션 빌드 + Playwright (**IDE 브라우저 패널 금지** — rAF 함정, run-app
  스킬 참고). 실데이터 358개가 있으니 **데이터 있는 상태가 기본 검증
  대상**이다. HANDOFF 가 경고하던 "데이터 있을 때만 도는 코드"가 이제
  실제로 돈다 — 재고 목록 358행의 스크롤·검색까지 봐라.
- `/stock/new` 모바일: 기본 정보 카드가 길어진다. **등록 버튼과 하단 탭의
  여유가 31px 뿐이었다** (HANDOFF 브라우저 검증 절) — 반드시 다시 재라.
- E2E 한 바퀴: 매입 단위 있는 상품 등록(박스 기준 토글로) → 입고 박스 모드
  3박스 → 원장에 낱개 90·환산 단가 확인 → 정정 → 수정 화면에서 원가 고침 →
  목록 마진 반영 확인. 검증 상품은 **사용자 승인을 받고 지운다** (0015 검증
  때의 절차와 같다).
- **박스 기준 데이터 정리 흐름 E2E**: 박스 기준으로 등록된 검증 상품에 입수
  30 입력 → 환산 도우미 → 수량 1→30·가격 ÷30 이 폼에 채워짐 → 저장 →
  입출고 내역에 실사 전표("상품 수정에서 맞춤") → `v_stock_integrity` 0행.
  실사용 데이터 358개가 이 흐름을 그대로 탈 것이라 **가장 공들여 볼 경로다.**

## 함정 요약 (구현자가 밟기 직전의 것만)

- `apply_migration` 이 version 을 제 타임스탬프로 찍는다 → 적용 후
  `20260801000001` 로 맞춰라 (0015 에서 실제로 재발).
- 뷰는 drop 금지(grants 소실), `create or replace` 로 끝에만. `v_low_stock` 은
  `select *` 가 생성 시점에 고정되므로 별도 재생성.
- RPC 는 drop 후 재생성 + revoke/grant, 오버로드 잔존 검사까지.
- `lib/database.types.ts` 재생성을 잊으면 tsc 가 화면 작업을 막는다.
- `ActionForm` 의 `key="arm"`/`key="submit"` 분리를 되돌리지 마라 (HANDOFF
  버그 7번) — 입고 폼을 고치다 건드리기 쉽다.
- `update_product` 안에서 **가격 UPDATE 가 실사 INSERT 보다 먼저다.** 순서를
  바꾸면 박스 기준 데이터 정리 저장에서 낡은 박스 원가가 실사 전표에
  스냅샷된다 (RPC 절 참고).
- 수정 화면의 수량을 `variants.stock_qty` UPDATE 로 구현하고 싶어질 것이다 —
  하지 마라. `v_stock_integrity` 가 울고 `recalc_stock()` 이 되돌린다
  (저장 원칙 4).
- 0014 머리 주석("cost_price 를 안 건드리는 이유")은 0016 이후 낡은 설명이
  된다 — 0016 쪽 주석에서 반드시 바로잡아라.
