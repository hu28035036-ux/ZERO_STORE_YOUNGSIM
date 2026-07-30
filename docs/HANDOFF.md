# 인계 문서

다음 세션이 이어받기 위한 문서다. **git 로그가 말해주지 않는 것**만 적는다 —
각 커밋이 왜 그렇게 되었는지는 커밋 메시지에 자세히 있으니 `git log` 를 먼저 읽어라.
여기에는 커밋에 안 남는 것들을 적는다: 무엇이 검증됐고 무엇이 안 됐는지,
DB 의 현재 상태, 막혀 있는 것, 다시 밟게 될 함정.

최종 갱신: 2026-07-31 / 브랜치 `claude/inventory-management-planning-fk6i1t`

---

## 한 줄 요약

여섯 화면(홈·재고·입출고·판매·통계·설정) 전부 구현했고, **2026-07-31 에 처음으로
로그인 뒤 화면 전부를 진짜 브라우저로 띄워 확인했다.** 데스크톱·모바일 두 셸에
여덟 경로, 프로덕션 빌드 기준이다. 그 과정에서 **로그인이 통째로 막혀 있던 것**을
찾아 고쳤고(계정 데이터 문제였다), 판매 화면에서 금액이 잘리는 레이아웃 버그도
고쳤다.

아직 안 한 것: Vercel 배포, 실제 바코드 스캐너 하드웨어, 마이그레이션 버전 정렬.
자세한 건 "검증 상태" 절을 봐라.

---

## 만든 것

Next.js 16 (App Router, Turbopack) + Supabase. 모바일과 데스크톱이 반응형으로
같은 화면을 늘렸다 줄였다 하는 구조가 **아니다**. proxy 가 UA 로 기기를 판별해
서버에서 한쪽 셸만 렌더링한다 (`lib/device.ts`, `components/shell/`).

| 경로 | 하는 일 |
|---|---|
| `/` | 오늘 매출·마진, 재고 자산, 부족 목록, 캐시 불일치 경고 |
| `/stock` | `v_variant_stock` 목록. 검색·필터·정렬(데스크톱은 표) |
| `/stock/new` | 옵션 축 → 데카르트 곱으로 변형 생성 → `create_product` 한 번 |
| `/movements` | `v_movements` 내역. 종류·기간 필터, 페이지 넘김, 정정 |
| `/movements/new` | 상품 찾기 → 종류 고르기 → 등록. "12개 → 32개" 미리보기 |
| `/sell` | 바코드 스캔 → 장바구니 → `record_sale` |
| `/stats` | 기간 프리셋 + `stats_*` 다섯 개 + 일별 매출 막대 |
| `/settings` | 가게 정보·내 이름·카테고리·거래처·재고 재계산 |

### 스키마의 뼈대 (이걸 모르면 화면 코드가 안 읽힌다)

1. **`stock_movements` 가 진실이고 `variants.stock_qty` 는 그 캐시다.**
   재고 = `SUM(qty_delta)` 가 정의상 성립한다. `v_stock_integrity` 가 둘의
   불일치를 보여주고 평소엔 0행이어야 한다. 어긋나면 `recalc_stock()`.
2. **원장은 append-only.** UPDATE/DELETE 를 트리거가 막는다. 정정은 지우는 게
   아니라 반대 부호 전표를 하나 더 넣는 것(`void_movement`)이다.
3. **날짜는 예외 없이 KST 로 자른다.** UTC 로 자르면 밤 9시 이후 판매가 전부
   다음 날로 밀린다. 화면에서 날짜를 만들 때도 `+09:00` 을 명시해야 한다
   (`lib/constants.ts` 의 `TIME_ZONE`·`todayInSeoul`, `movements/query.ts` 의
   `kstDayStart`·`kstDayEnd`).
4. **원가는 이동평균이고 입고 전표만 갱신한다.** 판매 전표는 그 시점 원가를
   자기 행에 스냅샷해서, 나중에 매입가가 올라도 과거 마진이 소급해 안 바뀐다.
