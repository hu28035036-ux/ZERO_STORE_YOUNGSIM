export type CategoryOption = { id: string; label: string }

type CategoryRow = { id: string; name: string; parent_id: string | null }

/**
 * 2단 계층을 "대분류 > 소분류" 한 줄로 편다.
 *
 * optgroup 을 쓰면 대분류 자체를 고를 수 없어서 소분류가 없는 카테고리가
 * 선택지에서 사라진다. 상품 등록과 수정이 같은 목록을 봐야 하므로 여기 한 번만 둔다.
 */
export function toCategoryOptions(rows: CategoryRow[]): CategoryOption[] {
  const nameById = new Map(rows.map((c) => [c.id, c.name]))

  return rows
    .map((c) => ({
      id: c.id,
      label: c.parent_id ? `${nameById.get(c.parent_id) ?? '?'} > ${c.name}` : c.name,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'ko'))
}
