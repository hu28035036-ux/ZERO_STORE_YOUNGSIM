-- 0008 인증 훅 + 기본 데이터
--
-- 새 사용자가 생기면 profiles 행을 자동으로 만든다.
-- auth 스키마에 트리거를 걸어야 하므로 이 함수만 security definer 다.

create or replace function public.fn_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    -- 초대 시 넣어준 이름 → 없으면 이메일 아이디 부분
    coalesce(
      nullif(btrim(new.raw_user_meta_data->>'display_name'), ''),
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger trg_on_auth_user_created
after insert on auth.users
for each row execute function public.fn_handle_new_user();

-- 이미 만들어진 사용자가 있다면 채워 넣는다 (재실행 안전)
insert into public.profiles (id, display_name)
select u.id, split_part(u.email, '@', 1)
  from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 시작용 카테고리. 화면에서 언제든 이름을 바꾸거나 지울 수 있다.
-- ---------------------------------------------------------------------------
insert into public.categories (name, position) values
  ('요리', 1),
  ('과자', 2),
  ('음료', 3),
  ('기타', 4)
on conflict do nothing;
