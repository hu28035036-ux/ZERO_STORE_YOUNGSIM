-- ---------------------------------------------------------------------------
-- 0011 : 입출고 내역 뷰
--
-- 내역 화면은 전표 하나를 보여주려고 상품명·옵션 라벨·거래처·처리자를 전부
-- 조인해야 한다. 이걸 화면 쪽 쿼리로 매번 조립하면 fn_option_label 과 같은
-- 계산을 앱에서 다시 구현하게 되고, 그 순간 재고 화면과 내역 화면의 옵션
-- 표기가 갈라진다.
--
-- voided_by 를 같이 내려주는 게 이 뷰의 핵심이다. 원장은 append-only 라
-- 정정도 전표로 남는데, 그 사실을 알려면 "나를 상쇄한 전표가 있는가"를
-- 매번 되물어야 한다. 화면에서 목록을 돌며 N번 묻는 대신 여기서 한 번에 붙인다.
-- ---------------------------------------------------------------------------

create view public.v_movements with (security_invoker = true) as
select
  m.id,
  m.occurred_at,
  m.type,
  m.qty_delta,
  m.counted_qty,
  m.stock_after,
  m.unit_cost,
  m.unit_price,
  m.revenue_amount,
  m.purchase_amount,
  m.note,
  m.reverses_id,
  m.sale_order_id,
  m.variant_id,
  p.id                                               as product_id,
  p.name                                             as product_name,
  public.fn_option_label(v.options, p.option_schema) as option_label,
  v.sku,
  c.name                                             as category_name,
  m.supplier_id,
  s.name                                             as supplier_name,
  m.created_by,
  pr.display_name                                    as created_by_name,
  -- 이 전표를 상쇄한 정정 전표. 있으면 이미 정정된 것이라 다시 정정할 수 없다.
  (select r.id
     from public.stock_movements r
    where r.reverses_id = m.id
    limit 1)                                         as voided_by
from public.stock_movements m
join public.variants v        on v.id = m.variant_id
join public.products p        on p.id = v.product_id
left join public.categories c on c.id = p.category_id
left join public.suppliers s  on s.id = m.supplier_id
left join public.profiles pr  on pr.id = m.created_by;

comment on view public.v_movements is
  '입출고 내역 (상품·옵션·거래처·처리자·정정 여부까지 붙인 원장 조회용)';

-- 0009 와 같은 이유로 anon 에게서는 권한 자체를 회수한다.
revoke all on public.v_movements from anon;
grant select on public.v_movements to authenticated;
