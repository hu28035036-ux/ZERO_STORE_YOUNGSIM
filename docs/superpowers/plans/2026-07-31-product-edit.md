# 상품 수정 화면 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 등록만 있고 수정이 없어서 판매가·최소재고를 고치려면 DB 를 직접 만져야 하는 구멍을 메운다.

**Architecture:** `update_product` RPC 하나로 상품 필드와 변형 값을 한 트랜잭션에 저장하고(`create_product` 와 대칭), `/stock/[productId]/edit` 서버 컴포넌트가 데이터를 실어 클라이언트 폼에 넘긴다. 재고 목록의 줄에서 그 화면으로 들어간다.

**Tech Stack:** Next.js 16 (App Router, Turbopack), React 19, Supabase(PostgREST + RPC), zod 4, Tailwind 4

## Global Constraints

- **이 저장소에는 테스트 러너가 없다.** `package.json` 에 `test` 스크립트가 없고 jest/vitest 도 없다. 검증 수단은 세 가지뿐이다: **SQL 스모크(롤백 트랜잭션)**, `tsc`/`eslint`/`next build`, **Playwright 로 프로덕션 빌드 몰기**. 테스트 파일을 새로 만들지 마라 — 러너가 없어서 아무도 안 돌린다.
- **프로덕션 Supabase(`jnacpoqvnajjjfwwotnw`)에 직접 붙어 있다.** 스모크 테스트는 `raise exception` 으로 끝나는 롤백 트랜잭션 안에서만 한다. 데모 데이터를 지우지 마라.
- **pnpm 11 의 공급망 정책 때문에 `pnpm lint` / `pnpm exec` 가 막힌다.** 바이너리를 직접 불러라: `./node_modules/.bin/tsc --noEmit`, `./node_modules/.bin/eslint`, `./node_modules/.bin/next build`.
- **주석은 한국어로, 무엇이 아니라 왜를 쓴다.** 특히 "이렇게 안 하면 무엇이 깨지는지". 코드를 읽으면 아는 것은 쓰지 않는다.
- **색은 토큰으로.** `bg-red-500` 이 아니라 `bg-danger` (`app/globals.css`).
- **DB 값은 영문, 한국어 라벨은 `lib/constants.ts`.**
- 새 함수는 전부 `security invoker` + `set search_path = public, pg_temp`. 빠뜨리면 보안 어드바이저가 `function_search_path_mutable` 로 지적한다.
- 모든 서버 액션 첫 줄은 `await requireUser()`. proxy 검사는 최적화이지 방어선이 아니다.
- 작업 브랜치는 `claude/inventory-management-planning-fk6i1t` 하나뿐이다. `main` 을 건드리지 마라.

---

### Task 1: `update_product` RPC

**Files:**
- Create: `supabase/migrations/20260731000001_update_product_rpc.sql`

**Interfaces:**
- Consumes: 기존 테이블 `products`, `variants`, `barcodes`
- Produces: `public.update_product(p_product_id uuid, p_name text, p_category_id uuid, p_description text, p_variants jsonb) returns void`
  - `p_variants` 원소: `{ "variant_id": uuid, "sale_price": number, "low_stock_threshold": number, "barcode": string|null }`

- [ ] **Step 1: 마이그레이션 파일을 쓴다**

`supabase/migrations/20260731000001_update_product_rpc.sql`:

