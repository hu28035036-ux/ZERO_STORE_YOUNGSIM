-- 0009 실행 권한 정리
--
-- PostgreSQL 은 새 함수의 EXECUTE 를 PUBLIC 에 자동으로 준다.
-- 그래서 아무 조치를 안 하면 anon 키만 가진 사람도 /rest/v1/rpc/<함수> 를 부를 수 있다.
-- 대부분은 security invoker + RLS 로 막히지만, 권한 자체를 회수하는 편이 낫다.
-- (공격 표면을 줄이고, Supabase 보안 어드바이저의 경고도 사라진다)

-- ---------------------------------------------------------------------------
-- 트리거 함수 : 어떤 역할도 직접 부를 이유가 없다.
-- 특히 fn_handle_new_user 는 이 스키마의 유일한 security definer 다.
-- 트리거는 소유자 권한으로 실행되므로 EXECUTE 를 회수해도 정상 동작한다.
-- ---------------------------------------------------------------------------
revoke execute on function public.fn_handle_new_user()          from public, anon, authenticated;
revoke execute on function public.fn_touch_updated_at()         from public, anon, authenticated;
revoke execute on function public.fn_apply_stock_movement()     from public, anon, authenticated;
revoke execute on function public.fn_movements_append_only()    from public, anon, authenticated;
revoke execute on function public.fn_check_category_depth()     from public, anon, authenticated;
revoke execute on function public.fn_validate_variant_options() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 업무 RPC : 로그인 사용자만.
-- anon 이 불러도 RLS 에서 막히지만, 401 대신 권한 오류로 더 일찍 끊는다.
-- ---------------------------------------------------------------------------
revoke execute on function
  public.record_stock_movement(uuid, public.stock_movement_type, integer, numeric, uuid, text, timestamptz),
  public.record_stocktake(uuid, integer, text),
  public.record_sale(jsonb, text, timestamptz),
  public.void_movement(bigint, text),
  public.recalc_stock(uuid),
  public.lookup_by_barcode(text),
  public.stats_summary(date, date),
  public.stats_top_products(date, date, integer),
  public.stats_by_category(date, date),
  public.stats_by_supplier(date, date),
  public.stats_turnover(date, date)
from public, anon;

grant execute on function
  public.record_stock_movement(uuid, public.stock_movement_type, integer, numeric, uuid, text, timestamptz),
  public.record_stocktake(uuid, integer, text),
  public.record_sale(jsonb, text, timestamptz),
  public.void_movement(bigint, text),
  public.recalc_stock(uuid),
  public.lookup_by_barcode(text),
  public.stats_summary(date, date),
  public.stats_top_products(date, date, integer),
  public.stats_by_category(date, date),
  public.stats_by_supplier(date, date),
  public.stats_turnover(date, date)
to authenticated;

-- fn_option_label 은 뷰 안에서 쓰이는 immutable 헬퍼다.
-- 뷰가 security invoker 이므로 호출자에게 EXECUTE 가 있어야 한다.
grant execute on function public.fn_option_label(jsonb, jsonb) to authenticated;
revoke execute on function public.fn_option_label(jsonb, jsonb) from public, anon;

-- ---------------------------------------------------------------------------
-- 뷰 : security invoker 라 기반 테이블의 RLS 가 그대로 적용된다.
-- anon 에게서는 테이블 권한 자체를 회수해 둔다.
-- ---------------------------------------------------------------------------
revoke all on
  public.v_variant_stock,
  public.v_low_stock,
  public.v_daily_sales,
  public.v_stock_valuation,
  public.v_stock_integrity
from anon;

grant select on
  public.v_variant_stock,
  public.v_low_stock,
  public.v_daily_sales,
  public.v_stock_valuation,
  public.v_stock_integrity
to authenticated;
