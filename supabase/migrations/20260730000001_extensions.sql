-- 0001 확장 및 공통 헬퍼
--
-- pgcrypto : gen_random_uuid()
-- pg_trgm  : 상품명 부분 검색 (LIKE '%감자%' 가 인덱스를 타게 한다)

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm  with schema extensions;

-- updated_at 자동 갱신 트리거 헬퍼.
-- search_path 를 고정하지 않으면 Supabase 보안 어드바이저가
-- function_search_path_mutable 로 지적한다. 모든 함수에 동일하게 적용한다.
create or replace function public.fn_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end $$;

comment on function public.fn_touch_updated_at() is
  'BEFORE UPDATE 트리거용: updated_at 을 현재 시각으로 갱신';