5. **옵션 없는 상품도 변형 1개를 갖는다.** 재고 경로를 한 갈래로 유지하려는
   것이고, `create_product` 가 변형 0개를 거부하는 이유다.

### 이번에 생긴 공용 조각

화면을 새로 만들 때 다시 짜지 말고 이걸 써라.

| 파일 | 쓰임 |
|---|---|
| `lib/search.ts` | 검색어 정제(`likePattern`)와 상품명·SKU·바코드 or() 조건 |
| `lib/action-state.ts` | 서버 액션 결과 타입 + `ok()` / `fail()` |
| `components/ui/action-form.tsx` | 서버 액션 하나를 감싸는 폼. 저장 중·오류·성공 문구를 한 곳에서 처리한다. 두 번 눌러야 실행되는 `confirmLabel` 도 여기 있다 |
| `lib/constants.ts` | 한국어 라벨 매핑, `formatWon`/`formatQty`/`formatDateTime`, `todayInSeoul` |

### 화면을 그릴 때의 규칙

통계 화면을 만들며 정한 것들이다. **되돌리기 쉬운데 되돌리면 나빠지는** 것들이라
적어둔다.

- **한 계열이면 색은 하나다.** 막대 길이에 따라 색을 진하게 하지 마라. 길이가
  이미 크기를 말하는데 색까지 같은 걸 말하면 남은 표현 수단을 낭비하는 것이고,
  범주형 팔레트 검사도 통과하지 못한다.
- **`data-numeric`(= `tabular-nums`)은 세로로 줄이 맞는 곳에만.** 표 안이나 축
  눈금에는 맞고, `StatTile` 처럼 혼자 큰 숫자에는 안 맞는다 — 글자 사이가 벌어져
  성기게 보인다. `components/ui/card.tsx` 의 `StatTile` 에서 일부러 뺐고 주석도
  달아뒀다. 되돌리지 마라.
- **막대마다 숫자를 붙이지 마라.** 최고점 하나만 글로 짚고, 나머지는 "숫자로
  보기" 표로 읽게 한다. 마우스를 올려야만 알 수 있는 값이 있으면 안 된다.
- **판매가 없던 날도 축에 자리를 잡는다.** 있는 날만 이으면 쉰 구간이 붙어서
  추이가 거짓말을 한다 (`stats/period.ts` 의 `eachDay`).
- **색은 뜻이다.** `bg-red-500` 이 아니라 `bg-danger`. 상태는 색만으로 말하지 않고
  항상 글자나 아이콘이 함께 간다 (증감 화살표, 재고 배지).
- **기간·필터는 화면 맨 위 한 줄.** 카드마다 제 기간을 갖게 하면 나란히 놓인 두
  숫자가 서로 다른 기간이라 비교가 안 된다.

---

## 작업 중 찾아 고친 기존 버그 다섯 개

앞의 셋은 초기 스키마에 있던 것이고, 뒤의 둘은 브라우저로 띄워보고서야 나왔다.
**화면을 붙이지 않았으면 배포 후에야 드러났을 것들**이라, 다음에 스키마를 손댈
때도 같은 태도로 봐라 — "함수가 존재한다"와 "함수가 동작한다"는 다르다.
그리고 "빌드가 통과한다"와 "화면이 뜬다"도 다르다.

### 1. `void_movement` 이 입고·출고를 정정할 수 없었다 (0012)

부호 제약(`chk_purchase_pos`/`chk_outbound_neg`)이 정정 전표를 고려하지 않았다.
정정은 같은 type 에 부호만 뒤집은 전표라 제약에 그대로 걸린다. **제일 많이 쓰는
두 종류가 막혀 있었고**, 실사는 `adjustment` 로 갈아타서, 판매는 부호 제약이
없어서 우연히 통과하는 바람에 가려져 있었다.

