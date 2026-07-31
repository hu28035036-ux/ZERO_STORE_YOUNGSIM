-- 0015 판매기록 일괄 반영 (임포트)
--
-- 판매기록 파일(엑셀/CSV)을 통째로 재고에 반영하는 경로가 생긴다.
-- 계산대(record_sale)와 달리 "같은 파일을 두 번 올리는" 사고가 구조적으로
-- 가능한데, 판매 전표는 화면에서 정정할 수단이 없어서 두 번 들어가면 앱 안에서
-- 복구가 불가능하다. 그래서 방지(내용 지문 유니크)와 치료(영수증·배치 단위
-- 되돌리기)를 여기서 같이 넣는다.

-- ---------------------------------------------------------------------------
-- sale_orders 확장 : 어디서 왔는지(source), 어느 배치인지, 내용 지문.
--
-- 지문은 파일 바이트가 아니라 정규화된 내용(날짜·변형·수량·단가)의 해시다.
-- 엑셀은 내용이 같아도 다시 저장하면 바이트가 바뀌므로 바이트 해시로는
-- "같은 판매"를 못 잡는다. 지문은 영수증(날짜)마다 따로 만든다 — 그래야
-- 어제 파일에 오늘 몇 줄을 더해 다시 올려도 어제 날짜만 걸리고 새 날짜는
-- 통과한다.
-- ---------------------------------------------------------------------------
alter table public.sale_orders
  add column source text not null default 'manual'
    check (source in ('manual', 'import')),
  add column import_batch_id uuid,
  add column import_fingerprint text;

comment on column public.sale_orders.source is
  '이 영수증이 생긴 경로. manual = 판매 적기 화면, import = 파일 일괄 반영';
comment on column public.sale_orders.import_batch_id is
  '한 번의 임포트로 생긴 영수증 묶음. 배치 단위 되돌리기의 키';
comment on column public.sale_orders.import_fingerprint is
  '임포트 내용 지문(SHA-256). 같은 파일 재업로드를 DB 차원에서 거부한다';

-- 부분 유니크라 직접 쓰기(manual, 지문 NULL)에는 아무 영향이 없다.
-- 같은 날 같은 커피를 두 번 파는 것은 정상이고 막히면 안 된다.
create unique index uq_sale_orders_import_fingerprint
  on public.sale_orders (import_fingerprint)
  where import_fingerprint is not null;

create index idx_sale_orders_batch
  on public.sale_orders (import_batch_id)
  where import_batch_id is not null;