```sql
-- ---------------------------------------------------------------------------
-- 0014 : 상품 수정 RPC
--
-- 서버 액션에서 products update 와 variants update 를 N 번 따로 호출하면
-- 부분 실패가 남는다. 상품명은 저장됐는데 세 번째 변형에서 터지면 절반만 바뀐
-- 채로 끝나고, 화면은 저장에 실패했다고 말한다. create_product 가 같은 이유로
-- 함수 하나로 묶여 있다(0010). 대칭을 맞춘다.
--
-- 여기서 건드리지 않는 것과 그 이유:
--   stock_qty     원장(stock_movements)이 진실이고 이 컬럼은 캐시다. 손으로
--                 덮으면 v_stock_integrity 에 불일치로 뜬다
--   cost_price    입고 전표가 만드는 이동평균이다. 덮으면 과거 마진이 거짓이 된다
--   options       옵션 축을 바꾸면 기존 변형의 라벨이 깨진다
--   sku           전역 unique 라 실수로 겹치면 저장이 통째로 막힌다
--   is_active     숨기기는 이 화면의 몫이 아니다
-- ---------------------------------------------------------------------------

create or replace function public.update_product(
  p_product_id  uuid,
  p_name        text,
  p_category_id uuid  default null,
  p_description text  default null,
  -- [{ variant_id, sale_price, low_stock_threshold, barcode }]
  p_variants    jsonb default '[]'::jsonb
) returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_item     jsonb;
  v_variant  uuid;
  v_barcode  text;
  v_current  text;
  v_rows     integer;
begin
  update public.products
     set name        = btrim(p_name),
         category_id = p_category_id,
         description = nullif(btrim(coalesce(p_description, '')), '')
   where id = p_product_id;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception '상품을 찾을 수 없습니다';
  end if;

  for v_item in select e from jsonb_array_elements(coalesce(p_variants, '[]'::jsonb)) e
  loop
    v_variant := (v_item->>'variant_id')::uuid;

    -- product_id 조건이 이 함수의 방어선이다. RLS 는 인증 사용자에게 모든 변형에
    -- 대한 접근을 준다. 이 조건이 없으면 남의 상품 variant_id 를 payload 에
    -- 실어 보내는 것만으로 그 상품 가격이 바뀐다. 서버 액션은 UI 를 거치지 않고
    -- POST 로 직접 불릴 수 있다.
    update public.variants
       set sale_price          = coalesce((v_item->>'sale_price')::numeric,
                                          sale_price),
           low_stock_threshold = coalesce((v_item->>'low_stock_threshold')::integer,
                                          low_stock_threshold)
     where id = v_variant
       and product_id = p_product_id;

    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      raise exception '이 상품의 재고 단위가 아닙니다';
    end if;

    -- 변형은 바코드를 여러 개 가질 수 있는데 화면은 대표 하나만 보여준다.
    -- variant_id 로 싹 지우면 화면에 안 보이던 나머지가 같이 날아간다.
    -- v_variant_stock 과 같은 규칙으로 대표 한 줄을 찾아 그 줄만 다룬다.
    v_barcode := nullif(btrim(coalesce(v_item->>'barcode', '')), '');

    select b.code into v_current
      from public.barcodes b
     where b.variant_id = v_variant
     order by b.is_primary desc, b.created_at
     limit 1;

    if v_barcode is distinct from v_current then
      if v_current is not null then
        delete from public.barcodes where code = v_current;
      end if;
      if v_barcode is not null then
        insert into public.barcodes (code, variant_id, is_primary)
        values (v_barcode, v_variant, true);
      end if;
    end if;
  end loop;
end $$;

comment on function public.update_product(uuid, text, uuid, text, jsonb) is
  '상품 기본 정보와 변형별 판매가·최소재고·대표 바코드를 한 트랜잭션에 저장';

grant execute on function public.update_product(uuid, text, uuid, text, jsonb)
  to authenticated;
```

- [ ] **Step 2: 적용 전에 스모크부터 돌려서 함수가 없다는 것을 확인한다**

MCP `execute_sql` 로:

```sql
select to_regprocedure('public.update_product(uuid,text,uuid,text,jsonb)') as fn;
```

기대: `fn` 이 `null`. (있으면 이미 적용된 것이니 Step 3 을 건너뛰지 말고 파일 내용과 DB 정의가 같은지 먼저 확인해라.)

- [ ] **Step 3: 마이그레이션을 적용한다**

MCP `apply_migration` 으로 `name: "update_product_rpc"`, `query:` 위 파일 내용 전체.

- [ ] **Step 4: 기록된 version 을 파일명에 맞춘다**

`apply_migration` 은 자체 타임스탬프를 찍는다. 2026-07-31 에 13개를 파일명에 맞춰뒀으므로 새 것 하나 때문에 다시 어긋나게 두지 않는다.

```sql
update supabase_migrations.schema_migrations
   set version = '20260731000001'
 where name = 'update_product_rpc';

select version, name from supabase_migrations.schema_migrations order by version;
```

기대: 14개가 `20260730000001`~`20260730000013`, `20260731000001` 로 나온다.

- [ ] **Step 5: SQL 스모크를 돌린다 (롤백 트랜잭션)**

MCP `execute_sql` 로. 전부 `raise exception` 으로 끝나므로 프로덕션에 흔적이 남지 않는다.

