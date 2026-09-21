-- ---------------------------------------------------------------------------
-- 0021 상품 삭제(숨기기) · 되살리기
--
-- "삭제"라고 부르지만 행을 지우지 않는다. 원장(stock_movements)이 append-only 고
-- variant_id 가 on delete restrict 라서, 한 번이라도 입고·판매된 상품은 지울 수
-- 없다. 그래서 void_product_import 와 같은 길로 간다: products/variants 의
-- is_active 를 끈다. 재고 목록·검색·판매 담기는 전부 is_active 를 보는 뷰를
-- 타므로 끄는 것만으로 화면에서 사라진다. 기록은 그대로 남는다.
--
-- 남은 재고는 두 갈래다.
--   p_zero_stock = true  (기본) : 변형마다 실사 0 전표를 넣고 숨긴다.
--                                 재고 자산에서 빠지고 "언제 얼마를 정리했는지"가
--                                 입출고 내역에 남는다.
--   p_zero_stock = false         : 수량은 그대로 두고 목록에서만 숨긴다.
--                                 v_stock_valuation 은 variants.is_active 만 보므로
--                                 이 경우에도 재고 자산에서는 빠진다 — 화면에서
--                                 "자산에 계속 포함" 이라고 말하면 안 된다.
--
-- 실사를 record_stocktake() 로 부르지 않고 직접 insert 하는 이유: 같은
-- 트랜잭션 안에서 상품을 잠근 채 변형을 순서대로 처리해야 하고, note 에
-- "상품 삭제 정리"를 고정으로 남겨 나중에 내역에서 구분되게 하려는 것이다.
-- ---------------------------------------------------------------------------

create function public.archive_product(
  p_product_id uuid,
  p_zero_stock boolean default true,
  p_note       text    default null
) returns integer                      -- 넣은 실사 전표 수
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v        public.variants;
  v_active boolean;
  v_count  integer := 0;
begin
  select is_active into v_active
    from public.products
   where id = p_product_id
     for update;

  if not found then
    raise exception '상품을 찾을 수 없습니다';
  end if;
  if not v_active then
    raise exception '이미 삭제된 상품입니다';
  end if;

  if p_zero_stock then
    for v in
      select * from public.variants
       where product_id = p_product_id
         and is_active
         and stock_qty <> 0
       order by id                      -- record_sale 과 같은 잠금 순서
    loop
      insert into public.stock_movements (variant_id, type, qty_delta, counted_qty, note)
      values (v.id, 'stocktake', 0, 0, coalesce(p_note, '상품 삭제 정리'));
      v_count := v_count + 1;
    end loop;
  end if;

  update public.variants
     set is_active = false, updated_at = now()
   where product_id = p_product_id;

  update public.products
     set is_active = false, updated_at = now()
   where id = p_product_id;

  return v_count;
end $$;

comment on function public.archive_product(uuid, boolean, text) is
  '상품 숨기기. 기본은 남은 재고를 실사 0 으로 정리한 뒤 products/variants.is_active 를 끈다';

-- 여러 개를 한 번에. 하나라도 실패하면 전부 되돌린다 — 재고 화면의 "선택 삭제"가
-- 반쯤 성공한 채로 끝나면 어느 것이 지워졌는지 사용자가 다시 세어야 한다.
create function public.archive_products(
  p_product_ids uuid[],
  p_zero_stock  boolean default true
) returns integer                      -- 숨긴 상품 수
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id    uuid;
  v_count integer := 0;
begin
  if p_product_ids is null or array_length(p_product_ids, 1) is null then
    raise exception '삭제할 상품을 고르세요';
  end if;

  foreach v_id in array p_product_ids loop
    perform public.archive_product(v_id, p_zero_stock, null);
    v_count := v_count + 1;
  end loop;

  return v_count;
end $$;

-- 되살리기. 실사 0 으로 정리했던 수량은 되돌리지 않는다 — 그 사이 실제 물건이
-- 어떻게 됐는지 DB 는 모르고, 되살린 뒤 실사로 다시 세는 것이 맞다.
create function public.restore_product(p_product_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_active boolean;
begin
  select is_active into v_active
    from public.products
   where id = p_product_id
     for update;

  if not found then
    raise exception '상품을 찾을 수 없습니다';
  end if;
  if v_active then
    raise exception '삭제되지 않은 상품입니다';
  end if;

  update public.products
     set is_active = true, updated_at = now()
   where id = p_product_id;

  update public.variants
     set is_active = true, updated_at = now()
   where product_id = p_product_id;
end $$;

comment on function public.restore_product(uuid) is
  '숨긴 상품을 재고 목록으로 되돌린다. 수량은 건드리지 않는다';

-- 재고 화면 "삭제됨" 탭이 읽는 뷰. v_variant_stock 은 is_active 를 걸러내므로
-- 숨긴 상품은 거기 없다. 상품 단위로 한 줄씩 — 변형별로 펼치면 "몇 개를
-- 지웠는지"가 헷갈린다.
create view public.v_archived_products
with (security_invoker = true) as
select
  p.id                                   as product_id,
  p.name                                 as product_name,
  p.pos_name,
  p.channel,
  c.name                                 as category_name,
  p.updated_at                           as archived_at,
  count(v.id)::integer                   as variant_count,
  coalesce(sum(v.stock_qty), 0)::integer as stock_qty,
  min(b.code)                            as barcode
from public.products p
left join public.categories c on c.id = p.category_id
left join public.variants   v on v.product_id = p.id
left join public.barcodes   b on b.variant_id = v.id
where not p.is_active
group by p.id, c.name;

comment on view public.v_archived_products is
  '삭제(숨김)한 상품 목록. 재고 화면 "삭제됨" 탭과 되살리기가 쓴다';

grant execute on function
  public.archive_product(uuid, boolean, text),
  public.archive_products(uuid[], boolean),
  public.restore_product(uuid)
to authenticated;

grant select on public.v_archived_products to authenticated;