`adjustment` 로 바꿔치기하지 않고 제약을 다시 썼다. `purchase_amount` 가
`qty_delta * unit_cost` 로 생성되는 컬럼이라, type 을 유지해야 정정이 매입
통계를 정확히 상쇄한다.

### 2. `stats_turnover` 는 한 번도 동작한 적이 없었다 (0013)

`full outer join ... on cid is not distinct from cid`. 의도는 맞다(미분류의
NULL 끼리 맞추려는 것). 그런데 PostgreSQL 은 FULL OUTER JOIN 을 merge/hash 로만
실행할 수 있고 `IS NOT DISTINCT FROM` 은 둘 다 아니다. **데이터와 무관하게 항상
`0A000` 으로 죽는다.** 키를 UNION 으로 모으고 LEFT JOIN 두 번으로 바꿨다.

### 3. 로그인 실패 문구가 네트워크 장애를 비밀번호 탓으로 돌렸다 (73d896e)

`signInWithPassword` 오류를 종류와 무관하게 "이메일 또는 비밀번호가 올바르지
않습니다" 로 바꾸고 있었다. 인증 서버에 닿지 못해도 화면은 비밀번호가 틀렸다고
말한다. **실제로 앱을 처음 브라우저로 띄웠을 때 이걸로 한참 헤맸다.**
4xx 만 자격 증명 문제로 보고 나머지는 연결 실패로 말하게 고쳤다.

### 4. 로그인이 통째로 막혀 있었다 — `auth.users` 의 NULL 토큰 컬럼

egress 가 열린 환경에서 처음 로그인해 보고 나왔다. 데모 계정 비밀번호가 맞는데도
`/auth/v1/token` 이 500 을 뱉었다. `get_logs(service: 'auth')` 의 실제 오류:

```
error finding user: sql: Scan error on column index 3, name "confirmation_token":
converting NULL to string is unsupported
```

GoTrue 는 `confirmation_token`·`recovery_token`·`email_change_token_new`·
`email_change` 같은 컬럼을 Go 의 **non-nullable string** 으로 스캔한다. 계정을
Auth API 가 아니라 SQL 로 직접 INSERT 하면 이 컬럼들이 NULL 로 남고, 그러면
**로그인 요청이 데이터와 무관하게 항상 500 으로 죽는다.** 데모 계정이 정확히 그
방법으로 만들어져 있었다 (`.claude/skills/run-app/SKILL.md` 3절이 그 방법을
안내하고 있었는데, 이 함정은 빠져 있었다 — 이번에 추가했다).

NULL 을 빈 문자열로 채워서 고쳤다. **계정을 지우고 다시 만들지 않았다** — 데모
데이터의 `created_by` 가 이 user id 를 참조하기 때문이다. SQL 은 run-app 스킬 3절에
있다. 새 계정을 만들 때마다 그 쿼리를 한 번 돌려라.

여기서 배울 것: 73d896e 가 넣은 "연결할 수 없습니다" 문구는 **egress 차단만
뜻하지 않는다.** 4xx 가 아닌 모든 오류가 저 문구로 나온다. 문구만 보고 네트워크를
의심하다 시간을 버리지 말고 auth 로그를 봐라.

### 5. 판매 화면에서 줄 합계가 잘려 나갔다 (모바일)

계산대 화면이라 제일 중요한데, 장바구니 줄의 오른쪽이 `w-24` 단가 칸 +
`w-24` 합계로 **고정폭 200px** 을 요구했다. 390px 아이폰에서는 그만한 자리가
없어서 다섯 자리 금액(`53,100원`)이 카드 밖으로 19px 밀려 나가 잘렸고, 페이지가
가로로 스크롤됐다.

단가 칸만 좁히는 것으로는 안 된다 — 그러면 이번엔 치는 값이 안 보인다(실제로 한 번
그렇게 고쳤다가 입력칸이 60px 이 되어 네 자리도 잘렸다). 스테퍼는 터치 크기라 못
줄인다. 결국 **자리가 모자라면 단가+합계 묶음을 통째로 아랫줄로 내리게** 했다
(`flex-wrap` + `min-w-56`). 데스크톱은 폭이 남아 안 내려간다 — 1440px 에서 확인했다.