```sql
do $$
declare
  r        text := '';
  v_pid    uuid;
  v_vid    uuid;
  v_other  uuid;
  v_qty    integer;
  v_cost   numeric;
  v_name   text;
  v_price  numeric;
  v_thr    integer;
  v_code   text;
  v_cnt    integer;
  v_err    text;
begin
  -- 준비: 상품 두 개를 만든다. 두 번째는 "남의 변형" 검사에 쓴다.
  v_pid := public.create_product(
    '스모크 상품', null, null, '[]'::jsonb,
    '[{"sale_price":1000,"initial_unit_cost":600,"initial_qty":7,
       "low_stock_threshold":3,"barcode":"SMOKE-A-0001"}]'::jsonb);
  v_other := public.create_product(
    '스모크 상품2', null, null, '[]'::jsonb,
    '[{"sale_price":2000,"initial_unit_cost":900,"initial_qty":0,
       "low_stock_threshold":0,"barcode":null}]'::jsonb);

  select id into v_vid from public.variants where product_id = v_pid;

  -- 1) 값이 바뀐다
  perform public.update_product(v_pid, '이름 바꿈', null, '설명 추가',
    format('[{"variant_id":"%s","sale_price":1500,"low_stock_threshold":9,
             "barcode":"SMOKE-A-0001"}]', v_vid)::jsonb);
  select name into v_name from public.products where id = v_pid;
  select sale_price, low_stock_threshold into v_price, v_thr
    from public.variants where id = v_vid;
  r := r || format(E'\n1) 이름=%s 판매가=%s 최소재고=%s (기대 이름 바꿈/1500/9)',
                   v_name, v_price, v_thr);

  -- 2) 재고와 원가는 안 바뀐다 (이 함수의 존재 이유 중 하나)
  select stock_qty, cost_price into v_qty, v_cost
    from public.variants where id = v_vid;
  r := r || format(E'\n2) 재고=%s 원가=%s (기대 7 / 600)', v_qty, v_cost);

  -- 3) 바코드 교체
  perform public.update_product(v_pid, '이름 바꿈', null, null,
    format('[{"variant_id":"%s","sale_price":1500,"low_stock_threshold":9,
             "barcode":"SMOKE-A-9999"}]', v_vid)::jsonb);
  select code into v_code from public.barcodes where variant_id = v_vid;
  select count(*) into v_cnt from public.barcodes where variant_id = v_vid;
  r := r || format(E'\n3) 바코드=%s 개수=%s (기대 SMOKE-A-9999 / 1)', v_code, v_cnt);

  -- 4) 대표가 아닌 바코드는 살아남는다
  insert into public.barcodes (code, variant_id, is_primary)
  values ('SMOKE-A-8888', v_vid, false);
  perform public.update_product(v_pid, '이름 바꿈', null, null,
    format('[{"variant_id":"%s","sale_price":1500,"low_stock_threshold":9,
             "barcode":"SMOKE-A-7777"}]', v_vid)::jsonb);
  select count(*) into v_cnt from public.barcodes where variant_id = v_vid;
  r := r || format(E'\n4) 바코드 개수=%s (기대 2: 7777 과 8888)', v_cnt);
  select count(*) into v_cnt
    from public.barcodes where variant_id = v_vid and code = 'SMOKE-A-8888';
  r := r || format(E'\n4b) 8888 생존=%s (기대 1)', v_cnt);

  -- 5) 바코드 비우기 → 대표만 사라진다
  perform public.update_product(v_pid, '이름 바꿈', null, null,
    format('[{"variant_id":"%s","sale_price":1500,"low_stock_threshold":9,
             "barcode":null}]', v_vid)::jsonb);
  select count(*) into v_cnt from public.barcodes where variant_id = v_vid;
  r := r || format(E'\n5) 남은 바코드=%s (기대 1)', v_cnt);

  -- 6) 남의 변형은 거부한다
  begin
    perform public.update_product(v_other, '남의 것', null, null,
      format('[{"variant_id":"%s","sale_price":99999,
               "low_stock_threshold":0}]', v_vid)::jsonb);
    r := r || E'\n6) FAIL — 거부되지 않았다';
  exception when others then
    get stacked diagnostics v_err = message_text;
    r := r || format(E'\n6) 거부됨: %s', v_err);
  end;
  select sale_price into v_price from public.variants where id = v_vid;
  r := r || format(E'\n6b) 원래 판매가 유지=%s (기대 1500)', v_price);

  -- 7) 없는 상품은 거부한다
  begin
    perform public.update_product(gen_random_uuid(), '없음', null, null, '[]'::jsonb);
    r := r || E'\n7) FAIL — 거부되지 않았다';
  exception when others then
    get stacked diagnostics v_err = message_text;
    r := r || format(E'\n7) 거부됨: %s', v_err);
  end;

  -- 8) 빈 변형 배열이면 상품 필드만 바뀐다
  perform public.update_product(v_pid, '빈 배열', null, null, '[]'::jsonb);
  select name into v_name from public.products where id = v_pid;
  r := r || format(E'\n8) 이름=%s (기대 빈 배열)', v_name);

  -- 9) 다른 상품이 쓰는 바코드는 23505 로 막힌다
  begin
    perform public.update_product(v_pid, '빈 배열', null, null,
      format('[{"variant_id":"%s","sale_price":1500,"low_stock_threshold":9,
               "barcode":"SMOKE-A-8888"}]', v_vid)::jsonb);
    r := r || E'\n9) 같은 변형의 다른 바코드로 교체 — 통과(정상)';
  exception when others then
    get stacked diagnostics v_err = message_text;
    r := r || format(E'\n9) %s', v_err);
  end;

  -- 10) 원장은 손대지 않았다
  select count(*) into v_cnt from public.v_stock_integrity;
  r := r || format(E'\n10) v_stock_integrity 행수=%s (기대 0)', v_cnt);

  raise exception 'SMOKE%', r;
end $$;
```

