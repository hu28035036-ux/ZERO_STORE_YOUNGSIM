-- 0003 재고 원장
--
-- stock_movements 는 append-only 원장이고, variants.stock_qty 는 그 캐시다.
-- 이 파일의 트리거가 시스템 정확성의 전부를 담당한다.

-- DB 값은 영문 고정. 한국어 라벨은 lib/constants.ts 에서 매핑한다.
-- 한글 enum 값은 마이그레이션·정렬·외부 연동에서 계속 발목을 잡는다.
create type public.stock_movement_type as enum (
  'purchase',    -- 입고
  'outbound',    -- 출고 (폐기·증정·이동 등 판매가 아닌 감소)
  'sale',        -- 판매
  'adjustment',  -- 조정 (수동 가감)
  'stocktake'    -- 실사 (실제 카운트에 맞춤)
);

-- ---------------------------------------------------------------------------
-- sale_orders : 판매 건 = 영수증 단위
-- 단건 스캔 판매도 항목 1개짜리 주문이 된다. 객단가·판매건수 분석이 여기서 나온다.
-- ---------------------------------------------------------------------------
create table public.sale_orders (
  id            uuid primary key default gen_random_uuid(),
  occurred_at   timestamptz not null default now(),
  total_revenue numeric(14,2) not null default 0,
  total_cost    numeric(14,2) not null default 0,
  item_count    integer not null default 0,
  memo          text,
  created_by    uuid default auth.uid() references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index idx_sale_orders_occurred   on public.sale_orders (occurred_at desc);
create index idx_sale_orders_created_by on public.sale_orders (created_by);

comment on table public.sale_orders is '판매 건(영수증). 여러 상품을 한 번에 판매한 묶음';

-- ---------------------------------------------------------------------------
-- stock_movements : append-only 원장
--
-- qty_delta 는 부호를 갖는다 → 재고 = SUM(qty_delta) 가 정의상 성립하고,
-- 캐시 검증(v_stock_integrity)이 공짜로 따라온다.
--
-- type='sale' 인데 qty_delta 가 양수면 반품이다. revenue_amount 가
-- (-qty_delta) * unit_price 이므로 매출이 자동으로 음수가 된다.
-- 부호 규약 하나로 반품 회계가 따라 나온다.
-- ---------------------------------------------------------------------------
create table public.stock_movements (
  id          bigint generated always as identity primary key,
  variant_id  uuid not null references public.variants(id) on delete restrict,
  type        public.stock_movement_type not null,
  qty_delta   integer not null,
  counted_qty integer,               -- 실사 시 실제 카운트한 수량
  stock_after integer not null,      -- 트리거가 채움: 이 전표 처리 후 잔여 재고

  unit_cost   numeric(12,2),         -- 이 시점 원가 스냅샷 (트리거가 채움)
  unit_price  numeric(12,2),         -- 판매 단가 (판매 전용)

  -- 분석 조회가 매번 재평가하지 않도록 STORED 로 굳힌다
  revenue_amount numeric(14,2) generated always as (
    case when type = 'sale'
         then (-qty_delta)::numeric * coalesce(unit_price, 0) else 0 end
  ) stored,
  cost_amount numeric(14,2) generated always as (
    case when type = 'sale'
         then (-qty_delta)::numeric * coalesce(unit_cost, 0) else 0 end
  ) stored,
  purchase_amount numeric(14,2) generated always as (
    case when type = 'purchase'
         then qty_delta::numeric * coalesce(unit_cost, 0) else 0 end
  ) stored,

  sale_order_id uuid   references public.sale_orders(id) on delete restrict,
  supplier_id   uuid   references public.suppliers(id)   on delete set null,
  reverses_id   bigint references public.stock_movements(id),
  note          text,
  occurred_at   timestamptz not null default now(),
  -- NULL 은 "관리자가 SQL 로 직접 넣음"을 뜻한다.
  -- 앱 경로에서는 RLS 정책이 created_by = auth.uid() 를 강제한다.
  created_by    uuid default auth.uid() references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),

  constraint chk_qty_nonzero  check (qty_delta <> 0 or type = 'stocktake'),
  constraint chk_purchase_pos check (type <> 'purchase' or qty_delta > 0),
  constraint chk_outbound_neg check (type <> 'outbound' or qty_delta < 0),
  constraint chk_sale_price   check (type <> 'sale' or unit_price is not null)
);

