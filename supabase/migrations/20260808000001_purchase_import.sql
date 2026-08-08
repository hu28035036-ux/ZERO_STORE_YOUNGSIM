-- ---------------------------------------------------------------------------
-- 0020 : 입고 파일 일괄 반영
--
-- 발주·거래명세 파일(엑셀/CSV)을 올려 기존 상품의 입고를 한 번에 넣는다.
-- 상품 임포트(0016)는 "새 상품 등록", 판매 임포트(0015)는 "판매 반영"이고,
-- 재발주 물건이 들어왔을 때의 경로가 없어서 사용자가 입고를 한 줄씩 치고
-- 있었다 — 이 마이그레이션이 그 구멍을 메운다.
--
-- import_batch_id 를 원장에 두는 이유: 파일 하나를 잘못 올리면 전표 수백
-- 장이 생기는데, 이력·되돌리기가 "파일 한 번" 단위로 묶이지 않으면 한 장씩
-- 정정해야 한다. note 접두사로 묶는 방법은 사람이 메모를 고칠 수 없게 되고
-- 파싱이 근거가 되므로 컬럼이 맞다. (판매 임포트는 sale_orders 에 같은
-- 목적의 컬럼이 이미 있다 — 원장에는 영수증이 없어서 여기 직접 둔다.)
-- ---------------------------------------------------------------------------

alter table public.stock_movements add column import_batch_id uuid;

create index idx_mv_import_batch on public.stock_movements (import_batch_id)
  where import_batch_id is not null;

comment on column public.stock_movements.import_batch_id is
  '입고 파일 반영 배치. 파일 한 번 = 배치 하나. void_purchase_import() 가 이 단위로 되돌린다';