기대(에러 메시지로 돌아온다):
```
1) 이름=이름 바꿈 판매가=1500.00 최소재고=9
2) 재고=7 원가=600.00          ← 안 바뀐 것이 핵심
3) 바코드=SMOKE-A-9999 개수=1
4) 바코드 개수=2   4b) 8888 생존=1   ← 대표 아닌 것이 살아남은 것이 핵심
5) 남은 바코드=1
6) 거부됨: 이 상품의 재고 단위가 아닙니다   6b) 원래 판매가 유지=1500.00
7) 거부됨: 상품을 찾을 수 없습니다
8) 이름=빈 배열
10) v_stock_integrity 행수=0
```

- [ ] **Step 6: 롤백됐는지 확인한다**

```sql
select count(*) as leftover from public.products where name like '스모크%';
```

기대: `0`. 0 이 아니면 트랜잭션이 커밋된 것이니 그 행을 지워라.

- [ ] **Step 7: 보안 어드바이저를 본다**

MCP `get_advisors` `type: "security"`. 새 함수에 `function_search_path_mutable` 경고가 없어야 한다.

- [ ] **Step 8: 커밋**

```bash
git add supabase/migrations/20260731000001_update_product_rpc.sql
git commit -m "상품 수정 RPC (update_product)"
```

---

### Task 2: `updateProduct` 서버 액션

**Files:**
- Modify: `app/(app)/stock/actions.ts` (파일 끝에 추가. `humanize()` 를 그대로 쓴다)

**Interfaces:**
- Consumes: Task 1 의 `public.update_product`, 기존 `humanize(error)`, `requireUser()`, `lib/action-state.ts` 의 `ok()`/`fail()`
- Produces: `updateProduct(prev: ActionState, formData: FormData): Promise<ActionState>` — 폼은 `payload` 라는 이름의 hidden 필드에 JSON 한 덩이를 싣는다

- [ ] **Step 1: `actions.ts` 위쪽 import 에 `ActionState` 를 더한다**

기존:
```ts
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
```

바꾼 뒤:
```ts
import { fail, ok, type ActionState } from '@/lib/action-state'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
```

- [ ] **Step 2: 파일 끝에 액션을 추가한다**

```ts
// ---------------------------------------------------------------------------
// 수정
// ---------------------------------------------------------------------------

const editVariantSchema = z.object({
  variantId: z.uuid(),
  salePrice: z.number().int().min(0).max(1_000_000_000),
  lowStockThreshold: z.number().int().min(0).max(1_000_000),
  // 4자 하한은 DB 의 check 제약과 같은 값이다. 여기서 먼저 걸러야 사용자가
  // 제약 위반 원문을 보는 일이 없다.
  barcode: z
    .string()
    .trim()
    .min(4, { error: '바코드는 4자 이상이어야 합니다' })
    .max(64)
    .nullable(),
})

const editPayloadSchema = z.object({
  productId: z.uuid(),
  name: z.string().trim().min(1, { error: '상품명을 입력하세요' }).max(120),
  categoryId: z.uuid().nullable(),
  description: z.string().trim().max(500).nullable(),
  variants: z.array(editVariantSchema).max(200),
})

export async function updateProduct(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser()

  const raw = formData.get('payload')
  if (typeof raw !== 'string') return fail('폼 데이터를 읽지 못했습니다')

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return fail('폼 데이터를 읽지 못했습니다')
  }

  const parsed = editPayloadSchema.safeParse(json)
  if (!parsed.success) return fail(parsed.error.issues[0].message)

  const { productId, name, categoryId, description, variants } = parsed.data

  // 폼 안에서 바코드가 겹치는 경우. DB 도 막지만 어느 값인지 알려주려면
  // 여기서 먼저 봐야 한다.
  const codes = variants.map((v) => v.barcode).filter((c): c is string => Boolean(c))
  const dupe = codes.find((c, i) => codes.indexOf(c) !== i)
  if (dupe) return fail(`바코드 ${dupe} 가 여러 줄에 중복으로 들어갔습니다`)

  const supabase = await createClient()
  const { error } = await supabase.rpc('update_product', {
    p_product_id: productId,
    p_name: name,
    p_category_id: categoryId ?? undefined,
    p_description: description ?? undefined,
    p_variants: variants.map((v) => ({
      variant_id: v.variantId,
      sale_price: v.salePrice,
      low_stock_threshold: v.lowStockThreshold,
      barcode: v.barcode,
    })),
  })

  if (error) return fail(humanize(error))

  // 재고 목록과 수정 화면 둘 다 방금 값을 보여줘야 한다.
  revalidatePath('/stock')
  revalidatePath(`/stock/${productId}/edit`)

  // createProduct 와 달리 redirect 하지 않는다. 가격을 고치고 나서 재고를
  // 확인하는 흐름이 자연스럽고, 여러 변형을 연달아 고치는 일도 잦다.
  return ok('저장했습니다')
}
```

- [ ] **Step 3: 타입을 다시 만든다**

RPC 가 새로 생겼으므로 `lib/database.types.ts` 에 없다. MCP `generate_typescript_types` 로 만들어 `lib/database.types.ts` 를 덮어쓴다.

- [ ] **Step 4: 타입체크와 lint**

