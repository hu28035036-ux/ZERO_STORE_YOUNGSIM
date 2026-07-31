-- 0016 상품 일괄 등록 (초도 발주 임포트)
--
-- 본사 발주 시트(초도·신제품)를 통째로 등록하는 경로가 생긴다.
-- 시트에는 앱에 없던 개념이 둘 있다 — 유통방식(CJFW/택배/쿠팡)과
-- 입수(한 박스에 몇 개). 발주 코드는 새 컬럼이 아니라 barcodes 에 담는다:
-- 거기 담아야 검색·스캔·수정 화면이 코드 변경 없이 그대로 먹는다.

-- ---------------------------------------------------------------------------
-- 컬럼 추가
--
-- channel 은 enum 이 아니라 자유 텍스트다. 유통방식은 본사 사정으로 언제든
-- 늘어나는 값이라(요구사항: 없는 값이면 새로 만들어 쓸 수 있어야 한다),
-- enum 으로 굳히면 값 하나 늘 때마다 마이그레이션이 필요해진다.
-- ---------------------------------------------------------------------------
alter table public.products
  add column channel         text,
  add column import_batch_id uuid;

comment on column public.products.channel is
  '유통방식 (CJFW/택배/쿠팡 등). 자유 텍스트 — 본사 사정으로 값이 늘어난다';
comment on column public.products.import_batch_id is
  '파일 일괄 등록 한 번으로 생긴 상품 묶음. 배치 단위 되돌리기의 키';

alter table public.variants
  add column units_per_pack integer
    check (units_per_pack is null or units_per_pack > 0);

comment on column public.variants.units_per_pack is
  '입수 — 발주 한 단위(박스)에 든 낱개 수. NULL 은 미입력';

-- ---------------------------------------------------------------------------
-- v_variant_stock 에 새 컬럼 노출
--
-- create or replace 는 기존 열의 이름·순서·타입이 그대로일 때만 통과한다.
-- 그래서 새 열은 반드시 SELECT 맨 끝에 붙인다. v_low_stock 은 select * 라
-- 재생성이 필요 없다.
-- ---------------------------------------------------------------------------
create or replace view public.v_variant_stock with (security_invoker = true) as
select
  v.id                                                as variant_id,
  p.id                                                as product_id,
  p.name                                              as product_name,
  c.id                                                as category_id,
  c.name                                              as category_name,
  public.fn_option_label(v.options, p.option_schema)  as option_label,
  v.options,
  v.sku,
  (select b.code
     from public.barcodes b
    where b.variant_id = v.id
    order by b.is_primary desc, b.created_at
    limit 1)                                          as barcode,
  v.stock_qty,
  v.low_stock_threshold,
  v.cost_price,
  v.sale_price,
  (v.sale_price - v.cost_price)                       as unit_margin,
  case when v.sale_price > 0
       then round(100 * (v.sale_price - v.cost_price) / v.sale_price, 1)
       else 0 end                                     as margin_rate,
  (v.stock_qty * v.cost_price)                        as stock_value,
  (v.stock_qty <= v.low_stock_threshold)              as is_low_stock,
  (v.stock_qty < 0)                                   as is_negative,
  v.is_active,
  p.is_active                                         as product_active,
  v.updated_at,
  p.channel,
  v.units_per_pack
from public.variants v
join public.products p       on p.id = v.product_id
left join public.categories c on c.id = p.category_id;

-- ---------------------------------------------------------------------------
-- create_product 확장 : p_channel, 변형별 units_per_pack
--
-- 파라미터가 늘어나는 시그니처 변경이다. create or replace 로 두면 옛 시그니처가
-- 오버로드로 남아 PostgREST rpc 호출이 모호성으로 죽는다. 반드시 drop 후 재생성.
-- ---------------------------------------------------------------------------
drop function public.create_product(text, uuid, text, jsonb, jsonb);

create function public.create_product(
  p_name          text,
  p_category_id   uuid    default null,
  p_description   text    default null,
  p_option_schema jsonb   default '[]'::jsonb,
  -- [{ options, sku, sale_price, cost_price, low_stock_threshold,
  --    barcode, initial_qty, initial_unit_cost, units_per_pack }]
  p_variants      jsonb   default '[]'::jsonb,
  p_channel       text    default null
) returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_product_id uuid;
  v_variant_id uuid;
  v_item       jsonb;
  v_options    jsonb;
  v_barcode    text;
  v_qty        integer;
  v_unit_cost  numeric(12,2);
  v_cost_seed  numeric(12,2);
