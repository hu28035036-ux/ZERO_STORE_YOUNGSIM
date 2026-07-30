-- 0005 조회용 뷰
--
-- 모든 뷰에 security_invoker = true 를 붙인다.
-- 빠뜨리면 뷰가 소유자 권한으로 실행되어 RLS 를 통째로 우회한다.
-- Supabase 보안 어드바이저가 security_definer_view 로 지적하는 항목이다.

-- ---------------------------------------------------------------------------
-- v_variant_stock : 재고 화면의 기본 소스
-- ---------------------------------------------------------------------------
create view public.v_variant_stock with (security_invoker = true) as
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
  v.updated_at
from public.variants v
join public.products p       on p.id = v.product_id
left join public.categories c on c.id = p.category_id;

comment on view public.v_variant_stock is '재고 현황 (모바일 카드 / 데스크톱 테이블 공용 소스)';

-- ---------------------------------------------------------------------------
-- v_low_stock : 재고 부족. 부족한 정도가 큰 순서.
-- ---------------------------------------------------------------------------
create view public.v_low_stock with (security_invoker = true) as
select *
  from public.v_variant_stock
 where is_active and product_active
   and stock_qty <= low_stock_threshold;

-- ---------------------------------------------------------------------------
-- v_daily_sales : 일별 매출
--
-- 날짜 버킷을 반드시 한국 시간으로 자른다.
-- UTC 로 자르면 밤 9시 이후 판매가 전부 다음 날로 밀려 집계가 하루씩 어긋난다.
-- ---------------------------------------------------------------------------
create view public.v_daily_sales with (security_invoker = true) as
select
  (m.occurred_at at time zone 'Asia/Seoul')::date  as sale_date,
  count(distinct m.sale_order_id)                  as order_count,
  sum(-m.qty_delta)                                as qty_sold,
  sum(m.revenue_amount)                            as revenue,
  sum(m.cost_amount)                               as cogs,
  sum(m.revenue_amount - m.cost_amount)            as margin
from public.stock_movements m
where m.type = 'sale'
group by 1;

comment on view public.v_daily_sales is '일별 매출 (KST 기준 날짜 버킷)';

-- ---------------------------------------------------------------------------
-- v_stock_valuation : 재고 자산 총계 (대시보드 타일)
-- ---------------------------------------------------------------------------
create view public.v_stock_valuation with (security_invoker = true) as
select
  count(*)                                    as variant_count,
  coalesce(sum(stock_qty), 0)                 as total_qty,
  coalesce(sum(stock_qty * cost_price), 0)    as total_cost_value,
  coalesce(sum(stock_qty * sale_price), 0)    as total_retail_value
from public.variants
where is_active;

-- ---------------------------------------------------------------------------
-- v_stock_integrity : 캐시 vs 원장 불일치 감사
--
-- 정상이라면 항상 0행이어야 한다. 0행이 아니면 recalc_stock() 으로 복구한다.
-- 이 뷰가 있어서 비정규화 캐시를 안심하고 쓸 수 있다.
-- ---------------------------------------------------------------------------
create view public.v_stock_integrity with (security_invoker = true) as
select
  v.id                        as variant_id,
  p.name                      as product_name,
  v.stock_qty                 as cached_qty,
  coalesce(l.ledger_qty, 0)   as ledger_qty,
  v.stock_qty - coalesce(l.ledger_qty, 0) as drift
from public.variants v
join public.products p on p.id = v.product_id
left join (
  select variant_id, sum(qty_delta)::int as ledger_qty
    from public.stock_movements
   group by variant_id
) l on l.variant_id = v.id
where v.stock_qty is distinct from coalesce(l.ledger_qty, 0);

comment on view public.v_stock_integrity is
  '재고 캐시와 원장 합계의 불일치. 항상 0행이어야 정상';
