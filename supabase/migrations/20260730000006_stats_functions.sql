-- 0006 통계 함수
--
-- 뷰는 기간 파라미터를 받을 수 없으므로 통계 화면은 이 함수들을 rpc() 로 부른다.
-- 전부 stable + security invoker + 고정 search_path.
-- 날짜 비교는 예외 없이 KST 기준으로 자른다.

-- ---------------------------------------------------------------------------
-- 기간 요약. 통계 화면 상단 + 직전 기간 대비 증감(두 번 호출)에 쓴다.
-- ---------------------------------------------------------------------------
create or replace function public.stats_summary(p_from date, p_to date)
returns table (
  revenue         numeric,
  cogs            numeric,
  margin          numeric,
  margin_rate     numeric,
  qty_sold        bigint,
  order_count     bigint,
  avg_order_value numeric
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    coalesce(sum(revenue_amount), 0),
    coalesce(sum(cost_amount), 0),
    coalesce(sum(revenue_amount - cost_amount), 0),
    case when coalesce(sum(revenue_amount), 0) > 0
         then round(100 * sum(revenue_amount - cost_amount) / sum(revenue_amount), 1)
         else 0 end,
    coalesce(sum(-qty_delta), 0)::bigint,
    count(distinct sale_order_id)::bigint,
    case when count(distinct sale_order_id) > 0
         then round(sum(revenue_amount) / count(distinct sale_order_id))
         else 0 end
  from public.stock_movements
  where type = 'sale'
    and (occurred_at at time zone 'Asia/Seoul')::date between p_from and p_to;
$$;

-- ---------------------------------------------------------------------------
-- 인기 상품 / 마진 분석 공용.
-- 마진율 오름차순으로 정렬해서 보면 "많이 팔리는데 안 남는" 상품이 드러난다.
-- ---------------------------------------------------------------------------
create or replace function public.stats_top_products(
  p_from  date,
  p_to    date,
  p_limit integer default 20
)
returns table (
  product_id    uuid,
  product_name  text,
  variant_id    uuid,
  option_label  text,
  category_name text,
  qty_sold      bigint,
  revenue       numeric,
  margin        numeric,
  margin_rate   numeric
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    p.id, p.name, v.id,
    public.fn_option_label(v.options, p.option_schema),
    c.name,
    sum(-m.qty_delta)::bigint,
    sum(m.revenue_amount),
    sum(m.revenue_amount - m.cost_amount),
    case when sum(m.revenue_amount) > 0
         then round(100 * sum(m.revenue_amount - m.cost_amount) / sum(m.revenue_amount), 1)
         else 0 end
  from public.stock_movements m
  join public.variants v        on v.id = m.variant_id
  join public.products p        on p.id = v.product_id
  left join public.categories c on c.id = p.category_id
  where m.type = 'sale'
    and (m.occurred_at at time zone 'Asia/Seoul')::date between p_from and p_to
  group by p.id, p.name, v.id, v.options, p.option_schema, c.name
  order by sum(m.revenue_amount) desc
  limit p_limit;
$$;

-- ---------------------------------------------------------------------------
-- 카테고리별 구성 (도넛 + 표)
-- ---------------------------------------------------------------------------
create or replace function public.stats_by_category(p_from date, p_to date)
returns table (
  category_id   uuid,
  category_name text,
  qty_sold      bigint,
  revenue       numeric,
  margin        numeric,
  margin_rate   numeric,
  revenue_share numeric
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with sales as (
    select c.id as cid,
           coalesce(c.name, '미분류') as cname,
           -m.qty_delta as qty,
           m.revenue_amount as rev,
           m.revenue_amount - m.cost_amount as mgn
      from public.stock_movements m
      join public.variants v        on v.id = m.variant_id
      join public.products p        on p.id = v.product_id
      left join public.categories c on c.id = p.category_id
     where m.type = 'sale'
       and (m.occurred_at at time zone 'Asia/Seoul')::date between p_from and p_to
  ), total as (
    select nullif(sum(rev), 0) as all_rev from sales
  )
  select
    s.cid, s.cname,
    sum(s.qty)::bigint,
    sum(s.rev),
    sum(s.mgn),
    case when sum(s.rev) > 0 then round(100 * sum(s.mgn) / sum(s.rev), 1) else 0 end,
    round(100 * sum(s.rev) / coalesce((select all_rev from total), 1), 1)
  from sales s
  group by s.cid, s.cname
  order by sum(s.rev) desc;
$$;

-- ---------------------------------------------------------------------------
-- 재고 회전율 (추정치)
--
-- 정확한 회전율은 기간 중 "평균 재고"가 필요하고, 그러려면 일별 스냅샷이 있어야 한다.
-- v1 은 기간 매출원가 ÷ 현재 재고자산을 연환산한다.
-- 화면에 반드시 "추정치"라고 표기할 것.
-- ---------------------------------------------------------------------------
create or replace function public.stats_turnover(p_from date, p_to date)
returns table (
  category_id     uuid,
  category_name   text,
  period_cogs     numeric,
  stock_value_now numeric,
  turnover_annual numeric,
  days_of_stock   numeric
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with days as (
    select greatest((p_to - p_from) + 1, 1)::numeric as n
  ), cogs as (
    select c.id as cid, coalesce(c.name, '미분류') as cname, sum(m.cost_amount) as cogs
      from public.stock_movements m
      join public.variants v        on v.id = m.variant_id
      join public.products p        on p.id = v.product_id
      left join public.categories c on c.id = p.category_id
     where m.type = 'sale'
       and (m.occurred_at at time zone 'Asia/Seoul')::date between p_from and p_to
     group by c.id, c.name
  ), stock as (
    select c.id as cid, coalesce(c.name, '미분류') as cname,
           sum(v.stock_qty * v.cost_price) as val
      from public.variants v
      join public.products p        on p.id = v.product_id
      left join public.categories c on c.id = p.category_id
     where v.is_active
     group by c.id, c.name
  )
  select
    coalesce(cogs.cid, stock.cid),
    coalesce(cogs.cname, stock.cname),
    coalesce(cogs.cogs, 0),
    coalesce(stock.val, 0),
    case when coalesce(stock.val, 0) > 0
         then round((coalesce(cogs.cogs, 0) / stock.val) * (365 / (select n from days)), 2)
         else 0 end,
    case when coalesce(cogs.cogs, 0) > 0
         then round(coalesce(stock.val, 0) / (cogs.cogs / (select n from days)), 1)
         else null end
  from cogs
  full outer join stock on stock.cid is not distinct from cogs.cid
  order by 3 desc;
$$;

comment on function public.stats_turnover(date, date) is
  '재고 회전율 추정치. 정확한 값은 일별 재고 스냅샷이 필요하므로 화면에 추정치로 표기할 것';

-- ---------------------------------------------------------------------------
-- 거래처별 매입
-- ---------------------------------------------------------------------------
create or replace function public.stats_by_supplier(p_from date, p_to date)
returns table (
  supplier_id     uuid,
  supplier_name   text,
  purchase_count  bigint,
  qty_purchased   bigint,
  purchase_amount numeric
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    s.id,
    coalesce(s.name, '미지정'),
    count(*)::bigint,
    sum(m.qty_delta)::bigint,
    sum(m.purchase_amount)
  from public.stock_movements m
  left join public.suppliers s on s.id = m.supplier_id
  where m.type = 'purchase'
    and (m.occurred_at at time zone 'Asia/Seoul')::date between p_from and p_to
  group by s.id, s.name
  order by sum(m.purchase_amount) desc;
$$;
