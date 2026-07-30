-- ---------------------------------------------------------------------------
-- 0010 : 상품 등록 RPC
--
-- 상품 하나를 만들려면 products → variants → barcodes 로 최소 세 번을 써야 한다.
-- 이걸 앱에서 순서대로 호출하면 두 번째에서 실패했을 때 변형 없는 상품이
-- 남는다. 그런 상품은 재고 화면에 나타나지도 않아서 아무도 눈치채지 못하고,
-- 결국 나중에 "왜 목록에 없지"로 돌아온다.
--
-- 함수 하나로 묶으면 통째로 성공하거나 통째로 없던 일이 된다.
-- ---------------------------------------------------------------------------

create or replace function public.create_product(
  p_name          text,
  p_category_id   uuid    default null,
  p_description   text    default null,
  p_option_schema jsonb   default '[]'::jsonb,
  -- [{ options, sku, sale_price, cost_price, low_stock_threshold,
  --    barcode, initial_qty, initial_unit_cost }]
  p_variants      jsonb   default '[]'::jsonb
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

  insert into public.products (name, category_id, description, option_schema)
  values (btrim(p_name), p_category_id, nullif(btrim(coalesce(p_description, '')), ''),
          coalesce(p_option_schema, '[]'::jsonb))
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
      product_id, options, sku, sale_price, cost_price, low_stock_threshold
    )
    values (
      v_product_id,
      v_options,
      nullif(btrim(coalesce(v_item->>'sku', '')), ''),
      coalesce((v_item->>'sale_price')::numeric, 0),
      v_cost_seed,
      coalesce((v_item->>'low_stock_threshold')::integer, 0)
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

comment on function public.create_product(text, uuid, text, jsonb, jsonb) is
  '상품·변형·바코드·기초재고를 한 트랜잭션으로 등록한다';

-- 0009 와 같은 이유로 PUBLIC 자동 권한을 회수하고 로그인 사용자에게만 준다.
revoke execute on function
  public.create_product(text, uuid, text, jsonb, jsonb) from public, anon;
grant execute on function
  public.create_product(text, uuid, text, jsonb, jsonb) to authenticated;
