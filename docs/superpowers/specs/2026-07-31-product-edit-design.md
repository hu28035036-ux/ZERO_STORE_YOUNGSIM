# 상품 수정 화면 설계

작성: 2026-07-31 / 브랜치 `claude/inventory-management-planning-fk6i1t`

## 왜 만드나

등록(`/stock/new`)만 있고 수정이 없다. 판매가나 최소재고를 고치려면 DB 를 직접
만져야 한다. 인계 문서가 "다음에 만들 만한 것 중 가장 아쉬운 구멍"이라고 적어둔
자리다.

## 범위

**고칠 수 있는 것**

| 대상 | 값 |
|---|---|
| 상품 | `name`, `category_id`, `description` |
| 변형 | `sale_price`, `low_stock_threshold`, 대표 바코드 |

**고칠 수 없는 것과 그 이유**

- `stock_qty` — 원장(`stock_movements`)이 진실이고 이 컬럼은 캐시다. 여기서 바꾸면
  `v_stock_integrity` 에 불일치로 뜬다. 재고는 실사나 입출고 전표로만 움직인다.
- `cost_price` — 입고 전표가 만드는 이동평균이다. 손으로 덮으면 과거 마진이
  거짓이 된다.
- `options`, `option_schema` — 옵션 축 이름을 바꾸면 기존 변형의 라벨이 깨진다.
  변형을 더하거나 빼는 것도 이번 범위가 아니다.
- `sku` — 전역 unique 라 실수로 겹치면 저장이 통째로 막힌다. 등록 폼에서도 같은
  이유로 뺐다. 작은 가게의 실제 식별자는 바코드다.
- `is_active` — 상품·변형 숨기기는 이번 범위가 아니다.

`stock_qty` 와 `cost_price` 는 **읽기 전용으로 보여준다.** 안 보여주면 판매가를
얼마로 할지 판단할 근거가 없고, 고칠 수 있게 두면 원장이 깨진다. 옆에 입출고
화면으로 가는 링크를 둔다 — 이 화면에 온 사람의 상당수는 재고를 고치러 왔을 것이다.

## 화면

경로는 `/stock/[productId]/edit`. `/stock/new` 는 정적 세그먼트라
`[productId]` 보다 우선하므로 충돌하지 않는다.

재고 목록은 상품이 아니라 **변형 단위**로 나온다(티셔츠 4줄). 그런데 상품명과
카테고리는 상품 하나에 붙는다. 그래서 화면은 **상품 통째로** 연다. 티셔츠 네
색상의 가격을 한 번에 올릴 수 있어야 하고, 그게 이 화면의 존재 이유다.

```
┌ 기본 정보 ──────────────────────────┐
│ 상품명 · 카테고리 · 설명                  │  고칠 수 있음
├ 재고 단위 (N개) ────────────────────┤
│ [옵션 라벨]                             │
│   판매가 · 최소재고 · 바코드              │  고칠 수 있음
│   재고 12개 · 원가 7,000원               │  읽기 전용
└──────────────────────────────────┘
                              [ 저장 ]
```

저장은 화면 전체에 하나다. 값마다 폼을 두면 티셔츠는 폼이 12개가 되고, 네 색상
가격을 한 번에 올리려는 목적이 사라진다.

옵션 축과 변형 개수는 이 화면에서 바뀌지 않는다. 화면에도 그렇게 적는다.

### 진입

`v_variant_stock` 이 이미 `product_id` 를 준다.

- 모바일 카드: 카드 전체를 링크로
- 데스크톱 표: 상품명 칸을 링크로 (`<tr>` 을 `<a>` 로 감쌀 수 없다)

## 저장 — `update_product` RPC

```sql
update_product(
  p_product_id  uuid,
  p_name        text,
  p_category_id uuid,
  p_description text,
  p_variants    jsonb  -- [{ variant_id, sale_price, low_stock_threshold, barcode }]
) returns void
```

서버 액션에서 `products` update 와 `variants` update N 번과 바코드 교체를 따로
호출하면 **부분 실패가 남는다.** 상품명은 저장됐는데 세 번째 변형에서 터지면
절반만 바뀐 채로 끝난다. `create_product` 가 같은 이유로 RPC 하나로 묶여 있고
그 주석에 이유가 적혀 있다. 대칭을 맞춘다.

다른 함수들과 같은 규칙: `security invoker`, `set search_path = public, pg_temp`.

### RPC 가 반드시 하는 검사

1. **변형이 그 상품 것인지 확인한다.** RLS 는 인증 사용자에게 전체 접근을 준다.
   남의 상품 `variant_id` 를 payload 에 실어 보내면 그 상품 가격이 바뀐다. 서버
   액션이 UI 없이 POST 로 불릴 수 있다는 것은 이 저장소가 이미 전제하고 있다
   (`lib/auth.ts`, proxy 주석). 그러므로 RPC 안에서 막는다.
   → 어긋나면 `이 상품의 재고 단위가 아닙니다`
