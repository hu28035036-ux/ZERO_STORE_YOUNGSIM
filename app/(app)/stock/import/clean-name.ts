/**
 * 발주 시트 제품명 정제 — 순수 함수. 임포트 화면과 일회성 반영 스크립트가 같이 쓴다.
 *
 * 본사 시트의 제품명에는 규격이 괄호로 붙어 온다:
 *   "마이노멀 딸기잼(제로스토어용 320g*12입 3.84Kg/BOX)"
 * 이대로 등록하면 재고 검색이 어수선해지고 모바일 카드가 두 줄로 넘친다.
 * 그래서 이름과 규격을 가른다 — 규격은 버리지 않고 설명(description)에
 * 보존한다. 발주 단위 확인에 여전히 필요한 정보다.
 *
 * 함정은 괄호가 전부 규격이 아니라는 것:
 *   "단슐랭 꼭꼬칩(핫불닭맛)-30개"            ← 괄호 안이 맛이다
 *   "클룹 애사비소다(패션후르츠제로_500ml …)" ← 맛과 규격이 섞여 있다
 * 그래서 괄호 안을 토큰으로 쪼개 규격 토큰만 걷어내고, 남는 말(맛)은 이름에
 * 돌려붙인다. 휴리스틱이 틀릴 수 있으므로 임포트 미리보기의 이름 칸은 반드시
 * 편집 가능해야 한다 — 진짜 방어선은 사람 눈이다.
 */

export type CleanedName = {
  /** 정제된 제품명 */
  name: string
  /** 걷어낸 규격. 없으면 null. description 후보다. */
  spec: string | null
}

// "320g" "3.84Kg" "500ml" "12입" "24개입" 같은 수량+단위 조각
const UNIT = String.raw`(?:g|kg|ml|l|ea|box|입|개입|개|팩|병|캔)`
const NUM_UNIT = String.raw`\d+(?:\.\d+)?\s*${UNIT}?`
// 한 토큰 전체가 규격인지: 수량+단위, 곱셈식(45g*7개입), 슬래시 꼬리(/EA, /BOX,
// /24EA)까지. 슬래시 뒤는 "24EA"처럼 수가 붙기도, "BOX"처럼 단위만 오기도 한다.
const SPEC_TOKEN = new RegExp(
  String.raw`^(?:${NUM_UNIT}|${NUM_UNIT}\s*[*xX×]\s*${NUM_UNIT})` +
    String.raw`(?:\/\s*(?:${NUM_UNIT}|${UNIT}))?$`,
  'i',
)

/** 단독으로 나오면 규격으로 보는 말들 */
const SPEC_WORDS = new Set([
  '제로스토어용',
  '묶음출고',
  '묶음출고용',
  '단품',
  'ea',
  'box',
])

function isSpecToken(token: string): boolean {
  const t = token.trim()
  if (!t) return true
  if (SPEC_WORDS.has(t.toLowerCase())) return true
  if (SPEC_TOKEN.test(t)) return true
  // "제로스토어용120g*4입" 처럼 공백 없이 붙어 온 경우 — 규격 말 접두어를
  // 떼고 나머지가 규격이면 전체를 규격으로 본다.
  for (const w of SPEC_WORDS) {
    if (t.toLowerCase().startsWith(w)) {
      const rest = t.slice(w.length)
      if (!rest || SPEC_TOKEN.test(rest)) return true
    }
  }
  return false
}

/** 여러 칸 공백을 한 칸으로, 앞뒤 공백 제거 */
function tidy(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

export function cleanProductName(raw: string): CleanedName {
  let name = tidy(raw)
  const specParts: string[] = []

  // 1) 끝의 "-30개" 같은 꼬리. 숫자+단위 꼴일 때만 떼므로
  //    "제로-콜라" 같은 이름은 건드리지 않는다.
  const tail = /[-–]\s*(\d+(?:\.\d+)?\s*(?:개입|개|입|g|kg|ml|l|ea|box))\s*$/i.exec(name)
  if (tail) {
    specParts.push(tail[1])
    name = tidy(name.slice(0, tail.index))
  }

  // 2) 이름 끝의 마지막 괄호부. 시트 셀이 잘려 닫는 괄호가 없는 경우도 있어서
  //    "(...끝까지" 도 받는다. 괄호 뒤에 다른 말이 이어지면 그 괄호는 이름의
  //    일부이므로 건드리지 않는다 (끝 고정 $).
  const paren = /\(([^()]*)\)?\s*$/.exec(name)
  if (paren) {
    // "묶음출고_제로스토어용 40g*10입" 처럼 공백 대신 _ 로도 이어붙어 온다.
    // 슬래시는 "3.84Kg/BOX" 같은 규격 안쪽에서 쓰이므로 분리 기준에 넣지 않는다.
    const tokens = paren[1].split(/[\s_]+/).filter(Boolean)
    const flavors = tokens.filter((t) => !isSpecToken(t))
    const hasSpec = flavors.length < tokens.length

    if (hasSpec || flavors.length === 0) {
      // 괄호 안에 규격이 하나라도 있으면 괄호는 규격 묶음이다.
      // 섞여 있던 맛 토큰은 이름으로 돌려붙인다.
      specParts.unshift(tidy(paren[1]))
      name = tidy(
        name.slice(0, paren.index) + (flavors.length ? ' ' + flavors.join(' ') : ''),
      )
    }
    // 괄호 안이 전부 맛(규격 없음)이면 이름을 그대로 둔다 — "(핫불닭맛)" 케이스.
    // 이때 1) 에서 뗀 꼬리는 그대로 spec 에 남는다.
  }

  return {
    name,
    spec: specParts.length ? specParts.join(' · ') : null,
  }
}
