-- ---------------------------------------------------------------------------
-- 0018 : POS 메뉴명 병기 (products.pos_name)
--
-- products.name 은 본사 발주 시트의 이름이고, 매장 POS 는 다른 이름을 쓴다.
-- POS 상품마스터 1,599건과 초도 358건을 대조해보면 이름이 실질적으로 다른 것이
-- 22% 나 된다 — 표기 차이가 아니라 브랜드가 아예 바뀐 것도 있다
-- (킬로리 얌얌쉐이크 → 데일리얌, 오츠카 나랑드사이다 → 동아 나랑드사이다 제로).
-- 한쪽만 저장하면 발주할 때와 매장에서 찾을 때 서로 다른 말을 쓰게 되고,
-- 판매기록 임포트의 이름 매칭도 절반이 헛돈다.
--
-- description 에 적어 두는 것으로는 안 된다. lib/search.ts 의 검색 조건이
-- product_name·sku·barcode 셋만 훑기 때문에, description 에 넣은 이름은 화면에
-- 보이기만 하고 검색으로는 영영 안 걸린다.
--
-- name 과 pos_name 의 주종은 바꾸지 않는다. 매장 사람이 아는 이름은 POS 쪽이지만
-- 이미 358개가 발주명으로 들어가 있어서, 지금 뒤집으면 초도 배치
-- (import_batch_id 6d725244-…) 이력과 어긋난다.
--
-- text[] 로 여러 별칭을 담고 싶은 유혹이 있는데 단수로 둔다. 배열이면 검색 조건이
-- ilike 로 안 끝나고 GIN 인덱스도 까다로워지는데, 지금 별칭의 출처는 POS 하나뿐이다.
-- 셋째 이름이 생기면 그때 늘린다. alt_name 처럼 출처가 흐린 이름을 쓰지 않는 것도
-- 같은 이유다 — POS 에서 온 이름이라는 게 드러나야 나중에 누가 무엇을 보고
-- 갱신할지 안다.
-- ---------------------------------------------------------------------------

alter table public.products add column pos_name text;

comment on column public.products.pos_name is
  '매장 POS 의 메뉴명. 발주 시트 이름(name)과 다를 때가 있어 검색이 둘 다 훑는다';