---

## 검증 상태 — 가장 중요한 절

### 검증한 것

- **SQL 스모크 테스트.** 전부 `raise exception` 으로 끝나는 롤백 트랜잭션 안에서
  돌렸다 (패턴은 아래 "작업 방식" 참고).
  - `create_product` 10항목 — 변형 생성, 기초재고 → 입고 전표, 이동평균, 바코드,
    거부 케이스 3종
  - 입출고·정정 15항목 — 부호 제약, 실사 델타, 입고/출고 정정, 이중 정정 거부,
    매입액 상쇄, `v_movements.voided_by`
  - 판매 13항목 — 바코드 조회, 다중 라인 영수증, 음수 재고 허용, **원가 스냅샷이
    이후 입고로 소급되지 않음**
  - 통계 15항목 — KST 버킷(새벽 1시 판매가 UTC 로는 전날이 되는 케이스를 실제로
    확인), 요약·카테고리·인기상품·거래처·회전
  - 설정 13항목 — 3단 카테고리 거부, 하위 있는 카테고리 삭제 거부, 삭제 시 상품
    생존, 캐시 망가뜨린 뒤 `recalc_stock()` 복구, **원가는 안 건드림**
- `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build` 전부 통과
  (2026-07-31 에 Windows·node 24·pnpm 11 에서도 다시 통과 확인)
- 보안 어드바이저: 새 뷰에서 `security_definer_view` 경고 없음

### 브라우저 검증 (2026-07-31, 새로 함)

**프로덕션 빌드**(`next build` → `next start`)를 Playwright Chromium 으로 몰았다.
개발 서버가 아니라 실제로 나갈 물건으로 확인한 것이다.

- **여덟 경로 × 두 셸 = 16 조합 전부** 내용이 `<main>` 안에 그려지고, 콘솔 오류 0,
  가로 스크롤 없음: `/` `/stock` `/stock/new` `/movements` `/movements/new`
  `/sell` `/stats` `/settings`
- 로그인 → 각 화면 → 로그아웃까지 실제로 눌러서 확인
- **스크린샷을 눈으로 봤다.** 통계 화면의 설계 규칙(한 계열 한 색, 판매 없는 날도
  축에 자리, 최고점만 글로, 기간 선택 맨 위 한 줄)이 그대로 지켜져 있다.
- **판매 화면 스캔 흐름** — 바코드를 치고 엔터를 누르면 담기고, 입력칸으로 포커스가
  돌아오고 값이 비워진다. 같은 바코드를 또 찍으면 수량이 올라간다
  (`1 / 1,600원` → `2 / 3,200원`). HANDOFF 가 "제일 중요한 상호작용인데 확인이
  안 됐다"고 적어둔 것이다. **이제 확인됐다.**
- **모바일 합계 막대가 하단 탭에 안 가린다** — 좌표로 쟀다. 탭 윗변 794px,
  판매확정 버튼 아랫변 520px (뷰포트 851px).
- **`/stock/new` 등록 버튼도 안 가린다** — 탭 윗변 787px, 버튼 아랫변 756px.
  여유가 31px 뿐이라 이 근처를 손대면 다시 재라.

### 검증하지 못한 것 — 여기서부터는 추측이다

- **실제 바코드 스캐너 하드웨어.** 위에서 확인한 건 "코드를 치고 엔터"까지다.
  진짜 스캐너의 입력 속도(수십 ms 안에 10여 글자가 쏟아진다)와 접미 문자 설정에서
  어떤지는 기기에서 봐야 안다.
- **실제 아이폰의 홈 인디케이터 영역.** 위 좌표는 Chromium 의 390×844 컨텍스트
  기준이다. `safe-area-inset-bottom` 은 실기기에서만 값이 생긴다.
