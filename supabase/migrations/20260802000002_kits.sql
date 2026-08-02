-- ---------------------------------------------------------------------------
-- 0019 : 박스 묶음 (한 박스에 여러 종류가 든 입고)
--
-- 이 앱에는 이미 "박스"가 있는데(variants.units_per_pack) 그것은 **같은 물건 N개**
-- 다. `1박스 = 12병` 처럼 한 가지가 여러 개 든 경우다. 실제 매장에는 그것과
-- 성격이 다른 박스가 온다 — 한 박스에 **다른 맛이 여러 종류** 들어 있다.
--
--   더존건강 한끼곤약젤리 버라이어티팩  1박스 = 15가지 맛 30개
--   고맙당 저당 불닭소스+핫불닭소스     1박스 = 불닭 10 · 핫불닭 10
--   하이프리 단백깡                     1박스 = 야채포테이토 15 · 알싸고추 15
--
-- 팔리는 것은 맛별 낱개이므로 재고도 맛별로 세야 한다. 그런데 발주와 입고는
-- 박스 하나로 온다. 그 간극이 이 마이그레이션이 메우는 것이다.
--
-- **박스를 상품으로 만들지 않는다.** 상품으로 두면 재고 목록에 늘 0 인 줄이
-- 끼고, 재고 수량이 박스와 낱개 두 곳에 생겨 어느 쪽이 진실인지 흐려진다.
-- 박스는 "입고할 때 고르는 서식"이고, 재고는 언제나 낱개만 센다 (사용자 결정).
--
-- 구성 수량은 **기본값**이지 고정값이 아니다. 사용자 확인 사항 — "대체로 같지만
-- 가끔 다르다". 그래서 화면이 기본값을 채워 주되 줄마다 고칠 수 있어야 하고,
-- receive_kit 은 kit_items 의 수량이 아니라 **호출자가 보낸 수량**을 믿는다.
-- 기본값을 강제하면 실제로 다르게 온 날 사장님이 앱을 이길 방법이 없다.
-- ---------------------------------------------------------------------------

create table public.kits (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) between 1 and 120),
  -- 발주 코드·비고. 본사 시트에서 이 박스를 뭐라고 부르는지 적어 둔다.
  note        text,
  is_active   boolean not null default true,
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.kits is
  '박스 묶음 — 한 박스에 여러 종류가 든 입고 서식. 재고를 갖지 않는다(재고는 낱개 변형이 센다)';

create table public.kit_items (
  kit_id      uuid not null references public.kits(id) on delete cascade,
  -- on delete restrict : 구성품으로 쓰이는 변형은 지울 수 없어야 한다.
  -- 지워지면 박스가 반쯤 빈 채로 남아 다음 입고 때 조용히 수량이 빠진다.
  variant_id  uuid not null references public.variants(id) on delete restrict,
  -- 박스 하나에 보통 몇 개 드는가. 화면이 이 값을 미리 채우고, 실제로 다르게
  -- 오면 사람이 그 자리에서 고친다.
  default_qty integer not null check (default_qty > 0),
  sort_order  integer not null default 0,
  primary key (kit_id, variant_id)
);

comment on column public.kit_items.default_qty is
  '박스 하나에 보통 드는 개수. 기본값일 뿐이고 입고 때 고칠 수 있다';

create index idx_kit_items_variant on public.kit_items (variant_id);

create trigger trg_kits_updated_at
  before update on public.kits
  for each row execute function public.fn_touch_updated_at();

-- ---------------------------------------------------------------------------
-- 뷰
-- ---------------------------------------------------------------------------

create view public.v_kits with (security_invoker = true) as
select
  k.id                                   as kit_id,
  k.name,
  k.note,
  k.is_active,
  k.updated_at,
  count(i.variant_id)::integer           as item_count,
  coalesce(sum(i.default_qty), 0)::integer as default_total_qty
from public.kits k
left join public.kit_items i on i.kit_id = k.id
group by k.id;

