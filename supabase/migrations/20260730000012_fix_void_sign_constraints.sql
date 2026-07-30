-- ---------------------------------------------------------------------------
-- 0012 : 정정 전표가 부호 제약에 걸리던 문제
--
-- 0003 의 제약은 "입고는 재고를 늘리고 출고는 줄인다"를 강제한다. 옳은 규칙인데
-- 정정 전표를 고려하지 않았다. void_movement() 는 원본과 같은 type 에 부호만
-- 뒤집은 전표를 넣으므로, 입고(+20) 정정은 type=purchase / qty_delta=-20 이 되어
-- chk_purchase_pos 에 걸린다. 출고도 대칭으로 걸린다.
--
-- 결과: 입고와 출고 — 이 앱에서 제일 많이 쓰는 두 종류 — 를 정정할 수 없었다.
-- 판매와 실사만 정정이 됐는데, 실사는 adjustment 로 갈아타서 통과한 것이고
-- 판매는 부호 제약이 없어서 통과한 것이라 우연히 가려져 있었다.
--
-- 고치는 방향: 정정 전표를 adjustment 로 바꿔치기하는 대신 type 을 유지하고
-- 제약을 정정까지 아는 형태로 다시 쓴다. purchase_amount 가
-- qty_delta * unit_cost 로 생성되는 컬럼이라, type 을 유지해야 정정이 매입
-- 통계에서 원래 금액을 정확히 상쇄한다. adjustment 로 바꾸면 재고만 돌아오고
-- 매입 금액은 장부에 그대로 남는다.
--
-- 제약을 느슨하게 푸는 게 아니라 경우를 나눈다.
--   일반 입고 → 양수 / 입고 정정 → 음수
--   일반 출고 → 음수 / 출고 정정 → 양수
-- 여전히 아무 부호나 들어오지는 못한다.
-- ---------------------------------------------------------------------------

alter table public.stock_movements drop constraint chk_purchase_pos;
alter table public.stock_movements drop constraint chk_outbound_neg;

alter table public.stock_movements
  add constraint chk_purchase_pos check (
    type <> 'purchase'
    or (case when reverses_id is null then qty_delta > 0 else qty_delta < 0 end)
  );

alter table public.stock_movements
  add constraint chk_outbound_neg check (
    type <> 'outbound'
    or (case when reverses_id is null then qty_delta < 0 else qty_delta > 0 end)
  );

comment on constraint chk_purchase_pos on public.stock_movements is
  '입고는 재고를 늘린다. 단 입고 정정 전표는 반대 부호여야 한다';
comment on constraint chk_outbound_neg on public.stock_movements is
  '출고는 재고를 줄인다. 단 출고 정정 전표는 반대 부호여야 한다';