```bash
./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/eslint
```

기대: 둘 다 출력 없이 종료 코드 0. `update_product` 가 타입에 없다고 하면 Step 3 이 안 된 것이다.

- [ ] **Step 5: 커밋**

```bash
git add "app/(app)/stock/actions.ts" lib/database.types.ts
git commit -m "상품 수정 서버 액션"
```

---

### Task 3: 수정 화면

**Files:**
- Create: `app/(app)/stock/[productId]/edit/page.tsx`
- Create: `app/(app)/stock/[productId]/edit/edit-form.tsx`

**Interfaces:**
- Consumes: Task 2 의 `updateProduct`, `v_variant_stock` 뷰(변형별 `variant_id`·`option_label`·`stock_qty`·`cost_price`·`sale_price`·`low_stock_threshold`·`barcode`), `components/ui/field.tsx` 의 `Input`/`NumberInput`/`Select`, `components/ui/card.tsx` 의 `Card`/`CardHeader`/`CardTitle`/`CardBody`
- Produces: `/stock/[productId]/edit` 경로. `EditProductForm` 은 이 화면 전용이라 밖에서 쓰지 않는다.

- [ ] **Step 1: 서버 컴포넌트를 만든다**

`app/(app)/stock/[productId]/edit/page.tsx`:

```tsx
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'

import { EditProductForm, type EditVariant } from './edit-form'
import type { CategoryOption } from '../../new/product-form'

export const metadata = { title: '상품 수정' }

export default async function EditProductPage({
  params,
}: {
  // Next.js 16 에서 params 는 Promise 다.
  params: Promise<{ productId: string }>
}) {
  const { productId } = await params
  const supabase = await createClient()

  const [product, rows, categories] = await Promise.all([
    supabase
      .from('products')
      .select('id, name, category_id, description')
      .eq('id', productId)
      .maybeSingle(),
    // 변형 값과 재고·원가를 한 번에 받으려고 뷰를 쓴다. 옵션 라벨도 뷰가 만든다.
    supabase
      .from('v_variant_stock')
      .select(
        'variant_id, option_label, sale_price, low_stock_threshold, barcode, stock_qty, cost_price',
      )
      .eq('product_id', productId),
    supabase.from('categories').select('id, name, parent_id'),
  ])

  if (!product.data) notFound()

  const catRows = categories.data ?? []
  const nameById = new Map(catRows.map((c) => [c.id, c.name]))

  // 2단 계층을 "대분류 > 소분류" 한 줄로 편다. optgroup 을 쓰면 대분류 자체를
  // 고를 수 없어서 소분류가 없는 카테고리가 선택지에서 사라진다.
  const options: CategoryOption[] = catRows
    .map((c) => ({
      id: c.id,
      label: c.parent_id ? `${nameById.get(c.parent_id) ?? '?'} > ${c.name}` : c.name,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ko'))

  const variants: EditVariant[] = (rows.data ?? []).map((v) => ({
    variantId: v.variant_id!,
    label: v.option_label ?? '옵션 없음',
    salePrice: String(v.sale_price ?? 0),
    lowStockThreshold: String(v.low_stock_threshold ?? 0),
    barcode: v.barcode ?? '',
    stockQty: v.stock_qty ?? 0,
    costPrice: Number(v.cost_price ?? 0),
  }))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link
          href="/stock"
          aria-label="재고로 돌아가기"
          className="text-ink-muted hover:bg-surface-sunken hover:text-ink -ml-2 inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors"
        >
          <ChevronLeft size={20} aria-hidden />
        </Link>
        <h1 className="text-ink text-lg font-semibold tracking-tight">상품 수정</h1>
      </div>

      <EditProductForm
        productId={product.data.id}
        initialName={product.data.name}
        initialCategoryId={product.data.category_id ?? ''}
        initialDescription={product.data.description ?? ''}
        categories={options}
        initialVariants={variants}
      />
    </div>
  )
}
```

- [ ] **Step 2: 클라이언트 폼을 만든다**

`app/(app)/stock/[productId]/edit/edit-form.tsx`:

