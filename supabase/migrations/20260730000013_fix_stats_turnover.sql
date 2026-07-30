-- ---------------------------------------------------------------------------
-- 0013 : stats_turnover 가 실행 자체가 안 되던 문제
--
-- 0006 의 마지막 조인이 이랬다.
--
--   full outer join stock on stock.cid is not distinct from cogs.cid
--
-- 의도는 맞다. 미분류 상품의 category_id 가 NULL 이라 `=` 로는 양쪽의 NULL 이
-- 서로 안 맞고, 그래서 NULL 끼리도 같은 것으로 보는 IS NOT DISTINCT FROM 을 썼다.
--
-- 문제는 PostgreSQL 이 FULL OUTER JOIN 을 merge 또는 hash 로만 실행할 수 있다는
-- 점이다. IS NOT DISTINCT FROM 은 둘 중 어느 쪽도 아니라서 계획 자체가 세워지지
-- 않고 0A000 으로 죽는다. 조건이 아니라 조인 종류의 문제라 데이터가 없어도
-- 똑같이 실패한다 — 즉 이 함수는 한 번도 동작한 적이 없다.
--
-- 고치는 방법: 양쪽 키를 UNION 으로 먼저 모으고 LEFT JOIN 두 번으로 붙인다.
-- LEFT JOIN 은 nestloop 로 실행할 수 있어서 IS NOT DISTINCT FROM 을 그대로 쓸 수
-- 있고, UNION 은 NULL 을 같은 값으로 묶어주므로 미분류도 한 줄로 모인다.
--
-- 계산식과 반환 컬럼은 손대지 않았다. 여전히 추정치이고 화면에도 그렇게 적는다.
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
  ), keys as (
    -- UNION 이 NULL 을 하나로 묶어준다. 미분류가 양쪽에 다 있어도 한 줄이다.
    select cid from cogs
    union
    select cid from stock
  )
  select
    k.cid,
    coalesce(c.cname, s.cname),
    coalesce(c.cogs, 0),
    coalesce(s.val, 0),
    case when coalesce(s.val, 0) > 0
         then round((coalesce(c.cogs, 0) / s.val) * (365 / (select n from days)), 2)
         else 0 end,
    case when coalesce(c.cogs, 0) > 0
         then round(coalesce(s.val, 0) / (c.cogs / (select n from days)), 1)
         else null end
  from keys k
  left join cogs  c on c.cid is not distinct from k.cid
  left join stock s on s.cid is not distinct from k.cid
  order by coalesce(c.cogs, 0) desc;
$$;

comment on function public.stats_turnover(date, date) is
  '재고 회전율 추정치. 정확한 값은 일별 재고 스냅샷이 필요하므로 화면에 추정치로 표기할 것';