2. **건드리지 않을 컬럼은 UPDATE 문에 등장하지 않는다.** `stock_qty`,
   `cost_price`, `options`, `option_schema`, `sku`, `is_active` 는 쓰지 않는다.
3. 상품이 없으면 `상품을 찾을 수 없습니다`.

`p_variants` 에 실린 변형만 갱신한다. 빠진 변형은 건드리지 않는다(폼이 늘 전부를
싣지만, RPC 가 "전부여야 한다"고 요구하지는 않는다). 빈 배열이면 상품 필드만
갱신되고 그것도 정상이다.

`p_category_id` 가 null 이면 "선택 안 함"이다. 카테고리를 지워도 상품은 남는다는
스키마의 뜻(`on delete set null`)과 같다.

### 바코드 교체

변형은 바코드를 여러 개 가질 수 있고(`barcodes` 는 `code` 가 PK, `variant_id` 로
묶인다) 화면은 대표 하나만 보여준다. `delete from barcodes where variant_id = ?`
로 지우면 **화면에 안 보이던 나머지가 같이 날아간다.**

RPC 가 뷰와 같은 규칙(`is_primary desc, created_at`)으로 대표 한 줄을 다시 찾아서
그 줄만 다룬다:

- 값이 그대로면 아무것도 안 한다
- 값이 바뀌면 대표 한 줄을 지우고 새 코드를 넣는다
- 값을 비우면 대표 한 줄만 지운다

클라이언트가 보낸 "원래 값"을 믿지 않고 RPC 가 다시 찾는다. 그 사이 누가 바꿨다면
지금의 대표를 바꾸는 것이 맞는 동작이다.

현재 바코드가 2개 이상인 변형은 없다(2026-07-31 확인). 스키마가 허용하므로
방어적으로 짠다.

## 오류

| 상황 | 사용자가 보는 문구 | 어디서 |
|---|---|---|
| 상품명 빈칸 | `상품명을 입력하세요` | zod |
| 바코드 4자 미만 | `바코드는 4자 이상이어야 합니다` | zod (DB check 가 최종) |
| 같은 폼 안에서 바코드 중복 | `바코드 ... 가 여러 줄에 중복으로 들어갔습니다` | 서버 액션 |
| 다른 상품이 쓰는 바코드 | `이미 등록된 바코드입니다...` | 23505 → 기존 `humanize()` |
| 상품 없음 / 남의 변형 | RPC 가 던지는 한국어 그대로 | P0001 |

`humanize()` 는 `createProduct` 가 쓰는 것을 그대로 쓴다.

동시 수정은 나중에 저장한 쪽이 이긴다. 한 가게에서 둘이 같은 상품을 동시에 고치는
상황은 막지 않는다.

## 파일

| 파일 | 내용 |
|---|---|
| `supabase/migrations/20260731000001_update_product_rpc.sql` | 새 RPC |

| `app/(app)/stock/[productId]/edit/page.tsx` | 서버 컴포넌트. 상품·변형·카테고리 로드 |
| `app/(app)/stock/[productId]/edit/edit-form.tsx` | 클라이언트 폼 |
| `app/(app)/stock/actions.ts` | `updateProduct` 액션을 `createProduct` 옆에 |
| `app/(app)/stock/stock-cards.tsx` | 카드를 링크로 |
| `app/(app)/stock/stock-table.tsx` | 상품명 칸을 링크로 |

`lib/action-state.ts` 의 `ok()`/`fail()` 과 `components/ui/action-form.tsx` 를 쓴다.
`createProduct` 처럼 redirect 하지 않고 `ok('저장했습니다')` 로 화면에 남는다 —
가격을 고치고 나서 재고를 확인하는 흐름이 자연스럽다.

## 검증

- SQL 스모크(롤백 트랜잭션): 값 수정, 남의 변형 거부, 없는 상품 거부, 바코드
  교체·삭제·중복, **`stock_qty`·`cost_price` 가 안 바뀌는 것**, 대표 아닌 바코드가
  살아남는 것
- `tsc --noEmit`, `eslint`, `next build`
- 프로덕션 빌드를 Playwright 로: 목록에서 진입, 값 수정 후 저장, 재고 목록에
  반영, 데스크톱·모바일 양쪽
- 저장 후 `v_stock_integrity` 가 0행인 것

MCP `apply_migration` 은 자체 타임스탬프를 찍는다. 적용한 뒤
`supabase_migrations.schema_migrations` 의 version 이 파일명과 같은지 확인하고
다르면 맞춘다 (인계 문서 "DB 현재 상태" 참고). 2026-07-31 에 13개를 그렇게
맞춰놨으므로 새 것 하나 때문에 다시 어긋나게 두지 않는다.

## 안 하는 것

- 변형 추가·삭제
- 옵션 축 수정
- 상품·변형 숨기기
- 상품 삭제
- 이미지(`image_url` 은 컬럼만 있고 화면이 없다)