-- ---------------------------------------------------------------------------
-- 일괄 반영 : 여러 날짜(영수증)를 호출 한 번 = 트랜잭션 한 번으로 넣는다.
--
-- 날짜마다 record_sale() 을 따로 부르면 3번째에서 터졌을 때 앞의 둘은 이미
-- 커밋돼 있고 되돌릴 수단이 없다. 함수 하나가 전부를 처리해야 "전부 아니면
-- 전무"가 성립한다.
--
-- p_groups 예)
-- [{"occurred_at":"2026-07-29T12:00:00+09:00","fingerprint":"<sha256>",
--   "items":[{"variant_id":"...","qty":2,"unit_price":3000}, ...]}, ...]
-- unit_price 를 생략하면 record_sale 과 같은 규칙으로 현재 판매가를 쓴다.
--
-- p_force : 지문이 이미 있어도 반영한다. 지문 뒤에 무작위 꼬리를 붙여
-- 이번 것만 통과시키고, 그 다음 재업로드는 여전히 막는다.
-- ---------------------------------------------------------------------------
create or replace function public.import_sales(
  p_groups jsonb,
  p_memo   text    default null,
  p_force  boolean default false
) returns table (
  order_id    uuid,
  occurred_at timestamptz,
  item_count  integer,
  revenue     numeric,
  batch_id    uuid
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_batch uuid := gen_random_uuid();
  v_group jsonb;
  v_item  jsonb;
  v_order uuid;
  v_occ   timestamptz;
  v_fp    text;
  v_vid   uuid;
  v_qty   integer;
  v_price numeric(12,2);
begin
  if p_groups is null or jsonb_typeof(p_groups) <> 'array'
     or jsonb_array_length(p_groups) = 0 then
    raise exception '반영할 판매가 비어 있습니다';
  end if;

  -- 등장하는 변형 전부를 id 순으로 먼저 잠근다. record_sale 이 장바구니 안을
  -- 정렬하는 것과 같은 이유(교착 방지)인데, 여기는 영수증이 여러 장이라
  -- 영수증 단위 정렬로는 전역 순서가 안 지켜진다. 한 번에 전부 잠그면 이후
  -- 트리거의 for update 는 이미 쥔 잠금이라 순서와 무관하게 안전하다.
  perform 1
     from public.variants v
    where v.id in (
            select distinct (i->>'variant_id')::uuid
              from jsonb_array_elements(p_groups) g,
                   jsonb_array_elements(g->'items') i
          )
    order by v.id
      for update;

  for v_group in
    select e from jsonb_array_elements(p_groups) e
    order by (e->>'occurred_at')
  loop
    v_occ := (v_group->>'occurred_at')::timestamptz;
    v_fp  := nullif(btrim(coalesce(v_group->>'fingerprint', '')), '');

    if v_occ is null then
      raise exception '영수증 날짜가 비어 있습니다';
    end if;
    if v_fp is null or length(v_fp) < 32 then
      -- 지문 없는 임포트를 허용하면 중복 방지가 통째로 무력화된다.
      raise exception '임포트 지문이 없습니다';
    end if;
    if v_group->'items' is null or jsonb_typeof(v_group->'items') <> 'array'
       or jsonb_array_length(v_group->'items') = 0 then
      raise exception '영수증에 담긴 상품이 없습니다';
    end if;

    if p_force then
      v_fp := v_fp || ':' || gen_random_uuid();
    end if;

    insert into public.sale_orders
      (memo, occurred_at, source, import_batch_id, import_fingerprint)
    values
      (p_memo, v_occ, 'import', v_batch, v_fp)
    returning id into v_order;

    for v_item in
      select e from jsonb_array_elements(v_group->'items') e
      order by (e->>'variant_id')
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
        (v_vid, 'sale', -v_qty, v_price, v_order, v_occ, p_memo);
    end loop;

    -- 영수증 합계는 원장에서 되읽어 채운다 (record_sale 과 같은 방식)
    update public.sale_orders o
       set total_revenue = s.rev,
           total_cost    = s.cost,
           item_count    = s.cnt
      from (
        select coalesce(sum(m.revenue_amount), 0) rev,
               coalesce(sum(m.cost_amount), 0)    cost,
               count(*)                           cnt
          from public.stock_movements m
         where m.sale_order_id = v_order
      ) s
     where o.id = v_order;

    order_id    := v_order;
    occurred_at := v_occ;
    batch_id    := v_batch;
    select o.item_count, o.total_revenue into item_count, revenue
      from public.sale_orders o where o.id = v_order;
    return next;
  end loop;
end $$;

comment on function public.import_sales(jsonb, text, boolean) is
  '판매기록 파일 일괄 반영. 날짜별 영수증을 한 트랜잭션으로 만들고 지문으로 재업로드를 막는다';

-- ---------------------------------------------------------------------------
-- 영수증 되돌리기 : 영수증에 딸린 판매 전표 전부에 반대 전표를 넣는다.
--
-- void_movement 를 부르지 않고 직접 넣는다. 이유는 날짜다 — void_movement 는
-- 반대 전표를 "정정한 오늘"로 남기는데(입출고 정정은 그게 맞다), 판매 되돌림은
-- 반품이 아니라 "잘못 넣은 기록의 취소"라서 **원본과 같은 날짜**에 상쇄돼야
-- 일별 매출·통계가 그 판매가 없던 모습으로 돌아간다. 오늘 날짜로 넣으면
-- 지난 날짜 매출은 부풀려 남고 오늘에 음수가 쌓인다 (총계만 맞는다).
-- 언제 취소했는지는 created_at 이 남긴다.
--
-- type='sale' 에 qty_delta 양수면 생성 컬럼 규약(0003)이 매출을 음수로
-- 만들어 상쇄가 저절로 된다. void_movement 의 이중 정정 방지는 아래 where 의
-- reverses_id/not exists 두 조건이 같은 일을 한다.
--
-- item_count 는 "아직 유효한(정정 안 된) 판매 라인 수"로 다시 센다. 전부
-- 되돌리면 0 이 되어 목록에서 죽은 영수증임이 보인다. revenue/cost 는 합산이라
-- 반대 전표가 저절로 0 으로 만든다.
-- ---------------------------------------------------------------------------
create or replace function public.void_sale_order(
  p_order_id uuid,
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
  if not exists (select 1 from public.sale_orders where id = p_order_id) then
    raise exception '영수증을 찾을 수 없습니다';
  end if;

  for m in
    select *
      from public.stock_movements t
     where t.sale_order_id = p_order_id
       and t.reverses_id is null       -- 정정 전표 자신은 건드리지 않는다
       and not exists (
             select 1 from public.stock_movements r where r.reverses_id = t.id
           )
     order by t.variant_id             -- record_sale 과 같은 잠금 순서
  loop
    insert into public.stock_movements
      (variant_id, type, qty_delta, unit_cost, unit_price,
       sale_order_id, supplier_id, reverses_id, note, occurred_at)
    values
      (m.variant_id, m.type, -m.qty_delta, m.unit_cost, m.unit_price,
       m.sale_order_id, m.supplier_id, m.id,
       coalesce(p_reason, '영수증 되돌림'), m.occurred_at);
    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception '되돌릴 전표가 없습니다 — 이미 전부 되돌린 영수증입니다';
  end if;

  -- 별칭이 m2 인 이유: 위에서 m 이 record 변수라, 같은 이름을 별칭으로 쓰면
  -- plpgsql 이 변수와 컬럼 참조를 구분하지 못해 런타임에 죽는다.
  update public.sale_orders o
     set total_revenue = s.rev,
         total_cost    = s.cost,
         item_count    = s.cnt
    from (
      select coalesce(sum(m2.revenue_amount), 0) rev,
             coalesce(sum(m2.cost_amount), 0)    cost,
             count(*) filter (
               where m2.reverses_id is null
                 and not exists (
                       select 1 from public.stock_movements r
                        where r.reverses_id = m2.id
                     )
             ) cnt
        from public.stock_movements m2
       where m2.sale_order_id = p_order_id
    ) s
   where o.id = p_order_id;

  return v_count;
end $$;

comment on function public.void_sale_order(uuid, text) is
  '영수증 단위 판매 취소. 반대 전표를 넣고 영수증 합계를 다시 맞춘다';

-- ---------------------------------------------------------------------------
-- 배치 되돌리기 : 임포트 한 번(배치)으로 생긴 영수증 전부를 되돌린다.
--
-- void_sale_order 를 그대로 부르되, 되돌릴 게 남은 영수증만 고른다 — 일부를
-- 이미 개별로 되돌렸어도 나머지는 마저 되돌려져야 한다. 전부 이미 되돌린
-- 배치면 예외로 알린다.
-- ---------------------------------------------------------------------------
create or replace function public.void_import_batch(
  p_batch_id uuid,
  p_reason   text default null
) returns integer                      -- 되돌린 전표 수 합계
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_order uuid;
  v_total integer := 0;
begin
  if not exists (
    select 1 from public.sale_orders where import_batch_id = p_batch_id
  ) then
    raise exception '임포트 배치를 찾을 수 없습니다';
  end if;

  for v_order in
    select distinct o.id
      from public.sale_orders o
      join public.stock_movements m on m.sale_order_id = o.id
     where o.import_batch_id = p_batch_id
       and m.reverses_id is null
       and not exists (
             select 1 from public.stock_movements r where r.reverses_id = m.id
           )
     order by o.id
  loop
    v_total := v_total + public.void_sale_order(
      v_order, coalesce(p_reason, '임포트 배치 되돌림')
    );
  end loop;

  if v_total = 0 then
    raise exception '되돌릴 전표가 없습니다 — 이미 전부 되돌린 배치입니다';
  end if;

  return v_total;
end $$;

comment on function public.void_import_batch(uuid, text) is
  '임포트 배치 전체 취소. 같은 파일을 잘못 반영했을 때의 복구 수단';

-- ---------------------------------------------------------------------------
-- 실행 권한 : 0009 와 같은 이유. 로그인 사용자만.
-- ---------------------------------------------------------------------------
revoke execute on function
  public.import_sales(jsonb, text, boolean),
  public.void_sale_order(uuid, text),
  public.void_import_batch(uuid, text)
from public, anon;

grant execute on function
  public.import_sales(jsonb, text, boolean),
  public.void_sale_order(uuid, text),
  public.void_import_batch(uuid, text)
to authenticated;