-- name 과 같은 검색 경로를 타야 하므로 인덱스도 같은 모양으로 만든다
-- (idx_products_name_trgm 참고). 이게 없으면 '%감자%' 가 pos_name 에서만
-- 순차 스캔이 된다. pg_trgm 은 extensions 스키마에 있어서 연산자 클래스를
-- 스키마까지 적는다 — 이 마이그레이션은 search_path 를 믿을 수 없는 경로로
-- 실행된다.
create index idx_products_pos_name_trgm
  on public.products using gin (pos_name extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 뷰 : drop 하지 않는다 — drop 하면 0009 가 준 grants 가 같이 날아간다.
-- create or replace 는 기존 열의 이름·순서·타입이 그대로일 때만 통과하므로
-- 새 열은 반드시 맨 끝에 붙인다. 0017 이 unit·purchase_unit_name 을 더한 뒤라
-- 마지막 열은 updated_at 이 아니라 purchase_unit_name 이다.
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
  -- 대표 바코드 (없으면 가장 먼저 등록된 것)
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
  v.units_per_pack,
  p.unit,
  p.purchase_unit_name,
  p.pos_name
from public.variants v
join public.products p       on p.id = v.product_id
left join public.categories c on c.id = p.category_id;

-- v_low_stock 의 select * 는 뷰를 만들 때 열 목록으로 펼쳐져 굳는다. 자동으로
-- 따라오지 않으므로 여기서 다시 만든다 (0016 이 이 함정을 밟았고 0017 이
-- 뒤늦게 정리했다). pg_depend 로 확인한 v_variant_stock 의존 뷰는 이것 하나다.
create or replace view public.v_low_stock with (security_invoker = true) as
select *
  from public.v_variant_stock
 where is_active and product_active
   and stock_qty <= low_stock_threshold;

-- ---------------------------------------------------------------------------
-- RPC : 인자가 바뀌는 함수는 반드시 drop 후 재생성.
-- create or replace 만 하면 옛 시그니처가 오버로드로 남아 PostgREST 가 어느
-- 쪽을 부를지 못 정하고 죽는다 (0016 이 밟은 함정).
--
-- 0017 이 두 함수에 p_unit·p_purchase_unit_name 을 더해 8인자로 만들어 놨다.
-- drop 할 때 그 시그니처를 그대로 적어야 한다.
-- ---------------------------------------------------------------------------

drop function public.create_product(text, uuid, text, jsonb, jsonb, text, text, text);
drop function public.update_product(uuid, text, uuid, text, jsonb, text, text, text);

-- 상품 하나를 만들려면 products → variants → barcodes 로 최소 세 번을 써야 한다.
-- 함수 하나로 묶으면 통째로 성공하거나 통째로 없던 일이 된다 (0010).
create function public.create_product(
  p_name               text,
  p_category_id        uuid    default null,
  p_description        text    default null,
  p_option_schema      jsonb   default '[]'::jsonb,
  -- [{ options, sku, sale_price, cost_price, low_stock_threshold,
  --    barcode, initial_qty, initial_unit_cost, units_per_pack }]
  p_variants           jsonb   default '[]'::jsonb,
  p_channel            text    default null,
  p_unit               text    default '개',
  p_purchase_unit_name text    default null,
  p_pos_name           text    default null
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

  insert into public.products
    (name, category_id, description, option_schema, channel,
     unit, purchase_unit_name, pos_name)
  values
    (btrim(p_name), p_category_id, nullif(btrim(coalesce(p_description, '')), ''),
     coalesce(p_option_schema, '[]'::jsonb),
     nullif(btrim(coalesce(p_channel, '')), ''),
     coalesce(nullif(btrim(coalesce(p_unit, '')), ''), '개'),
     nullif(btrim(coalesce(p_purchase_unit_name, '')), ''),
     nullif(btrim(coalesce(p_pos_name, '')), ''))
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

comment on function public.create_product(text, uuid, text, jsonb, jsonb, text, text, text, text) is
  '상품·변형·바코드·기초재고를 한 트랜잭션으로 등록한다';

-- 부분 실패를 남기지 않으려고 함수 하나로 묶는다 (0014 와 같은 이유).
-- 여기서 여전히 건드리지 않는 것: options(옵션 축), sku(전역 unique),
-- is_active(숨기기는 이 화면의 몫이 아니다).
create function public.update_product(
  p_product_id         uuid,
  p_name               text,
  p_category_id        uuid    default null,
  p_description        text    default null,
  -- [{ variant_id, sale_price, cost_price, counted_qty,
  --    low_stock_threshold, barcode, units_per_pack }]
  p_variants           jsonb   default '[]'::jsonb,
  p_channel            text    default null,
  p_unit               text    default null,
  p_purchase_unit_name text    default null,
  p_pos_name           text    default null
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
  v_counted  integer;
  v_stock    integer;
begin
  update public.products
     set name        = btrim(p_name),
         category_id = p_category_id,
         description = nullif(btrim(coalesce(p_description, '')), ''),
         channel     = nullif(btrim(coalesce(p_channel, '')), ''),
         -- unit 은 not null 이라 비우면(null·공백) 현재 값을 유지한다.
         -- 묶음 이름은 null 자체가 "없음"이라는 뜻이 있는 값이다 — 화면이
         -- 언제나 현재 상태 전체를 보내므로, 안 보내면 지우는 것으로 동작한다.
         unit               = coalesce(nullif(btrim(coalesce(p_unit, '')), ''), unit),
         purchase_unit_name = nullif(btrim(coalesce(p_purchase_unit_name, '')), ''),
         -- channel 과 달리 NULL 과 빈 문자열을 구분한다.
         --   NULL(=인자를 안 보냄) → 현재 값 유지
         --   빈 문자열·공백        → NULL 로 지움
         -- channel 규칙("폼이 늘 현재 값을 보내니 빈 값은 지운다")을 그대로 쓰면
         -- 컬럼이 생긴 직후가 위험하다. 배포된 옛 앱은 이 인자를 모르니 안 보내고,
         -- 그러면 방금 채워 넣은 값이 상품 수정 저장 한 번에 전부 지워진다.
         -- 실제로 298건을 채운 뒤 이 구멍을 발견했다.
         pos_name    = case when p_pos_name is null then pos_name
                            else nullif(btrim(p_pos_name), '') end
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
    --
    -- 이 UPDATE 가 아래 실사 INSERT 보다 반드시 먼저여야 한다. 박스 기준
    -- 데이터를 정리하는 저장은 원가(÷N)와 수량(×N)이 한 번에 오는데, 실사가
    -- 먼저 들어가면 원장 트리거가 낡은 박스 원가를 전표에 스냅샷한다
    -- (0003 의 new.unit_cost := v_cost).
    update public.variants
       set sale_price          = coalesce((v_item->>'sale_price')::numeric,
                                          sale_price),
           cost_price          = coalesce((v_item->>'cost_price')::numeric,
                                          cost_price),
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

    -- 수량 수정은 원장을 우회하지 않는다. stock_qty 를 직접 덮으면
    -- v_stock_integrity 가 불일치로 울고 다음 recalc_stock() 이 되돌린다.
    -- 같은 값이면 전표를 만들지 않는다(멱등) — 안 그러면 상품명만 고쳐도
    -- 실사가 쌓인다. 삽입은 record_stocktake 재사용으로 로직을 한 곳에 둔다.
    v_counted := (v_item->>'counted_qty')::integer;
    if v_counted is not null then
      select stock_qty into v_stock from public.variants where id = v_variant;
      if v_counted <> v_stock then
        perform public.record_stocktake(v_variant, v_counted, '상품 수정에서 맞춤');
      end if;
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

comment on function public.update_product(uuid, text, uuid, text, jsonb, text, text, text, text) is
  '상품 기본 정보(POS 메뉴명·단위·묶음 이름 포함)와 변형별 판매가·원가·수량(실사)·최소재고·입수·대표 바코드를 한 트랜잭션에 저장. pos_name 은 NULL=유지 / 빈문자열=지움';

-- import_products 는 시그니처가 안 바뀌므로 or replace 로 족하다. create_product
-- 를 부르기만 하는 함수라 pos_name 도 그 인자로 넘기는 한 줄이면 끝난다 —
-- insert 를 여기 새로 쓰면 규칙이 두 벌이 되어 반드시 어긋난다(0016 의 경고).
create or replace function public.import_products(
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
      p_channel       => v_item->>'channel',
      p_pos_name      => v_item->>'pos_name'
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

-- 0009 와 같은 이유로 PUBLIC 자동 권한을 회수하고 로그인 사용자에게만 준다.
-- 시그니처가 바뀌었으므로 새 시그니처에 다시 걸어야 한다 — 빠뜨리면 로그인
-- 사용자가 상품 등록·수정을 통째로 못 하게 된다.
revoke execute on function
  public.create_product(text, uuid, text, jsonb, jsonb, text, text, text, text),
  public.update_product(uuid, text, uuid, text, jsonb, text, text, text, text)
from public, anon;

grant execute on function
  public.create_product(text, uuid, text, jsonb, jsonb, text, text, text, text),
  public.update_product(uuid, text, uuid, text, jsonb, text, text, text, text)
to authenticated;