-- ---------------------------------------------------------------------------
-- 일괄 입고. 전부 아니면 전무 — 한 줄이라도 틀리면 아무것도 안 들어간다.
--
-- p_rows: [{variant_id, qty, unit_cost?, boxes?, per_pack?}]
--   qty        낱개 수량 (필수, ≥1)
--   unit_cost  낱개 매입가. 없으면 트리거가 현재 이동평균 원가를 스냅샷한다
--   boxes      박스로 해석한 줄이면 박스 수. 서버가 qty = boxes × per_pack 을
--              다시 검산한다 — 화면의 환산과 전표가 어긋난 채 들어오면 재고가
--              조용히 틀어지는데 그때는 아무 화면에도 티가 안 난다
--   per_pack   박스당 개수 (boxes 가 있으면 필수, ≥2)
--
-- record_stock_movement() 를 부르지 않고 직접 insert 한다. 재고·원가·스냅샷은
-- 전부 원장 트리거(0003)의 몫이라 겹치는 로직이 없고, 배치 컬럼을 채우려고
-- 그 함수의 시그니처를 바꾸면(drop 후 재생성) 건드리는 면적이 더 커진다.
-- ---------------------------------------------------------------------------
create function public.import_purchases(
  p_rows        jsonb,
  p_note        text default null,   -- 파일 이름. 각 전표 메모에 남는다
  p_occurred_on date default null    -- KST 발생일. 생략·오늘이면 지금 시각
) returns table (
  batch_id       uuid,
  movement_count integer,
  total_qty      integer
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_batch uuid := gen_random_uuid();
  v_row   jsonb;
  v_vid   uuid;
  v_qty   integer;
  v_cost  numeric;
  v_boxes integer;
  v_per   integer;
  v_note  text;
  v_pack_name text;
  v_unit  text;
  v_when  timestamptz;
  v_count integer := 0;
  v_total integer := 0;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception '반영할 줄이 없습니다';
  end if;

  if p_occurred_on is not null and p_occurred_on > v_today then
    raise exception '앞날짜로는 등록할 수 없습니다';
  end if;

  -- 지난 날짜면 그 날 정오(KST 오프셋 명시 — 자정으로 두면 날짜 버킷이 하루
  -- 밀린다, movements/actions.ts 와 같은 규칙). 오늘·생략이면 지금 시각.
  if p_occurred_on is null or p_occurred_on = v_today then
    v_when := now();
  else
    v_when := (p_occurred_on::text || ' 12:00:00+09')::timestamptz;
  end if;

  -- variant_id 정렬 = 잠금 획득 순서 고정. record_sale 과 같은 이유 —
  -- 두 반영이 동시에 돌아도 교착이 생기지 않는다.
  for v_row in
    select e from jsonb_array_elements(p_rows) e order by (e->>'variant_id')
  loop
    v_vid   := (v_row->>'variant_id')::uuid;
    v_qty   := (v_row->>'qty')::integer;
    v_cost  := nullif(v_row->>'unit_cost', '')::numeric;
    v_boxes := nullif(v_row->>'boxes', '')::integer;
    v_per   := nullif(v_row->>'per_pack', '')::integer;

    if v_qty is null or v_qty < 1 then
      raise exception '수량은 1 이상이어야 합니다 (variant %)', v_vid;
    end if;
    if v_cost is not null and v_cost < 0 then
      raise exception '매입가는 0 이상이어야 합니다 (variant %)', v_vid;
    end if;

    if v_boxes is not null then
      if v_per is null or v_per < 2 or v_boxes < 1 or v_qty <> v_boxes * v_per then
        raise exception '박스 환산이 맞지 않습니다 (variant %)', v_vid;
      end if;

      -- 몇 박스가 들어왔는지는 전표에 남아야 나중에 읽힌다 (박스 입고 폼과
      -- 같은 표기). 묶음 이름·세는 말은 상품의 것을 쓴다.
      select coalesce(nullif(p2.purchase_unit_name, ''), '박스'),
             coalesce(nullif(p2.unit, ''), '개')
        into v_pack_name, v_unit
        from public.variants v2
        join public.products p2 on p2.id = v2.product_id
       where v2.id = v_vid;

      v_note := left(
        format('[%s%s × %s%s]%s', v_boxes, v_pack_name, v_per, v_unit,
               coalesce(' ' || p_note, '')),
        200);
    else
      v_note := left(p_note, 200);
    end if;

    insert into public.stock_movements
      (variant_id, type, qty_delta, unit_cost, note, occurred_at, import_batch_id)
    values
      (v_vid, 'purchase', v_qty, v_cost, v_note, v_when, v_batch);

    v_count := v_count + 1;
    v_total := v_total + v_qty;
  end loop;

  return query select v_batch, v_count, v_total;
end $$;

comment on function public.import_purchases(jsonb, text, date) is
  '입고 파일 일괄 반영. 한 트랜잭션, 배치 id 로 묶여 통째로 되돌릴 수 있다';

-- ---------------------------------------------------------------------------
-- 배치 되돌리기 : 반대 전표를 **원본 날짜**에 넣는다.
--
-- void_movement 를 부르지 않는 이유는 판매 임포트(0015)와 같다 — 입출고
-- 정정은 "정정한 오늘"이 맞지만, 파일 되돌림은 반품이 아니라 "잘못 넣은
-- 기록의 취소"라서 원본 날짜에서 상쇄돼야 그 날의 매입 통계가 파일이 없던
-- 모습으로 돌아간다. type 을 purchase 로 유지해야 purchase_amount (생성
-- 컬럼)가 매입액을 정확히 상쇄한다 (0012 의 결정과 같은 이유).
-- 언제 취소했는지는 created_at 이 남긴다.
-- ---------------------------------------------------------------------------
create function public.void_purchase_import(
  p_batch_id uuid,
  p_reason   text default null
) returns integer  -- 되돌린 전표 수
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  m record;
  v_count integer := 0;
begin
  for m in
    select * from public.stock_movements s
     where s.import_batch_id = p_batch_id
       and s.reverses_id is null
       and not exists (
         select 1 from public.stock_movements r where r.reverses_id = s.id
       )
     order by s.variant_id   -- 잠금 획득 순서 고정
  loop
    -- 반대 전표에 import_batch_id 를 붙이지 않는다 — 붙이면 배치의 "유효
    -- 전표 수"를 세는 모든 곳이 정정 전표를 빼는 조건을 알아야 한다.
    insert into public.stock_movements
      (variant_id, type, qty_delta, unit_cost, reverses_id, note, occurred_at)
    values
      (m.variant_id, m.type, -m.qty_delta, m.unit_cost, m.id,
       coalesce(p_reason, '입고 파일 되돌림'), m.occurred_at);

    v_count := v_count + 1;
  end loop;

  if v_count = 0 then
    raise exception '되돌릴 전표가 없습니다 — 이미 되돌렸거나 없는 배치입니다';
  end if;

  return v_count;
end $$;

comment on function public.void_purchase_import(uuid, text) is
  '입고 파일 배치 되돌리기. 반대 전표를 원본 날짜에 넣어 매입 통계까지 상쇄한다';

-- ---------------------------------------------------------------------------
-- 권한 : 나머지 RPC 와 같은 규칙
-- ---------------------------------------------------------------------------
revoke execute on function
  public.import_purchases(jsonb, text, date),
  public.void_purchase_import(uuid, text)
from public, anon;

grant execute on function
  public.import_purchases(jsonb, text, date),
  public.void_purchase_import(uuid, text)
to authenticated;
