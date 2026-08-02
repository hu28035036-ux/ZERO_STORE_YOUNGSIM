/**
 * PostgREST `or()` 에 넣을 LIKE 패턴.
 *
 * or() 는 쉼표로 조건을 나누고 괄호로 묶는 문법이라, 사용자가 상품명에 친
 * 쉼표 하나에 필터가 통째로 깨져 400 이 난다. LIKE 와일드카드(`%` `_`)도
 * 빼둔다 — 검색창에 `%` 만 쳤을 때 전체가 걸리면 검색이 고장난 것처럼 보인다.
 *
 * 마침표는 남긴다. 값 부분의 점은 PostgREST 가 구분자로 보지 않고,
 * "1.5L" 같은 상품명이 실제로 흔하다.
 *
 * 빈 문자열을 돌려주면 호출부는 검색 조건을 붙이지 않는다.
 */
export function likePattern(raw: string): string {
  const cleaned = raw.replace(/[,()%_\\*]/g, ' ').trim()
  return cleaned ? `%${cleaned}%` : ''
}

/**
 * 상품명 · POS 메뉴명 · SKU · 바코드를 한 번에 훑는 or() 조건.
 * 재고 · 입출고 · 판매 적기 · 판매 임포트가 같이 쓴다.
 *
 * pos_name 이 여기 있는 것이 요점이다. 본사 발주명과 매장 POS 메뉴명이
 * 실질적으로 다른 상품이 22% 나 되고(브랜드가 바뀐 것도 있다 — 킬로리
 * 얌얌쉐이크 ↔ 데일리얌), 매장 사람이 아는 이름은 POS 쪽이다. 이 줄이 없으면
 * pos_name 은 저장만 되고 검색으로는 영영 안 걸린다.
 *
 * 네 곳 모두 v_variant_stock 을 조회한다는 것이 전제다. 다른 뷰(v_movements
 * 등)에 이 조건을 쓰면 없는 열이라 400 이 난다.
 */
export function productSearchFilter(pattern: string): string {
  return (
    `product_name.ilike.${pattern},pos_name.ilike.${pattern},` +
    `sku.ilike.${pattern},barcode.ilike.${pattern}`
  )
}
