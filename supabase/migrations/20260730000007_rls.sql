-- 0007 RLS
--
-- 역할 구분이 없는 공동 사용 앱이다.
-- authenticated = 전부 허용, anon = 전부 차단. 테넌트 컬럼도 소유자 필터도 없다.
--
-- 두 가지 세부가 중요하다:
--  1) (select auth.uid()) — 괄호 없는 auth.uid() 는 행마다 재평가된다.
--     원장 테이블처럼 행이 많은 곳에서 체감 차이가 난다.
--  2) anon 에 정책을 하나도 만들지 않으면, Supabase 의 기본 테이블 권한이 있어도
--     RLS 가 켜진 순간 전부 거부된다.

alter table public.profiles        enable row level security;
alter table public.categories      enable row level security;
alter table public.suppliers       enable row level security;
alter table public.products        enable row level security;
alter table public.variants        enable row level security;
alter table public.barcodes        enable row level security;
alter table public.sale_orders     enable row level security;
alter table public.stock_movements enable row level security;
alter table public.app_settings    enable row level security;

-- ---------------------------------------------------------------------------
-- 마스터 테이블: 인증 사용자는 전체 접근
-- ---------------------------------------------------------------------------
create policy "인증 사용자 전체 접근" on public.categories
  for all to authenticated using (true) with check (true);

create policy "인증 사용자 전체 접근" on public.suppliers
  for all to authenticated using (true) with check (true);

create policy "인증 사용자 전체 접근" on public.products
  for all to authenticated using (true) with check (true);

create policy "인증 사용자 전체 접근" on public.variants
  for all to authenticated using (true) with check (true);

create policy "인증 사용자 전체 접근" on public.barcodes
  for all to authenticated using (true) with check (true);

create policy "인증 사용자 전체 접근" on public.app_settings
  for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- profiles : 조회는 전체(처리자 이름 표시용), 수정은 본인만
-- ---------------------------------------------------------------------------
create policy "프로필 조회" on public.profiles
  for select to authenticated using (true);

create policy "내 프로필 수정" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- sale_orders : 조회 + 추가. 합계는 record_sale() 이 갱신하므로 UPDATE 도 허용한다.
-- ---------------------------------------------------------------------------
create policy "판매 조회" on public.sale_orders
  for select to authenticated using (true);

create policy "판매 추가" on public.sale_orders
  for insert to authenticated
  with check (created_by = (select auth.uid()));

create policy "판매 합계 갱신" on public.sale_orders
  for update to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- stock_movements : append-only
--
-- UPDATE / DELETE 정책을 아예 만들지 않는다 → PostgREST 가 거부한다.
-- (0003 의 트리거가 SQL 편집기 경로까지 막는 두 번째 방어선이다)
--
-- created_by = auth.uid() 를 with check 에 걸어두면 컬럼 기본값과 맞물려
-- 남의 이름으로 전표를 넣는 것이 불가능해진다.
-- ---------------------------------------------------------------------------
create policy "내역 조회" on public.stock_movements
  for select to authenticated using (true);

create policy "내역 추가" on public.stock_movements
  for insert to authenticated
  with check (created_by = (select auth.uid()));
