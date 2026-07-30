-- 0002 마스터 테이블
--   profiles / categories / suppliers / products / variants / barcodes / app_settings
--
-- 금액은 numeric(12,2). 원화는 실무상 정수지만 numeric 이 부동소수 오차를 막고
-- 나중에 부가세·할인율을 넣을 여지를 남긴다.

-- ---------------------------------------------------------------------------
-- profiles : 누가 처리했는지 표시하기 위한 최소 테이블
-- RLS 하에서 클라이언트는 auth.users 를 조인할 수 없어서 별도 테이블이 필요하다.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now()
);

comment on table public.profiles is '사용자 표시 이름 (auth.users 미러)';

-- ---------------------------------------------------------------------------
-- categories : 사용자가 화면에서 추가·수정·삭제하는 2단 계층
-- ---------------------------------------------------------------------------
create table public.categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) > 0),
  parent_id  uuid references public.categories(id) on delete restrict,
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- NULLS NOT DISTINCT (PG15+) 덕분에 최상위 카테고리 이름도
-- COALESCE 트릭 없이 유일성이 걸린다.
create unique index uq_categories_name
  on public.categories (parent_id, name) nulls not distinct;
create index idx_categories_parent on public.categories (parent_id);

comment on table public.categories is '상품 카테고리 (대분류 > 소분류, 최대 2단)';

-- 계층 깊이를 2단으로 제한한다. 더 깊어지면 휴대폰의 카테고리 선택 UI 가 무너진다.
create or replace function public.fn_check_category_depth()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception '카테고리는 자기 자신을 상위로 지정할 수 없습니다';
  end if;

  -- 상위가 이미 누군가의 하위라면 이번 항목은 3단째가 된다
  if exists (
    select 1 from public.categories
     where id = new.parent_id and parent_id is not null
  ) then
    raise exception '카테고리는 2단계까지만 만들 수 있습니다 (대분류 > 소분류)';
  end if;

  -- 하위를 가진 항목을 남의 밑으로 옮겨도 3단이 된다
  if exists (select 1 from public.categories where parent_id = new.id) then
    raise exception '하위 카테고리가 있는 항목은 다른 카테고리 아래로 옮길 수 없습니다';
  end if;

  return new;
end $$;

create trigger trg_check_category_depth
before insert or update of parent_id on public.categories
for each row execute function public.fn_check_category_depth();

create trigger trg_categories_touch
before update on public.categories
for each row execute function public.fn_touch_updated_at();

-- ---------------------------------------------------------------------------
-- suppliers : 거래처. 모든 입력에서 선택 사항이다.
-- ---------------------------------------------------------------------------
create table public.suppliers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (length(btrim(name)) > 0),
  phone      text,
  memo       text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_suppliers_touch
before update on public.suppliers
for each row execute function public.fn_touch_updated_at();

comment on table public.suppliers is '매입 거래처 (선택 입력)';

-- ---------------------------------------------------------------------------
-- products : 상품. 옵션 축을 상품마다 다르게 갖는다.
--   option_schema 예)
--   [{"name":"사이즈","values":["S","M","L"]},{"name":"맛","values":["딸기","초코"]}]
-- ---------------------------------------------------------------------------
create table public.products (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(btrim(name)) > 0),
  -- 카테고리를 지워도 상품은 절대 사라지면 안 된다
  category_id   uuid references public.categories(id) on delete set null,
  description   text,
  image_url     text,
  option_schema jsonb not null default '[]'::jsonb
                check (jsonb_typeof(option_schema) = 'array'),
  is_active     boolean not null default true,
  created_by    uuid default auth.uid() references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_products_category on public.products (category_id);
create index idx_products_created_by on public.products (created_by);
-- 상품명 부분 검색용. '%감자%' 형태가 인덱스를 탄다.
create index idx_products_name_trgm
  on public.products using gin (name extensions.gin_trgm_ops);

create trigger trg_products_touch
before update on public.products
for each row execute function public.fn_touch_updated_at();

comment on column public.products.option_schema is
  '이 상품이 사용하는 옵션 축 정의. 변형 생성 UI 의 드롭다운 소스이자 유효성 검사 기준';

