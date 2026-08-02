/**
 * 박스 매입가를 낱개 원가로 나눈다.
 *
 * 사용자 결정: **개수대로 나눈다.** 곤약젤리 버라이어티팩처럼 맛만 다르고 값은
 * 같은 박스라 이게 맞다. 구성품마다 값이 다른 박스는 지금 없고, 생기면 그때
 * 줄별 원가 입력을 붙인다.
 *
 * 화면과 DB 가 같은 값을 보여야 해서 순수 함수로 뺐다. receive_kit 도 SQL 에서
 * 같은 식(round(총액 / 총수량, 2))을 쓴다 — 미리보기에 1,000원이라고 써놓고
 * 전표에 999.99 가 들어가면 사람이 앱을 못 믿게 된다.
 */
export function unitCostFromBox(
  /** 박스 하나의 매입가(VAT 포함). 모르면 null */
  boxCost: number | null,
  /** 몇 박스 들어왔나 */
  boxes: number,
  /** 실제로 들어온 낱개 총수량 */
  totalQty: number,
): number | null {
  if (boxCost == null || !Number.isFinite(boxCost) || boxCost < 0) return null
  if (!Number.isFinite(boxes) || boxes < 1) return null
  // 0 으로 나누면 Infinity 가 조용히 흘러간다. 원가 자리에 들어가면
  // 재고 자산이 통째로 망가진다.
  if (!Number.isFinite(totalQty) || totalQty <= 0) return null
  return Math.round(((boxCost * boxes) / totalQty) * 100) / 100
}