```tsx
'use client'

import Link from 'next/link'
import { useActionState, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, NumberInput, Select } from '@/components/ui/field'
import { formatQty, formatWon } from '@/lib/constants'
import type { ActionState } from '@/lib/action-state'

import { updateProduct } from '../../actions'
import type { CategoryOption } from '../../new/product-form'

export type EditVariant = {
  variantId: string
  label: string
  salePrice: string
  lowStockThreshold: string
  barcode: string
  stockQty: number
  costPrice: number
}

function toInt(value: string): number {
  const n = Number(value.replace(/[^\d]/g, ''))
  return Number.isFinite(n) ? n : 0
}

/**
 * 좁은 화면에서만 보이는 필드 라벨.
 *
 * 넓은 화면에는 머리글 줄이 한 번 있으므로 줄마다 라벨을 반복하면 표가 읽히지
 * 않는다. 좁은 화면에는 머리글이 없으니 라벨이 있어야 한다. 어느 쪽이든 입력에는
 * aria-label 이 붙으므로 스크린리더는 항상 읽을 수 있다.
 */
function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-ink-muted text-xs sm:hidden">{label}</span>
      {children}
    </div>
  )
}

const GRID = 'sm:grid-cols-[1.6fr_1fr_1fr_1.4fr]'

export function EditProductForm({
  productId,
  initialName,
  initialCategoryId,
  initialDescription,
  categories,
  initialVariants,
}: {
  productId: string
  initialName: string
  initialCategoryId: string
  initialDescription: string
  categories: CategoryOption[]
  initialVariants: EditVariant[]
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updateProduct,
    null,
  )

  const [name, setName] = useState(initialName)
  const [categoryId, setCategoryId] = useState(initialCategoryId)
  const [description, setDescription] = useState(initialDescription)
  const [variants, setVariants] = useState<EditVariant[]>(initialVariants)

  function setVariant(variantId: string, patch: Partial<EditVariant>) {
    setVariants((prev) =>
      prev.map((v) => (v.variantId === variantId ? { ...v, ...patch } : v)),
    )
  }

  // 옵션 축이 동적이라 폼 필드로 펼치는 대신 JSON 한 덩이로 보낸다.
  // 검증은 서버의 zod 와 DB 제약이 다시 한다.
  const payload = useMemo(
    () =>
      JSON.stringify({
        productId,
        name,
        categoryId: categoryId || null,
        description: description.trim() || null,
        variants: variants.map((v) => ({
          variantId: v.variantId,
          salePrice: toInt(v.salePrice),
          lowStockThreshold: toInt(v.lowStockThreshold),
          barcode: v.barcode.trim() || null,
        })),
      }),
    [productId, name, categoryId, description, variants],
  )

  return (
    <form action={formAction} className="flex flex-col gap-4 pb-4">
      <input type="hidden" name="payload" value={payload} />

      <Card>
        <CardHeader>
          <CardTitle>기본 정보</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <Input
            label="상품명"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={120}
          />
          <Select
            label="카테고리"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">선택 안 함</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
          <Input
            label="설명"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="선택 입력"
            maxLength={500}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>재고 단위 {variants.length}개</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          <div
            className={`text-ink-muted hidden gap-2 px-1 text-xs sm:grid ${GRID}`}
            aria-hidden
          >
            <span>옵션</span>
            <span>판매가</span>
            <span>최소재고</span>
            <span>바코드</span>
          </div>

          {variants.map((v) => (
            <div
              key={v.variantId}
              className={`border-border-base grid grid-cols-2 gap-2 rounded-lg border p-3 sm:items-center sm:rounded-none sm:border-0 sm:border-b sm:p-0 sm:pb-3 ${GRID}`}
            >
              <div className="col-span-2 sm:col-span-1">
                <div className="text-ink text-sm font-medium sm:truncate">
                  {v.label}
                </div>
                {/* 재고와 원가는 원장이 만드는 값이라 고칠 수 없다. 그래도
                    보여주는 이유는 판매가를 얼마로 할지 정할 근거이기 때문이다. */}
                <div className="text-ink-subtle mt-0.5 text-xs" data-numeric>
                  재고 {formatQty(v.stockQty)}개 · 원가 {formatWon(v.costPrice)}
                </div>
              </div>

              <Cell label="판매가">
                <NumberInput
                  aria-label={`${v.label} 판매가`}
                  value={v.salePrice}
                  onChange={(e) =>
                    setVariant(v.variantId, { salePrice: e.target.value })
                  }
                />
              </Cell>
              <Cell label="최소재고">
                <NumberInput
                  aria-label={`${v.label} 최소재고`}
                  value={v.lowStockThreshold}
                  onChange={(e) =>
                    setVariant(v.variantId, { lowStockThreshold: e.target.value })
                  }
                />
              </Cell>
              <div className="col-span-2 sm:col-span-1">
                <Cell label="바코드">
                  <Input
                    aria-label={`${v.label} 바코드`}
                    placeholder="선택"
                    inputMode="numeric"
                    autoComplete="off"
                    value={v.barcode}
                    onChange={(e) =>
                      setVariant(v.variantId, { barcode: e.target.value })
                    }
                    maxLength={64}
                  />
                </Cell>
              </div>
            </div>
          ))}

          <p className="text-ink-muted text-sm leading-relaxed">
            재고와 원가는 여기서 고칠 수 없습니다. 재고는 입출고 전표의 합이고
            원가는 입고가 만드는 이동평균입니다.{' '}
            <Link href="/movements/new" className="text-primary font-medium">
              입출고에서 바꾸세요
            </Link>
            .
          </p>
          <p className="text-ink-subtle text-sm leading-relaxed">
            옵션 축과 재고 단위 개수는 이 화면에서 바뀌지 않습니다.
          </p>
        </CardBody>
      </Card>

      <p aria-live="polite" className="min-h-5 text-sm">
        {state?.status === 'error' ? (
          <span className="text-danger">{state.message}</span>
        ) : state?.status === 'ok' ? (
          <span className="text-in">{state.message}</span>
        ) : null}
      </p>

      <Button type="submit" size="lg" full disabled={pending || !name.trim()}>
        {pending ? '저장 중…' : '저장'}
      </Button>
    </form>
  )
}
```