-- ---------------------------------------------------------------------------
-- variants : 실제 재고 단위(SKU). options 는 {"사이즈":"L","맛":"딸기"} 형태.
--   옵션이 없는 상품도 options = '{}' 인 변형 1개를 갖는다.
--   → 재고 경로가 하나로 통일되어 모든 화면이 단순해진다.
-- ---------------------------------------------------------------------------
create table public.variants (
  id                  uuid primary key default gen_random_uuid(),
  product_id          uuid not null references public.products(id) on delete cascade,
  options             jsonb not null default '{}'::jsonb
                      check (jsonb_typeof(options) = 'object'),
  sku                 text unique,
  sale_price          numeric(12,2) not null default 0 check (sale_price >= 0),
  -- 이동평균 원가. 입고 전표에서만 갱신되는 파생값이다.
  cost_price          numeric(12,2) not null default 0 check (cost_price >= 0),
  -- 원장(stock_movements)이 진실이고 이 컬럼은 조회 성능용 캐시다.
  stock_qty           integer not null default 0,
  low_stock_threshold integer not null default 0 check (low_stock_threshold >= 0),
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- jsonb 는 키를 정규 순서로 저장하므로 {"맛":"딸기","사이즈":"L"} 와
-- {"사이즈":"L","맛":"딸기"} 가 같은 값이다. 따라서 이 유니크 인덱스가
-- 실제로 중복 옵션 조합을 막아준다.
create unique index uq_variants_product_options
  on public.variants (product_id, options);
create index idx_variants_product   on public.variants (product_id);
create index idx_variants_options   on public.variants using gin (options jsonb_path_ops);
create index idx_variants_low_stock on public.variants (stock_qty) where is_active;

create trigger trg_variants_touch
before update on public.variants
for each row execute function public.fn_touch_updated_at();

comment on column public.variants.stock_qty is
  '현재 재고 캐시. 진실은 stock_movements 합계이며 트리거가 동기화한다';
comment on column public.variants.cost_price is
  '이동평균 원가. 입고 전표만 갱신하고 판매 전표는 이 값을 스냅샷한다';

-- 상품에 선언되지 않은 옵션 항목을 거부한다.
-- JSONB 설계가 보통 무너지는 지점(자유 입력 오타)을 여기서 막는다.
create or replace function public.fn_validate_variant_options()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_bad text;
begin
  select t.k into v_bad
    from jsonb_object_keys(new.options) as t(k)
   where not exists (
     select 1
       from public.products p,
            lateral jsonb_array_elements(p.option_schema) a
      where p.id = new.product_id
        and a->>'name' = t.k
   )
   limit 1;

  if v_bad is not null then
    raise exception
      '상품에 정의되지 않은 옵션 항목입니다: "%". 상품 정보에서 옵션을 먼저 추가하세요.', v_bad;
  end if;

  return new;
end $$;

create trigger trg_validate_variant_options
before insert or update of options, product_id on public.variants
for each row execute function public.fn_validate_variant_options();

-- ---------------------------------------------------------------------------
-- barcodes : 변형 하나가 여러 코드를 가질 수 있다 (제조사 낱개 / 박스 / 자체 발행)
-- code 를 PK 로 두어 스캐너 조회가 PK 단일 조회가 되게 한다.
-- ---------------------------------------------------------------------------
create table public.barcodes (
  code       text primary key check (length(btrim(code)) between 4 and 64),
  variant_id uuid not null references public.variants(id) on delete cascade,
  label      text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_barcodes_variant on public.barcodes (variant_id);
-- 변형당 대표 바코드는 최대 하나
create unique index uq_barcodes_primary
  on public.barcodes (variant_id) where is_primary;

comment on table public.barcodes is
  '변형별 바코드. 제조사 EAN-13 과 자체 발행 CODE128 을 함께 담는다';

-- ---------------------------------------------------------------------------
-- app_settings : 단일 행 설정
-- boolean PK + check(id) 는 "행이 정확히 하나"를 보장하는 관용구다.
-- ---------------------------------------------------------------------------
create table public.app_settings (
  id                boolean primary key default true check (id),
  store_name        text not null default '영심 스토어',
  default_low_stock integer not null default 5 check (default_low_stock >= 0),
  updated_at        timestamptz not null default now()
);

create trigger trg_app_settings_touch
before update on public.app_settings
for each row execute function public.fn_touch_updated_at();

insert into public.app_settings (id) values (true);
