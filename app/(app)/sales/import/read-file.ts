import {
  decodeCsvBytes,
  looksLikeHtmlTable,
  parseDelimited,
  parseHtmlTable,
  type Cell,
} from './parse'
import { repairStreamedZip } from './zip-repair'

/**
 * 업로드 파일 → 시트 목록. 세 임포트 화면(판매·상품·입고)이 같이 쓴다.
 *
 * 형식 판별을 확장자가 아니라 내용으로 한다:
 * - .xlsx — read-excel-file. 실패하면 스트리밍 zip 재조립 후 한 번 더
 *   (zip-repair.ts 참고 — 실제 주문내역서가 이 경로로만 열린다).
 * - OLE 시그니처(진짜 옛 .xls)만 형식 오류로 거부한다.
 * - <table> 이 보이면 HTML 표로 읽는다 — ".xls" 로 위장한 내보내기가 흔하다.
 * - 나머지는 구분자 텍스트(CSV/TSV).
 *
 * 텍스트·HTML 파일은 시트 개념이 없으므로 이름 '' 인 시트 하나로 돌아온다.
 */
export type FileSheet = { name: string; data: Cell[][] }

export async function readTableFile(file: File): Promise<FileSheet[]> {
  if (file.name.toLowerCase().endsWith('.xlsx')) {
    // 동적 import: CSV 만 쓰는 사람은 엑셀 파서를 한 바이트도 받지 않는다.
    const { default: readXlsxFile } = await import('read-excel-file/browser')
    const buffer = await file.arrayBuffer()
    try {
      return toSheets(await readXlsxFile(buffer))
    } catch (error) {
      const repaired = repairStreamedZip(buffer)
      if (!repaired) throw error
      return toSheets(await readXlsxFile(repaired))
    }
  }

  const buffer = await file.arrayBuffer()
  const head = new Uint8Array(buffer.slice(0, 4))
  if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) {
    // OLE 컨테이너 = 진짜 옛 엑셀(BIFF). 이건 파서가 없어서 정말 못 읽는다.
    throw new Error(
      '옛 엑셀 형식(.xls)입니다. 엑셀에서 "다른 이름으로 저장" 으로 .xlsx 나 CSV 로 바꿔 주세요',
    )
  }

  const text = decodeCsvBytes(buffer)
  const data = looksLikeHtmlTable(text) ? parseHtmlTable(text) : parseDelimited(text)
  return [{ name: '', data: data as Cell[][] }]
}

function toSheets(sheets: { sheet: string; data: unknown }[]): FileSheet[] {
  return sheets
    .map((s) => ({ name: s.sheet, data: s.data as Cell[][] }))
    .filter((s) => s.data.length > 0)
}