- **좁은 화면에서 옵션이 많을 때의 변형 표.** 확인한 것은 옵션 0개 상태다.
  티셔츠처럼 4개 조합을 만들어 놓고 보는 건 못 했다.
- **판매 확정(`record_sale`)을 실제로 눌러보지 않았다.** 프로덕션 DB 에 전표가
  남기 때문이다. 장바구니에 담는 데까지만 했다. RPC 자체는 SQL 스모크 13항목으로
  검증돼 있다.
- Vercel 배포.

### 브라우저로 검증할 때 반드시 알아야 할 것

**IDE 에 붙은 브라우저 패널로는 이 앱을 검증할 수 없다.** `loading.tsx` 가 있는
세 화면(`/stock`·`/movements`·`/stats`)이 로딩 스켈레톤에서 영영 멈춘 것처럼
보인다. React 는 스트리밍으로 받은 내용을 `<div id="S:0" hidden>` 에 두고 `$RC` 로
자리를 바꾸는데 그 마지막 단계를 **`requestAnimationFrame` 으로 예약**한다.
화면이 표시되지 않아 프레임을 합성하지 않는 창에서는 rAF 가 안 돌아 멈춘다.

이번에 여기서 한참 헤맸다. 증상이 앱 버그와 구별이 안 된다 — `main` 이 비어 있고,
`h1` 은 존재하는데 크기가 0×0 이고, 내용은 `main` 바깥 숨은 div 에 들어 있다.
서버는 `GET /stock 200` 으로 멀쩡하고 원본 HTML 끝에 `$RC("B:0","S:0")` 도 있다.
**Playwright 로 띄우면 정상이다.** 자세한 구분법은 run-app 스킬의 함정 모음에 있다.

---

## DB 현재 상태

프로젝트 ref: `jnacpoqvnajjjfwwotnw`

### 데모 데이터가 들어 있다 (사용자가 직접 확인하겠다고 해서 남겨둠)

- 계정 `demo@example.com` / `demo-1234!` (표시 이름 "영심")
- 상품 5개(변형 9개), 입출고 45건, 영수증 24건(최근 14일치), 재고 부족 5건
- `v_stock_integrity` 0행

**2026-07-31 에 이 계정의 `auth.users` 행을 한 번 고쳤다.** NULL 이던 토큰 컬럼
8개를 빈 문자열로 채웠다 — 안 그러면 로그인이 500 으로 죽는다(위 "고친 버그 4번").
데이터 자체는 그대로고 user id 도 그대로다. 스키마 변경이 아니라 데이터 수리라
마이그레이션 파일은 만들지 않았고, 대신 재발을 막도록 run-app 스킬의 계정 생성
절차에 그 쿼리를 넣었다.

지울 때 주의: 원장이 append-only 라 `stock_movements` 는 그냥 DELETE 가 안 된다.
`trg_movements_append_only` 를 **한 트랜잭션 안에서** 껐다 지우고 다시 켜야 한다.
Postgres 는 DDL 도 트랜잭션이라 중간에 실패하면 트리거가 켜진 채로 롤백된다 —
아래처럼 한 덩어리로 보내면 트리거가 꺼진 채 남는 일이 없다.

```sql
begin;
  alter table public.stock_movements disable trigger trg_movements_append_only;

  delete from public.stock_movements;
  delete from public.sale_orders;
  delete from public.barcodes;
  delete from public.variants;
  delete from public.products;
  delete from public.suppliers;
  -- 카테고리 4개와 app_settings 1행은 원래 시드다. 지우지 마라.

  alter table public.stock_movements enable trigger trg_movements_append_only;
commit;

-- 확인: 아래가 전부 0 이어야 하고, 트리거는 다시 살아 있어야 한다
select (select count(*) from public.stock_movements) movements,
       (select count(*) from public.products) products,
       (select tgenabled from pg_trigger
         where tgname = 'trg_movements_append_only') as trigger_enabled; -- 'O' 여야 정상
```