-- 입고 화면이 쓰는 구성품 목록. 이름·단위·현재 재고를 같이 준다 —
-- 사장님이 "지금 몇 개 있더라" 를 보면서 들어온 개수를 확인하기 때문이다.
create view public.v_kit_items with (security_invoker = true) as
select
  i.kit_id,
  i.variant_id,
  i.default_qty,
  i.sort_order,
  p.id                                               as product_id,
  p.name                                             as product_name,
  p.pos_name,
  p.unit,
  public.fn_option_label(v.options, p.option_schema) as option_label,
  v.stock_qty,
  v.cost_price,
  v.sale_price,
  v.is_active                                        as variant_active,
  p.is_active                                        as product_active
from public.kit_items i
join public.variants v on v.id = i.variant_id
join public.products p on p.id = v.product_id;

-- ---------------------------------------------------------------------------
-- 박스 구성 저장 (만들기 · 고치기 한 함수)
--
-- 구성품을 통째로 갈아끼운다. 부분 수정 API 를 따로 두지 않는 이유는
-- update_product 와 같다 — 화면이 언제나 현재 상태 전체를 보낸다.
-- ---------------------------------------------------------------------------
create function public.upsert_kit(
  p_kit_id uuid,                          -- null 이면 새로 만든다
  p_name   text,
  p_note   text default null,
  -- [{ variant_id, default_qty }] — 배열 순서가 화면 표시 순서가 된다
  p_items  jsonb default '[]'::jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_kit  uuid;
  v_item jsonb;
  v_i    integer := 0;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 2 then
    -- 구성품이 하나뿐인 박스는 units_per_pack 으로 표현하는 것이 맞다.
    -- 여기 두면 같은 뜻의 길이 두 갈래가 된다.
    raise exception '박스에는 두 종류 이상이 들어가야 합니다. 한 종류만 든 박스는 상품의 "박스당 개수" 로 넣으세요';
  end if;

  if p_kit_id is null then
    insert into public.kits (name, note)
    values (btrim(p_name), nullif(btrim(coalesce(p_note, '')), ''))
    returning id into v_kit;
  else
    update public.kits
       set name = btrim(p_name),
           note = nullif(btrim(coalesce(p_note, '')), '')
     where id = p_kit_id
    returning id into v_kit;
    if v_kit is null then
      raise exception '박스 구성을 찾을 수 없습니다';
    end if;
    delete from public.kit_items where kit_id = v_kit;
  end if;

  for v_item in select e from jsonb_array_elements(p_items) e
  loop
    insert into public.kit_items (kit_id, variant_id, default_qty, sort_order)
    values (v_kit,
            (v_item->>'variant_id')::uuid,
            coalesce((v_item->>'default_qty')::integer, 1),
            v_i)
    -- 같은 변형을 두 줄로 넣으면 수량을 합친다. 막지 않는 이유는 화면에서
    -- 실수로 같은 맛을 두 번 고르는 일이 실제로 있고, 거기서 등록을 통째로
    -- 거부하면 사람이 어느 줄이 문제인지 찾아야 하기 때문이다.
    on conflict (kit_id, variant_id)
      do update set default_qty = public.kit_items.default_qty + excluded.default_qty;
    v_i := v_i + 1;
  end loop;

  return v_kit;
end $$;

comment on function public.upsert_kit(uuid, text, text, jsonb) is
  '박스 구성 저장. 구성품은 통째로 갈아끼운다';

-- ---------------------------------------------------------------------------
-- 박스 입고
--
-- 구성품마다 입고 전표를 하나씩 넣는다. 전부 아니면 전무여야 한다 —
-- 15줄 중 8번째에서 터지면 앞의 7개만 재고가 늘고 되돌릴 방법이 없다.
--
-- 원가는 박스 값을 **개수대로 나눈다**(사용자 결정). 맛만 다르고 값은 같은
-- 박스라 이게 맞다. 박스 값을 안 주면 unit_cost 를 null 로 두는데, 그러면
-- 원장 트리거가 각 변형의 현재 이동평균 원가를 그대로 스냅샷한다(0003).
-- ---------------------------------------------------------------------------
create function public.receive_kit(
  p_kit_id      uuid,
  -- [{ variant_id, qty }] — 실제로 들어온 개수. kit_items 의 기본값이 아니라
  -- 이 값을 믿는다. 박스 구성이 늘 같지는 않다.
  p_lines       jsonb,
  p_boxes       integer     default 1,
  -- 박스 하나의 매입가(VAT 포함). null 이면 원가를 건드리지 않는다.
  p_box_cost    numeric     default null,
  p_supplier_id uuid        default null,
  p_note        text        default null,
  p_occurred_at timestamptz default now()
) returns table (
  variant_id   uuid,
  product_name text,
  qty          integer,
  unit_cost    numeric,
  stock_after  integer
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_kit_name  text;
  v_item      jsonb;
  v_total_qty integer := 0;
  v_unit_cost numeric(12,2);
  v_note      text;
  v_after     integer;
  v_vid       uuid;
  v_qty       integer;
begin
  select name into v_kit_name from public.kits where id = p_kit_id;
  if v_kit_name is null then
    raise exception '박스 구성을 찾을 수 없습니다';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) = 0 then
    raise exception '들어온 상품이 비어 있습니다';
  end if;
  if p_boxes is null or p_boxes < 1 then
    raise exception '박스 수는 1 이상이어야 합니다';
  end if;

  -- 총수량을 먼저 구해야 낱개 원가를 낼 수 있다.
  for v_item in select e from jsonb_array_elements(p_lines) e
  loop
    v_qty := coalesce((v_item->>'qty')::integer, 0);
    if v_qty < 0 then
      raise exception '수량은 0 이상이어야 합니다';
    end if;
    v_total_qty := v_total_qty + v_qty;
  end loop;

  if v_total_qty = 0 then
    raise exception '들어온 개수가 모두 0 입니다';
  end if;

  if p_box_cost is not null then
    if p_box_cost < 0 then
      raise exception '매입가는 0 이상이어야 합니다';
    end if;
    v_unit_cost := round((p_box_cost * p_boxes) / v_total_qty, 2);
  end if;

  v_note := coalesce(nullif(btrim(coalesce(p_note, '')), '') || ' · ', '')
            || format('[%s %s박스]', v_kit_name, p_boxes);

  -- variant_id 순으로 넣는다. record_sale·import_sales 와 같은 잠금 순서라
  -- 두 사람이 겹쳐 눌러도 교착이 생기지 않는다.
  for v_item in
    select e from jsonb_array_elements(p_lines) e
    order by (e->>'variant_id')
  loop
    v_vid := (v_item->>'variant_id')::uuid;
    v_qty := coalesce((v_item->>'qty')::integer, 0);
    -- 0 개로 들어온 맛은 전표를 만들지 않는다. 수량 0 전표는 원장을 어지럽히고
    -- record_stock_movement 도 거부한다.
    continue when v_qty = 0;

    v_after := public.record_stock_movement(
      p_variant_id  => v_vid,
      p_type        => 'purchase',
      p_qty         => v_qty,
      p_unit_cost   => v_unit_cost,
      p_supplier_id => p_supplier_id,
      p_note        => v_note,
      p_occurred_at => p_occurred_at
    );

    variant_id   := v_vid;
    product_name := (select p.name from public.products p
                       join public.variants v on v.product_id = p.id
                      where v.id = v_vid);
    qty          := v_qty;
    unit_cost    := v_unit_cost;
    stock_after  := v_after;
    return next;
  end loop;
end $$;

comment on function public.receive_kit(uuid, jsonb, integer, numeric, uuid, text, timestamptz) is
  '박스 하나를 구성품별 입고 전표로 나눠 넣는다. 전부 아니면 전무';

-- ---------------------------------------------------------------------------
-- RLS · 권한 : 나머지 테이블과 같은 규칙(인증 사용자 전체 허용)
-- ---------------------------------------------------------------------------

alter table public.kits      enable row level security;
alter table public.kit_items enable row level security;

create policy "인증 사용자 전체 접근" on public.kits
  for all to authenticated using (true) with check (true);

create policy "인증 사용자 전체 접근" on public.kit_items
  for all to authenticated using (true) with check (true);

revoke all on public.kits, public.kit_items, public.v_kits, public.v_kit_items
from anon;

grant select, insert, update, delete on public.kits, public.kit_items to authenticated;
grant select on public.v_kits, public.v_kit_items to authenticated;

revoke execute on function
  public.upsert_kit(uuid, text, text, jsonb),
  public.receive_kit(uuid, jsonb, integer, numeric, uuid, text, timestamptz)
from public, anon;

grant execute on function
  public.upsert_kit(uuid, text, text, jsonb),
  public.receive_kit(uuid, jsonb, integer, numeric, uuid, text, timestamptz)
to authenticated;