begin
  if p_variants is null
     or jsonb_typeof(p_variants) <> 'array'
     or jsonb_array_length(p_variants) = 0 then
    -- 옵션이 없는 상품도 변형 1개를 갖는 것이 이 스키마의 전제다.
    -- 변형 없는 상품을 허용하면 재고 경로가 두 갈래가 된다.
    raise exception '상품에는 최소 한 개의 재고 단위가 필요합니다';
  end if;

  insert into public.products (name, category_id, description, option_schema, channel)
  values (btrim(p_name), p_category_id, nullif(btrim(coalesce(p_description, '')), ''),
          coalesce(p_option_schema, '[]'::jsonb),
          nullif(btrim(coalesce(p_channel, '')), ''))
  returning id into v_product_id;

  for v_item in select e from jsonb_array_elements(p_variants) e
  loop
    v_options   := coalesce(v_item->'options', '{}'::jsonb);
    v_qty       := coalesce((v_item->>'initial_qty')::integer, 0);
    v_unit_cost := coalesce((v_item->>'initial_unit_cost')::numeric, 0);

    -- 기초 재고가 있으면 원가는 입고 전표가 정한다. 여기서 미리 넣으면
    -- 이동평균 계산에 같은 금액이 두 번 반영된다.
    -- 재고가 0 이면 전표를 만들 수 없으므로 추정 원가를 그대로 둔다.
    v_cost_seed := case when v_qty > 0 then 0 else v_unit_cost end;

    insert into public.variants (
      product_id, options, sku, sale_price, cost_price, low_stock_threshold,
      units_per_pack
    )
    values (
      v_product_id,
      v_options,
      nullif(btrim(coalesce(v_item->>'sku', '')), ''),
      coalesce((v_item->>'sale_price')::numeric, 0),
      v_cost_seed,
      coalesce((v_item->>'low_stock_threshold')::integer, 0),
      (v_item->>'units_per_pack')::integer
    )
    returning id into v_variant_id;

    v_barcode := nullif(btrim(coalesce(v_item->>'barcode', '')), '');
    if v_barcode is not null then
      insert into public.barcodes (code, variant_id, is_primary)
      values (v_barcode, v_variant_id, true);
    end if;

    -- 기초 재고는 조정이 아니라 입고로 남긴다. 조정으로 넣으면 매입 통계에서
    -- 빠져서 "처음에 얼마어치 채웠는지"가 장부에서 사라진다.
    if v_qty > 0 then
      insert into public.stock_movements
        (variant_id, type, qty_delta, unit_cost, note)
      values
        (v_variant_id, 'purchase', v_qty, v_unit_cost, '기초 재고');
    end if;
  end loop;

  return v_product_id;
end $$;

comment on function public.create_product(text, uuid, text, jsonb, jsonb, text) is
  '상품·변형·바코드·기초재고를 한 트랜잭션으로 등록한다';

-- ---------------------------------------------------------------------------
-- update_product 확장 : p_channel, 변형별 units_per_pack
--
-- channel 은 폼이 항상 현재 값을 실어 보내는 전제다(이름·분류와 같은 규칙).
-- units_per_pack 은 키가 있을 때만 반영한다 — 빈 칸으로 지우는 것(NULL)과
-- 안 보낸 것(유지)을 구분해야 해서 coalesce 로는 안 된다.
-- ---------------------------------------------------------------------------
drop function public.update_product(uuid, text, uuid, text, jsonb);

create function public.update_product(
  p_product_id  uuid,
  p_name        text,
  p_category_id uuid  default null,
  p_description text  default null,
  -- [{ variant_id, sale_price, low_stock_threshold, barcode, units_per_pack }]
  p_variants    jsonb default '[]'::jsonb,
  p_channel     text  default null
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
         description = nullif(btrim(coalesce(p_description, '')), ''),
         channel     = nullif(btrim(coalesce(p_channel, '')), '')
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
                                          low_stock_threshold),
           units_per_pack      = case when v_item ? 'units_per_pack'
                                      then (v_item->>'units_per_pack')::integer
                                      else units_per_pack end
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

comment on function public.update_product(uuid, text, uuid, text, jsonb, text) is
  '상품 기본 정보와 변형별 판매가·최소재고·대표 바코드·입수를 한 트랜잭션에 저장';