계정까지 지우려면 `delete from auth.users where email='demo@example.com';`
(`profiles` 는 cascade 로 같이 지워진다).

### 마이그레이션 버전 불일치 — 아직 안 고침

로컬 파일명은 `20260730000001`~`20260730000013`, 원격에 기록된 버전은
`20260730114743`~`20260730150059` 다. MCP `apply_migration` 이 자체 타임스탬프를
찍어서 그렇다. 13개 전부 해당한다.

DB 내용은 정상이고 `pnpm dev` 로 쓰는 데는 문제가 없다. **다만 로컬 CLI 에서
`supabase db push` 를 처음 돌리면 13개 전부 미적용으로 보고 재실행하려 한다.**
고치려면 원격 `supabase_migrations.schema_migrations` 의 version 을 파일명에
맞추면 되는데, 마이그레이션 이력을 손대는 일이라 사용자 확인을 받고 하기로 했다.
아직 확인 못 받았다.

---

## 열린 항목

1. ~~로그인 뒤 화면 실제 확인~~ — **2026-07-31 완료.** 위 "브라우저 검증" 절 참고.
2. **마이그레이션 버전 정렬** — 아래 참고. 사용자 확인 대기.
3. **Vercel 배포** — 사용자 확인 대기.
4. **데모 데이터 정리** — 사용자가 다 본 뒤에. SQL 은 아래에 적어뒀다.
5. **모바일 셸의 `h1` 이 가게 이름을 먹는다.** `components/shell/mobile-shell.tsx:29`
   가 가게 이름에 `<h1>` 을 쓴다. 각 화면도 제 `h1` 을 갖고 있어서 모바일에서는
   페이지마다 `h1` 이 둘이고, 화면 제목이 문서의 최상위 제목이 아니게 된다.
   데스크톱 셸은 `h1` 을 안 쓴다 — 둘이 다르다. 고치려면 모바일 셸 쪽을 `p` 나
   `span` 으로 내리면 된다 (화면이 이미 제목을 갖고 있으므로). 급하지 않다.
6. **홈 화면 숫자 타일이 한 번 0 으로 떴다 — 재현 못 함.** 아주 처음 홈을 띄웠을 때
   "재고 자산 0원 / 0개 품목" 이 나왔는데, 바로 아래 부족 목록에는 재고가 2·3·9개인
   상품이 멀쩡히 있었다. 이후 로그아웃/로그인, `.next` 지우고 콜드 컴파일까지
   포함해 여러 번 시도했지만 다시 안 나왔고, 서버에 로그를 심어 보니 쿼리는 항상
   정상 데이터를 반환했다(`variant_count: 9`). **원인을 특정 못 했다.** 고쳤다고
   적지 않는 이유다. 다음에 홈에서 0 을 보면 이 항목을 떠올려라.

### 저장소 상태

- 저장소 `hu28035036-ux/ZERO_STORE_YOUNGSIM`, 브랜치
  `claude/inventory-management-planning-fk6i1t`. 기본 브랜치는 건드리지 않았다.
- **PR 은 아직 만들지 않았다.** 사용자가 요청하지 않아서다. 만들 때는 저장소에
  PR 템플릿이 있는지 먼저 확인할 것 (지금은 없다).
- `.env.local` 은 gitignore 라 저장소에 없다. 새로 받으면 만들어야 하고, 없으면
  빌드가 그 자리에서 실패한다 (`lib/supabase/env.ts`). 값은 `README.md` 에 표로
  있다.
