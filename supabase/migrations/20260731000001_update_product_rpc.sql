-- ---------------------------------------------------------------------------
-- 0014 : 상품 수정 RPC
--
-- 서버 액션에서 products update 와 variants update 를 N 번 따로 호출하면
-- 부분 실패가 남는다. 상품명은 저장됐는데 세 번째 변형에서 터지면 절반만 바뀐
-- 채로 끝나고, 화면은 저장에 실패했다고 말한다. create_product 가 같은 이유로
-- 함수 하나로 묶여 있다(0010). 대칭을 맞춘다.
--
-- 여기서 건드리지 않는 것과 그 이유:
--   stock_qty     원장(stock_movements)이 진실이고 이 컬럼은 캐시다. 손으로
--                 덮으면 v_stock_integrity 에 불일치로 뜬다
--   cost_price    입고 전표가 만드는 이동평균이다. 덮으면 과거 마진이 거짓이 된다
--   options       옵션 축을 바꾸면 기존 변형의 라벨이 깨진다
--   sku           전역 unique 라 실수로 겹치면 저장이 통째로 막힌다
--   is_active     숨기기는 이 화면의 몫이 아니다
-- ---------------------------------------------------------------------------

create or replace function public.update_product(
  p_product_id  uuid,
  p_name        text,
  p_category_id uuid  default null,
  p_description text  default null,
  -- [{ variant_id, sale_price, low_stock_threshold, barcode }]
  p_variants    jsonb default '[]'::jsonb
) returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_item     jsonb;
  v_variant  uuid;
  v_barcode  text;
  v_current  text;
  v_rows     integer;
begin
  update public.products
     set name        = btrim(p_name),
         category_id = p_category_id,
         description = nullif(btrim(coalesce(p_description, '')), '')
   where id = p_product_id;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception '상품을 찾을 수 없습니다';
  end if;

  for v_item in select e from jsonb_array_elements(coalesce(p_variants, '[]'::jsonb)) e
  loop
    v_variant := (v_item->>'variant_id')::uuid;

    -- product_id 조건이 이 함수의 방어선이다. RLS 는 인증 사용자에게 모든 변형에
    -- 대한 접근을 준다. 이 조건이 없으면 남의 상품 variant_id 를 payload 에
    -- 실어 보내는 것만으로 그 상품 가격이 바뀐다. 서버 액션은 UI 를 거치지 않고
    -- POST 로 직접 불릴 수 있다.
    update public.variants
       set sale_price          = coalesce((v_item->>'sale_price')::numeric,
                                          sale_price),
           low_stock_threshold = coalesce((v_item->>'low_stock_threshold')::integer,
                                          low_stock_threshold)
     where id = v_variant
       and product_id = p_product_id;

    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      raise exception '이 상품의 재고 단위가 아닙니다';
    end if;

    -- 변형은 바코드를 여러 개 가질 수 있는데 화면은 대표 하나만 보여준다.
    -- variant_id 로 싹 지우면 화면에 안 보이던 나머지가 같이 날아간다.
    -- v_variant_stock 과 같은 규칙으로 대표 한 줄을 찾아 그 줄만 다룬다.
    v_barcode := nullif(btrim(coalesce(v_item->>'barcode', '')), '');

    select b.code into v_current
      from public.barcodes b
     where b.variant_id = v_variant
     order by b.is_primary desc, b.created_at
     limit 1;

    if v_barcode is distinct from v_current then
      if v_current is not null then
        delete from public.barcodes where code = v_current;
      end if;
      if v_barcode is not null then
        insert into public.barcodes (code, variant_id, is_primary)
        values (v_barcode, v_variant, true);
      end if;
    end if;
  end loop;
end $$;

comment on function public.update_product(uuid, text, uuid, text, jsonb) is
  '상품 기본 정보와 변형별 판매가·최소재고·대표 바코드를 한 트랜잭션에 저장';

grant execute on function public.update_product(uuid, text, uuid, text, jsonb)
  to authenticated;
