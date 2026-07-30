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

/** 상품명 · SKU · 바코드를 한 번에 훑는 or() 조건. 재고 · 입출고 · 판매가 같이 쓴다. */
export function nameSkuBarcodeFilter(pattern: string): string {
  return `product_name.ilike.${pattern},sku.ilike.${pattern},barcode.ilike.${pattern}`
}