- [ ] **Step 3: 타입체크·lint·빌드**

```bash
./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/eslint && ./node_modules/.bin/next build
```

기대: 셋 다 통과. 라우트 목록에 `ƒ /stock/[productId]/edit` 가 새로 보인다.

- [ ] **Step 4: 브라우저로 확인한다**

프로덕션 서버를 띄운다:
```bash
./node_modules/.bin/next start --port 3100
```

데모 상품의 id 를 얻는다 (MCP `execute_sql`):
```sql
select p.id, p.name, count(v.id) as variants
  from public.products p join public.variants v on v.product_id = p.id
 group by p.id, p.name order by variants desc limit 3;
```

`반팔 티셔츠`(변형 4개)의 id 로 `http://localhost:3100/stock/<id>/edit` 를 연다.
`.claude/skills/run-app/SKILL.md` 의 Playwright 방식을 쓴다. **IDE 브라우저 패널로
보지 마라** — 스킬의 `requestAnimationFrame` 항목을 읽어라.

눈으로 확인할 것:
- 변형 4줄이 각자 현재 판매가·최소재고·바코드를 갖고 뜬다
- 각 줄 아래에 "재고 N개 · 원가 N원" 이 회색으로 있고 입력칸이 아니다
- 390px 에서 줄이 안 잘리고 가로 스크롤이 없다

- [ ] **Step 5: 저장이 실제로 되는지 확인한다**

`반팔 티셔츠` 한 변형의 최소재고를 바꾸고 저장 → "저장했습니다" 가 뜨는지,
`/stock` 목록에 반영되는지 확인한다. 그 뒤 원래 값으로 되돌린다 (데모 데이터를
바꾼 채로 두지 마라).

```sql
select v.id, v.sale_price, v.low_stock_threshold
  from public.variants v join public.products p on p.id = v.product_id
 where p.name = '반팔 티셔츠' order by v.created_at;

select count(*) as drift from public.v_stock_integrity;  -- 0 이어야 한다
```

- [ ] **Step 6: 커밋**

```bash
git add "app/(app)/stock/[productId]"
git commit -m "상품 수정 화면"
```

---

### Task 4: 재고 목록에서 수정 화면으로

**Files:**
- Modify: `app/(app)/stock/stock-cards.tsx:17-19` (카드 전체를 링크로)
- Modify: `app/(app)/stock/stock-table.tsx:85` (상품명 칸을 링크로)

**Interfaces:**
- Consumes: `StockRow` 의 `product_id`, Task 3 의 `/stock/[productId]/edit`
- Produces: 없음 (화면 변경만)

- [ ] **Step 1: 모바일 카드를 링크로 감싼다**

`stock-cards.tsx` 에서 `import Link from 'next/link'` 를 맨 위에 더하고, `<li>` 안쪽을 바꾼다.

기존:
```tsx
        <li key={row.variant_id}>
          <Card className="flex flex-col gap-2 p-4">
```

바꾼 뒤 (닫는 쪽도 `</Card></Link></li>` 로 맞춰야 한다):
```tsx
        <li key={row.variant_id}>
          {/* 카드 전체가 링크다. 계산대에서 엄지로 누르는 화면이라 표적이 클수록
              좋고, 줄 안에 따로 "수정" 버튼을 두면 그 버튼이 더 작아진다. */}
          <Link href={`/stock/${row.product_id}/edit`} className="block">
            <Card className="hover:border-border-strong flex flex-col gap-2 p-4 transition-colors">
```

- [ ] **Step 2: 데스크톱 표의 상품명 칸을 링크로**

`stock-table.tsx` 85행. `<tr>` 을 `<a>` 로 감쌀 수 없으므로 칸 안에 링크를 둔다.

기존:
```tsx
              <td className="text-ink px-3 py-2.5 font-medium">{row.product_name}</td>
```

바꾼 뒤:
```tsx
              <td className="px-3 py-2.5 font-medium">
                <Link
                  href={`/stock/${row.product_id}/edit`}
                  className="text-ink hover:text-primary"
                >
                  {row.product_name}
                </Link>
              </td>
```

`Link` 는 이 파일에 이미 import 돼 있다 (1행).

- [ ] **Step 3: 타입체크·lint·빌드**

```bash
./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/eslint && ./node_modules/.bin/next build
```

- [ ] **Step 4: 브라우저로 확인한다**

`/stock` 에서 데스크톱은 상품명을, 모바일은 카드를 눌러 수정 화면으로 가는지 본다.
같은 상품의 변형이 여러 줄이면 어느 줄을 눌러도 같은 상품 화면으로 간다 —
그게 의도다(화면이 상품 단위이므로).

