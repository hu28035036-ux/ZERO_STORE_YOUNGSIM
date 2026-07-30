-- 0004 RPC
--
-- 앱의 모든 쓰기는 여기를 거친다. Server Action → rpc() → 이 함수들.
-- 전부 security invoker 이므로 RLS 와 auth.uid() 가 호출자 기준으로 동작한다.

-- ---------------------------------------------------------------------------
-- 옵션 라벨 헬퍼 : {"사이즈":"L","맛":"딸기"} → 'L / 딸기'
-- option_schema 선언 순서를 따르므로 화면마다 순서가 뒤바뀌지 않는다.
-- immutable 이라 뷰와 함수 여러 곳에서 재사용할 수 있다.
-- ---------------------------------------------------------------------------
create or replace function public.fn_option_label(p_options jsonb, p_schema jsonb)
returns text
language sql
immutable
security invoker
set search_path = public, pg_temp
as $$
  select string_agg(p_options->>(a->>'name'), ' / ' order by ord)
    from jsonb_array_elements(coalesce(p_schema, '[]'::jsonb)) with ordinality x(a, ord)
   where p_options ? (a->>'name');
$$;

comment on function public.fn_option_label(jsonb, jsonb) is
  '변형 옵션을 상품의 선언 순서대로 이어붙인 표시용 라벨';

-- ---------------------------------------------------------------------------
-- 입고 / 출고 / 조정 단건 등록
-- 판매는 반드시 record_sale() 로 간다 (영수증 단위로 묶어야 하므로).
-- ---------------------------------------------------------------------------
create or replace function public.record_stock_movement(
  p_variant_id  uuid,
  p_type        public.stock_movement_type,
  p_qty         integer,
  p_unit_cost   numeric default null,
  p_supplier_id uuid    default null,
  p_note        text    default null,
  p_occurred_at timestamptz default now()
) returns integer                     -- 처리 후 잔여 재고
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_after integer;
begin
  if p_type = 'sale' then
    raise exception '판매는 record_sale() 로 등록하세요';
  end if;
  if p_type = 'stocktake' then
    raise exception '실사는 record_stocktake() 로 등록하세요';
  end if;
  if p_qty is null or p_qty = 0 then
    raise exception '수량을 입력하세요';
  end if;

  insert into public.stock_movements
    (variant_id, type, qty_delta, unit_cost, supplier_id, note, occurred_at)
  values
    (p_variant_id, p_type, p_qty, p_unit_cost, p_supplier_id, p_note, p_occurred_at)
  returning stock_after into v_after;

  return v_after;
end $$;

-- ---------------------------------------------------------------------------
-- 실사 : 실제로 세어본 수량에 맞춘다. 델타는 트리거가 계산한다.
-- ---------------------------------------------------------------------------
create or replace function public.record_stocktake(
  p_variant_id  uuid,
  p_counted_qty integer,
  p_note        text default null
) returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_after integer;
begin
  insert into public.stock_movements (variant_id, type, qty_delta, counted_qty, note)
  values (p_variant_id, 'stocktake', 0, p_counted_qty, p_note)
  returning stock_after into v_after;

  return v_after;
end $$;