-- ---------------------------------------------------------------------------
-- 상품 일괄 등록
--
-- 항목마다 create_product 를 부르는 루프가 전부다. 상품+변형+바코드+기초재고를
-- 어떻게 묶는지는 create_product 하나만 알아야 한다 — 여기서 insert 를 다시
-- 쓰면 규칙이 두 벌이 되어 반드시 어긋난다.
--
-- 판매 임포트(0015)와 달리 내용 지문을 쓰지 않는다. 상품에는 자연키(발주 코드·
-- 이름)가 있어서 재업로드는 미리보기의 중복 검사가 전 행을 잡고, 검사를 뚫고
-- 들어와도 barcodes PK 충돌이 트랜잭션 전체를 굴려 막는다.
--
-- p_products 예)
-- [{"name":"마이노멀 딸기잼","channel":"CJFW","category_id":"...",
--   "description":"제로스토어용 320g*12입 3.84Kg/BOX",
--   "variants":[{"sale_price":118800,"initial_qty":12,"initial_unit_cost":83160,
--                "units_per_pack":12,"barcode":"494524"}]}, ...]
-- ---------------------------------------------------------------------------
create function public.import_products(
  p_products jsonb
) returns table (
  product_id   uuid,
  product_name text,
  batch_id     uuid
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_batch uuid := gen_random_uuid();
  v_item  jsonb;
  v_id    uuid;
begin
  if p_products is null or jsonb_typeof(p_products) <> 'array'
     or jsonb_array_length(p_products) = 0 then
    raise exception '등록할 상품이 비어 있습니다';
  end if;

  for v_item in select e from jsonb_array_elements(p_products) e
  loop
    v_id := public.create_product(
      p_name          => v_item->>'name',
      p_category_id   => (v_item->>'category_id')::uuid,
      p_description   => v_item->>'description',
      p_option_schema => coalesce(v_item->'option_schema', '[]'::jsonb),
      p_variants      => coalesce(v_item->'variants', '[]'::jsonb),
      p_channel       => v_item->>'channel'
    );

    update public.products set import_batch_id = v_batch where id = v_id;

    product_id   := v_id;
    product_name := v_item->>'name';
    batch_id     := v_batch;
    return next;
  end loop;
end $$;

comment on function public.import_products(jsonb) is
  '발주 시트 일괄 등록. 전부 성공하거나 전부 없던 일이 된다';

-- ---------------------------------------------------------------------------
-- 배치 되돌리기 (RPC 전용, 화면 없음)
--
-- 상품 임포트는 드문 일이라 UI 를 만들지 않는다. 사고가 나면 SQL 로 부른다.
--
-- 기초재고 전표가 있는 상품은 stock_movements.variant_id 의 on delete restrict
-- 때문에 하드 삭제가 안 된다. 그래서 판매 임포트와 같은 방식으로 간다:
-- 반대 전표 + is_active=false. 단, 배치의 상품이 임포트 이후에 팔리거나
-- 입고됐다면 되돌리기를 거부한다 — 그 전표들까지 자동으로 풀 수는 없고,
-- 반쯤 되돌린 상태가 제일 위험하다.
--
-- 반대 전표는 원본 날짜에 넣는다(void_sale_order 와 같은 이유). 이 되돌림은
-- 반품이 아니라 "잘못 넣은 기록의 취소"라서 매입 통계가 그 임포트가 없던
-- 모습으로 돌아가야 한다. 언제 취소했는지는 created_at 이 남긴다.
-- ---------------------------------------------------------------------------
create function public.void_product_import(
  p_batch_id uuid,
  p_reason   text default null
) returns integer                      -- 되돌린 전표 수
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  m       public.stock_movements;
  v_count integer := 0;
begin
  if not exists (
    select 1 from public.products where import_batch_id = p_batch_id
  ) then
    raise exception '임포트 배치를 찾을 수 없습니다';
  end if;

  if exists (
    select 1
      from public.stock_movements sm
      join public.variants v on v.id = sm.variant_id
      join public.products p on p.id = v.product_id
     where p.import_batch_id = p_batch_id
       and not (sm.type = 'purchase'
                and sm.note = '기초 재고'
                and sm.reverses_id is null)
  ) then
    raise exception
      '이 배치의 상품에 임포트 이후 전표가 있어 되돌릴 수 없습니다. 개별로 정리하세요.';
  end if;

  for m in
    select sm.*
      from public.stock_movements sm
      join public.variants v on v.id = sm.variant_id
      join public.products p on p.id = v.product_id
     where p.import_batch_id = p_batch_id
     order by sm.variant_id              -- record_sale 과 같은 잠금 순서
  loop
    insert into public.stock_movements
      (variant_id, type, qty_delta, unit_cost, reverses_id, note, occurred_at)
    values
      (m.variant_id, m.type, -m.qty_delta, m.unit_cost, m.id,
       coalesce(p_reason, '상품 임포트 되돌림'), m.occurred_at);
    v_count := v_count + 1;
  end loop;

  -- v_stock_valuation 은 variants.is_active 만 보므로 변형도 함께 꺼야 한다.
  update public.variants v
     set is_active = false, updated_at = now()
    from public.products p
   where p.id = v.product_id
     and p.import_batch_id = p_batch_id;

  update public.products
     set is_active = false, updated_at = now()
   where import_batch_id = p_batch_id;

  return v_count;
end $$;

comment on function public.void_product_import(uuid, text) is
  '상품 임포트 배치 취소. 기초재고에 반대 전표를 넣고 상품을 숨긴다';

-- ---------------------------------------------------------------------------
-- 실행 권한 : 0009 와 같은 이유. 로그인 사용자만.
-- ---------------------------------------------------------------------------
revoke execute on function
  public.create_product(text, uuid, text, jsonb, jsonb, text),
  public.update_product(uuid, text, uuid, text, jsonb, text),
  public.import_products(jsonb),
  public.void_product_import(uuid, text)
from public, anon;

grant execute on function
  public.create_product(text, uuid, text, jsonb, jsonb, text),
  public.update_product(uuid, text, uuid, text, jsonb, text),
  public.import_products(jsonb),
  public.void_product_import(uuid, text)
to authenticated;