create index idx_mv_occurred     on public.stock_movements (occurred_at desc);
create index idx_mv_variant_time on public.stock_movements (variant_id, occurred_at desc);
create index idx_mv_sales        on public.stock_movements (occurred_at desc) where type = 'sale';
create index idx_mv_purchases    on public.stock_movements (occurred_at desc) where type = 'purchase';
create index idx_mv_order        on public.stock_movements (sale_order_id) where sale_order_id is not null;
create index idx_mv_supplier     on public.stock_movements (supplier_id)   where supplier_id  is not null;
create index idx_mv_reverses     on public.stock_movements (reverses_id)   where reverses_id  is not null;
create index idx_mv_created_by   on public.stock_movements (created_by);

comment on table public.stock_movements is
  'append-only 재고 원장. 수정·삭제 불가, 정정은 void_movement() 의 반대 전표로 처리';

-- ---------------------------------------------------------------------------
-- 재고 적용 트리거
--
-- 여기에 로직을 두는 이유: RPC 에만 두면 SQL 편집기나 향후 임포트 스크립트로
-- 들어온 삽입이 캐시를 갱신하지 않고 지나간다. 테이블 자체에 걸어야 새는 곳이 없다.
-- ---------------------------------------------------------------------------
create or replace function public.fn_apply_stock_movement()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_qty      integer;
  v_cost     numeric(12,2);
  v_new_qty  integer;
  v_new_cost numeric(12,2);
  v_base     integer;
begin
  -- 1) 동시성 제어: variant 행을 잠근다.
  --    두 사람이 같은 상품을 동시에 찍으면 두 번째 트랜잭션은 여기서 대기하다가
  --    첫 번째가 커밋한 값을 읽는다. 둘 다 10 을 읽고 둘 다 9 를 쓰는 사고가 없어진다.
  select stock_qty, coalesce(cost_price, 0)
    into v_qty, v_cost
    from public.variants
   where id = new.variant_id
     for update;

  if not found then
    raise exception '존재하지 않는 상품 옵션입니다 (variant_id=%)', new.variant_id;
  end if;

  -- 2) 실사: 호출자는 qty_delta=0 을 넘기고, 실제 카운트로 델타를 확정한다.
  if new.type = 'stocktake' then
    if new.counted_qty is null then
      raise exception '실사 등록에는 실제 카운트 수량이 필요합니다';
    end if;
    if new.counted_qty < 0 then
      raise exception '실사 수량은 0 이상이어야 합니다';
    end if;
    new.qty_delta := new.counted_qty - v_qty;
  end if;

  -- 3) 원가 스냅샷.
  --    판매/출고 전표는 "그 시점의 이동평균 원가"를 자기 행에 박아둔다.
  --    나중에 매입가가 올라도 과거 마진이 소급해 바뀌지 않는다.
  if new.unit_cost is null then
    new.unit_cost := v_cost;
  end if;

  v_new_qty := v_qty + new.qty_delta;

  -- 4) 이동평균법: 수량이 늘어나는 전표만 평균 원가를 갱신한다.
  --    최종 입고가만 쓰면 100개@1000 상태에서 1개@1500 을 사는 순간
  --    이후 모든 판매 원가가 1500 이 되어 마진이 장부상 붕괴한다.
  --    음수 재고에서 입고되면 기존 수량을 0 으로 보고 계산한다.
  v_base := greatest(v_qty, 0);
  if new.qty_delta > 0 and (v_base + new.qty_delta) > 0 then
    v_new_cost := ((v_base::numeric * v_cost) + (new.qty_delta::numeric * new.unit_cost))
                  / (v_base + new.qty_delta);
  else
    v_new_cost := v_cost;
  end if;

  update public.variants
     set stock_qty  = v_new_qty,
         cost_price = round(v_new_cost, 2),
         updated_at = now()
   where id = new.variant_id;

  -- 재고 음수는 막지 않는다.
  -- 하드 제약을 걸면 입고 기록을 깜빡한 상품이 계산대에서 판매 거부된다.
  -- 틀린 숫자보다 나쁘다. UI 에서 빨간 배지로 드러내고 실사로 정리하게 한다.
  new.stock_after := v_new_qty;
  return new;
end $$;

create trigger trg_apply_stock_movement
before insert on public.stock_movements
for each row execute function public.fn_apply_stock_movement();

-- ---------------------------------------------------------------------------
-- append-only 가드
--
-- RLS 에 UPDATE/DELETE 정책을 만들지 않는 것만으로 API 경로는 막힌다.
-- 이 트리거는 SQL 편집기 / service key 경로까지 막는 두 번째 방어선이다.
-- 원장이 훼손되면 과거 통계를 통째로 신뢰할 수 없게 된다.
-- ---------------------------------------------------------------------------
create or replace function public.fn_movements_append_only()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  raise exception
    '입출고 내역은 수정하거나 삭제할 수 없습니다. 정정은 void_movement() 로 반대 전표를 넣으세요.';
end $$;

create trigger trg_movements_append_only
before update or delete on public.stock_movements
for each row execute function public.fn_movements_append_only();