-- ---------------------------------------------------------------------------
-- 판매 : 장바구니 전체를 한 트랜잭션으로 등록한다.
--
-- p_items 예) [{"variant_id":"...","qty":2,"unit_price":3000}, ...]
-- unit_price 를 생략하면 변형의 현재 판매가를 쓴다.
-- ---------------------------------------------------------------------------
create or replace function public.record_sale(
  p_items       jsonb,
  p_memo        text default null,
  p_occurred_at timestamptz default now()
) returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid;
  v_item     jsonb;
  v_vid      uuid;
  v_qty      integer;
  v_price    numeric(12,2);
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception '판매 항목이 비어 있습니다';
  end if;

  insert into public.sale_orders (memo, occurred_at)
  values (p_memo, p_occurred_at)
  returning id into v_order_id;

  -- variant_id 정렬 = 잠금 획득 순서 고정.
  -- 같은 상품 두 개가 담긴 장바구니 둘이 동시에 저장돼도 교착이 생기지 않는다.
  for v_item in
    select e from jsonb_array_elements(p_items) e order by (e->>'variant_id')
  loop
    v_vid := (v_item->>'variant_id')::uuid;
    v_qty := (v_item->>'qty')::integer;

    if v_qty is null or v_qty <= 0 then
      raise exception '판매 수량은 1개 이상이어야 합니다';
    end if;

    v_price := coalesce(
      (v_item->>'unit_price')::numeric,
      (select sale_price from public.variants where id = v_vid)
    );

    insert into public.stock_movements
      (variant_id, type, qty_delta, unit_price, sale_order_id, occurred_at, note)
    values
      (v_vid, 'sale', -v_qty, v_price, v_order_id, p_occurred_at, p_memo);
  end loop;

  -- 영수증 합계는 원장에서 되읽어 채운다 (원가는 트리거가 스냅샷한 값)
  update public.sale_orders o
     set total_revenue = s.rev,
         total_cost    = s.cost,
         item_count    = s.cnt
    from (
      select coalesce(sum(revenue_amount), 0) rev,
             coalesce(sum(cost_amount), 0)    cost,
             count(*)                         cnt
        from public.stock_movements
       where sale_order_id = v_order_id
    ) s
   where o.id = v_order_id;

  return v_order_id;
end $$;

-- ---------------------------------------------------------------------------
-- 정정 : 원장은 지우지 않는다. 반대 부호 전표를 넣어 상쇄한다.
-- ---------------------------------------------------------------------------
create or replace function public.void_movement(
  p_id     bigint,
  p_reason text default null
) returns bigint
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  m     public.stock_movements;
  v_new bigint;
begin
  select * into m from public.stock_movements where id = p_id;
  if not found then
    raise exception '전표를 찾을 수 없습니다 (id=%)', p_id;
  end if;

  if exists (select 1 from public.stock_movements where reverses_id = p_id) then
    raise exception '이미 정정된 전표입니다';
  end if;

  if m.reverses_id is not null then
    raise exception '정정 전표는 다시 정정할 수 없습니다';
  end if;

  -- 실사 전표는 qty_delta 를 그대로 뒤집어 조정으로 남긴다
  insert into public.stock_movements
    (variant_id, type, qty_delta, unit_cost, unit_price,
     sale_order_id, supplier_id, reverses_id, note)
  values
    (m.variant_id,
     case when m.type = 'stocktake' then 'adjustment'::public.stock_movement_type
          else m.type end,
     -m.qty_delta, m.unit_cost, m.unit_price,
     m.sale_order_id, m.supplier_id, m.id,
     coalesce(p_reason, '정정'))
  returning id into v_new;

  return v_new;
end $$;

-- ---------------------------------------------------------------------------
-- 바코드 조회 : 스캐너의 hot path. barcodes.code 가 PK 라 단일 조회로 끝난다.
-- ---------------------------------------------------------------------------
create or replace function public.lookup_by_barcode(p_code text)
returns table (
  variant_id   uuid,
  product_id   uuid,
  product_name text,
  option_label text,
  sale_price   numeric,
  cost_price   numeric,
  stock_qty    integer,
  barcode      text
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select v.id, p.id, p.name,
         public.fn_option_label(v.options, p.option_schema),
         v.sale_price, v.cost_price, v.stock_qty, b.code
    from public.barcodes b
    join public.variants v on v.id = b.variant_id
    join public.products p on p.id = v.product_id
   where b.code = btrim(p_code);
$$;

-- ---------------------------------------------------------------------------
-- 캐시 복구 : 원장 합계로 stock_qty 를 다시 맞춘다.
-- v_stock_integrity 가 0행이 아닐 때만 쓸 일이 있어야 정상이다.
-- ---------------------------------------------------------------------------
create or replace function public.recalc_stock(p_variant_id uuid default null)
returns integer                        -- 고쳐진 행 수
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  with s as (
    select v.id as variant_id,
           coalesce(sum(m.qty_delta), 0)::int as q
      from public.variants v
      left join public.stock_movements m on m.variant_id = v.id
     where p_variant_id is null or v.id = p_variant_id
     group by v.id
  )
  update public.variants v
     set stock_qty = s.q, updated_at = now()
    from s
   where v.id = s.variant_id
     and v.stock_qty is distinct from s.q;

  get diagnostics n = row_count;
  return n;
end $$;