- [ ] **Step 5: 커밋**

```bash
git add "app/(app)/stock/stock-cards.tsx" "app/(app)/stock/stock-table.tsx"
git commit -m "재고 목록에서 상품 수정 화면으로"
```

---

### Task 5: 전체 검증과 문서

**Files:**
- Modify: `docs/HANDOFF.md`
- Modify: `README.md` (데이터 모델 절에 `update_product` 한 줄)

**Interfaces:**
- Consumes: Task 1~4 전부
- Produces: 없음

- [ ] **Step 1: 두 셸 전 화면을 다시 훑는다**

프로덕션 빌드를 띄우고 Playwright 로 여덟 경로 + 새 경로를 확인한다. 각 화면에서
`main` 에 글자가 있고, 콘솔 오류가 0 이고, 가로 스크롤이 없어야 한다. 새로
추가된 화면 때문에 기존 화면이 깨지지 않았는지 보는 것이 목적이다.

- [ ] **Step 2: 원장이 멀쩡한지 마지막으로 본다**

```sql
select (select count(*) from public.v_stock_integrity) as drift,
       (select count(*) from public.products)          as products,
       (select count(*) from public.stock_movements)   as movements;
```

기대: `drift` 0, `products` 5, `movements` 45 (데모 데이터를 안 건드렸다면).

- [ ] **Step 3: `docs/HANDOFF.md` 를 고친다**

- "손대지 않은 것들"의 **상품 수정 화면** 항목을 지운다 (더 이상 구멍이 아니다)
- "만든 것" 표에 `/stock/[productId]/edit` 줄을 더한다
- 마이그레이션이 14개가 됐고 새 것의 version 도 파일명과 맞췄다고 적는다
- 여전히 못 하는 것을 적는다: 옵션 축 수정, 변형 추가·삭제, 상품 숨기기·삭제

- [ ] **Step 4: `README.md` 의 데이터 모델 절에 RPC 한 줄을 더한다**

`create_product` 를 설명하는 자리 옆에 `update_product` 를 같은 밀도로 적는다.

- [ ] **Step 5: 커밋하고 푸시한다**

```bash
git add docs/HANDOFF.md README.md
git commit -m "상품 수정 화면 — 인계 문서 갱신"
git push origin claude/inventory-management-planning-fk6i1t
```

- [ ] **Step 6: 프로덕션에 올릴지 확인받는다**

푸시는 preview 배포만 만든다 (프로덕션 브랜치가 `main` 이다). 라이브
https://zero-store-youngsim.vercel.app 를 갱신하려면 `vercel --prod` 를 다시
돌려야 한다. **되돌리기 어렵고 외부에 나가는 동작이므로 사용자에게 물어보고 해라.**

---

## Self-Review

**1. 스펙 커버리지**

| 스펙 항목 | 어디서 |
|---|---|
| 상품명·카테고리·설명 수정 | Task 1 RPC, Task 3 폼 |
| 변형 판매가·최소재고·바코드 수정 | Task 1 RPC, Task 3 폼 |
| `stock_qty`·`cost_price` 읽기 전용 | Task 1(UPDATE 문에 없음), Task 3(회색 표시), Task 1 스모크 2번 |
| 입출고로 가는 링크 | Task 3 Step 2 |
| 상품 통째로 한 화면 | Task 3 |
| 목록에서 진입 | Task 4 |
| RPC 하나로 묶기 | Task 1 |
| 변형 소속 검사 | Task 1(`and product_id =`), 스모크 6번 |
| 대표 바코드만 교체 | Task 1, 스모크 4·4b·5번 |
| 오류 문구 | Task 2(zod·중복), Task 1(P0001), 기존 `humanize`(23505) |
| 빈 변형 배열 허용 | 스모크 8번 |
| 마이그레이션 version 정렬 | Task 1 Step 4 |
| 검증(SQL·빌드·브라우저) | Task 1 Step 5, Task 3 Step 3~5, Task 5 |

빠진 것 없음.

**2. 플레이스홀더** — 없음. 모든 코드 단계에 실제 코드가 들어 있다.

**3. 타입 일관성**

- `EditVariant` 필드명이 Task 3 의 page.tsx(생성)와 edit-form.tsx(소비)에서 같다: `variantId`, `label`, `salePrice`, `lowStockThreshold`, `barcode`, `stockQty`, `costPrice`
- 액션의 zod 는 camelCase(`variantId`, `salePrice`, `lowStockThreshold`)를 받고 RPC 에는 snake_case(`variant_id`, `sale_price`, `low_stock_threshold`)로 넘긴다. Task 2 Step 2 의 `.map()` 이 그 변환이다
- 폼의 `payload` 필드 이름이 Task 2(`formData.get('payload')`)와 Task 3(`name="payload"`)에서 같다
- `CategoryOption` 은 `new/product-form.tsx` 에서 이미 export 돼 있고 Task 3 의 두 파일이 거기서 가져온다