- **pnpm 11 로 `pnpm install` 하면 락파일이 공급망 정책에 걸린다.** 락파일이
  만들어진 지 얼마 안 된 패키지 7개가 `minimumReleaseAge` 컷오프에 걸려
  `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION` 이 난다. 락파일이 상하거나 조작된 게
  아니라, 갓 발행된 패키지를 그날 바로 잠갔기 때문이다(전부 Next.js·eslint 의
  평범한 전이 의존성이다). 시간이 지나면 저절로 통과한다.
  급하면 `pnpm install --config.minimumReleaseAge=0` 로 이번 설치만 푼다.
  **저장소나 전역 설정에 이 완화를 커밋하지 마라** — 보안 검사를 영구히 끄는 것이다.
  그리고 pnpm 11 은 `pnpm-workspace.yaml` 에 `allowBuilds:` 플레이스홀더를 멋대로
  써 넣는다. 커밋하지 말고 `git checkout -- pnpm-workspace.yaml` 로 되돌려라.
- 위 정책 때문에 `pnpm lint` / `pnpm exec tsc` 도 매번 의존성 재검사에 걸려 막힌다.
  `./node_modules/.bin/tsc --noEmit`, `./node_modules/.bin/eslint` 처럼 바이너리를
  직접 부르면 그 검사를 건너뛴다.

### 손대지 않은 것들 (의도적)

- **변형별 SKU 입력란.** `sku` 가 전역 unique 라 실수로 겹치면 등록이 통째로
  막힌다. 작은 가게의 실제 식별자는 바코드다. 컬럼은 살아 있고 검색도 SKU 를
  훑으므로 나중에 넣을 수 있다.
- **실사의 지난 날짜 등록.** `record_stocktake` 에 `occurred_at` 인자가 없다.
  폼에서도 날짜 칸을 빼고 이유를 적어뒀다. 필요하면 RPC 부터 고쳐야 한다.
- **판매 전표 정정.** 영수증 단위로 되돌려야 해서 판매 화면 몫으로 남겼다.
  지금은 입출고 화면에서 판매 전표의 정정 버튼이 안 나온다.
- **상품 수정 화면.** 등록만 있고 수정이 없다. 가격·최소재고를 고치려면 지금은
  DB 를 직접 만져야 한다. 다음에 만들 만한 것 중 가장 아쉬운 구멍이다.

---

## 작업 방식 메모

### 스모크 테스트는 롤백 트랜잭션으로

프로덕션 DB 에 직접 붙어 있으므로 흔적을 남기지 않는다. 결과를 `raise exception`
메시지에 담아 던지면 전부 롤백되면서 결과는 볼 수 있다 (NOTICE 는 MCP 로
안 돌아온다).

```sql
do $$
declare r text := '';
begin
  -- ... 실제로 RPC 를 부르고 결과를 r 에 누적 ...
  r := r || format(E'\n1) 재고=%s (기대 30)', v_after);
  raise exception 'SMOKE%', r;   -- 전부 롤백되고 메시지는 에러로 돌아온다
end $$;
```

끝나고 `select count(*)` 로 정말 비었는지 확인할 것. 카테고리 4개와
`app_settings` 1행은 원래 시드 데이터라 남아 있는 게 정상이다.

### PostgREST `or()` 에 사용자 입력을 그대로 넣지 마라

`or()` 는 쉼표로 조건을 나누고 괄호로 묶는 문법이라 상품명에 친 쉼표 하나에
필터가 통째로 깨져 400 이 난다. `lib/search.ts` 의 `likePattern()` 을 써라.

### 정렬 키를 URL 에서 그대로 받지 마라

없는 컬럼이면 400 이 난다. 화이트리스트로 받는다 (`stock/query.ts` 의 `SORTS`).

### 서버 액션은 UI 없이도 POST 로 불린다

proxy 의 검사는 최적화이지 방어선이 아니다. 모든 액션 첫 줄에서 `requireUser()`.

### Next.js 16

`AGENTS.md` 가 말하는 대로 `node_modules/next/dist/docs/` 를 읽어라. 이 작업에서
실제로 쓴 것: `searchParams`/`params` 는 Promise, `cookies()` 는 비동기,
서버 액션은 `'use server'`, 클라이언트에는 prop 으로 넘길 수 있다.
