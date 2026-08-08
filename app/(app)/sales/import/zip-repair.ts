/**
 * 스트리밍 방식으로 쓰인 zip(.xlsx)의 재조립 — 순수 함수, 의존성 0.
 *
 * 일부 발주·POS 시스템은 xlsx 를 만들 때 로컬 파일 헤더에 크기를 0 으로 두고
 * 뒤에 자료 서술자(data descriptor)를 붙이는 스트리밍 방식으로 쓴다. 크기의
 * 진실은 중앙 디렉터리에만 있다. read-excel-file 의 unzip(fflate)이 이런
 * 파일을 "Couldn't unzip" 으로 거부해서, 화면에서는 멀쩡한 주문내역서가
 * "읽지 못했습니다"가 된다 — 실제 본사 주문내역서(2026-08-08)가 그랬다.
 *
 * 여기서는 압축을 풀지 않는다. 중앙 디렉터리에서 크기·CRC·오프셋을 읽어
 * 압축된 바이트를 그대로 들어다가, 크기가 박힌 정상 로컬 헤더로 다시 싼다.
 * 압축 해제가 없으니 수십 KB 파일이면 즉시 끝난다.
 *
 * 확신이 없으면 null 을 돌려준다 — 호출부는 원래 오류를 그대로 던져서,
 * 복구 시도가 새로운 오류 원인으로 둔갑하지 않게 한다.
 */
export function repairStreamedZip(buffer: ArrayBuffer): ArrayBuffer | null {
  const src = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  const len = buffer.byteLength
  if (len < 22) return null

  // EOCD(0x06054b50)를 끝에서 찾는다. 주석이 붙을 수 있어 최대 64KB 를 훑는다.
  let eocd = -1
  for (let i = len - 22; i >= Math.max(0, len - 65558); i--) {
    if (src.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) return null

  const count = src.getUint16(eocd + 10, true)
  const cdSize = src.getUint32(eocd + 12, true)
  const cdOffset = src.getUint32(eocd + 16, true)
  // ZIP64(값이 상한에 걸린 경우)는 손대지 않는다 — xlsx 가 4GB 를 넘을 일은 없다.
  if (count === 0xffff || cdOffset === 0xffffffff || cdOffset + cdSize > len) {
    return null
  }

  type Entry = {
    name: Uint8Array
    method: number
    crc: number
    csize: number
    usize: number
    data: Uint8Array
  }
  const entries: Entry[] = []

  let p = cdOffset
  for (let i = 0; i < count; i++) {
    if (p + 46 > len || src.getUint32(p, true) !== 0x02014b50) return null
    const method = src.getUint16(p + 10, true)
    const crc = src.getUint32(p + 16, true)
    const csize = src.getUint32(p + 20, true)
    const usize = src.getUint32(p + 24, true)
    const nameLen = src.getUint16(p + 28, true)
    const extraLen = src.getUint16(p + 30, true)
    const commentLen = src.getUint16(p + 32, true)
    const localOff = src.getUint32(p + 42, true)
    if (csize === 0xffffffff || usize === 0xffffffff) return null

    // 데이터 위치는 로컬 헤더 기준이다 — 로컬의 이름·extra 길이는 중앙
    // 디렉터리와 다를 수 있어서 반드시 로컬 쪽을 읽는다.
    if (localOff + 30 > len || src.getUint32(localOff, true) !== 0x04034b50) return null
    const lNameLen = src.getUint16(localOff + 26, true)
    const lExtraLen = src.getUint16(localOff + 28, true)
    const dataStart = localOff + 30 + lNameLen + lExtraLen
    if (dataStart + csize > len) return null

    entries.push({
      name: bytes.slice(p + 46, p + 46 + nameLen),
      method,
      crc,
      csize,
      usize,
      data: bytes.slice(dataStart, dataStart + csize),
    })
    p += 46 + nameLen + extraLen + commentLen
  }

  // ---- 재조립: 로컬 헤더에 크기를 박고, 자료 서술자 플래그를 끈다 ----
  let size = 22
  for (const e of entries) size += 30 + e.name.length + e.data.length + 46 + e.name.length
  const out = new Uint8Array(size)
  const dv = new DataView(out.buffer)

  const offsets: number[] = []
  let w = 0
  for (const e of entries) {
    offsets.push(w)
    dv.setUint32(w, 0x04034b50, true)
    dv.setUint16(w + 4, 20, true) // 필요한 버전 2.0 — ZIP64 표식(45)도 여기서 걷어낸다
    dv.setUint16(w + 6, 0, true) // 플래그 0 = 자료 서술자 없음
    dv.setUint16(w + 8, e.method, true)
    // 10~13 수정 시각·날짜: 0 이어도 파서가 안 본다
    dv.setUint32(w + 14, e.crc, true)
    dv.setUint32(w + 18, e.csize, true)
    dv.setUint32(w + 22, e.usize, true)
    dv.setUint16(w + 26, e.name.length, true)
    dv.setUint16(w + 28, 0, true)
    out.set(e.name, w + 30)
    out.set(e.data, w + 30 + e.name.length)
    w += 30 + e.name.length + e.data.length
  }

  const cdStart = w
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]
    dv.setUint32(w, 0x02014b50, true)
    dv.setUint16(w + 4, 20, true)
    dv.setUint16(w + 6, 20, true)
    dv.setUint16(w + 8, 0, true)
    dv.setUint16(w + 10, e.method, true)
    dv.setUint32(w + 16, e.crc, true)
    dv.setUint32(w + 20, e.csize, true)
    dv.setUint32(w + 24, e.usize, true)
    dv.setUint16(w + 28, e.name.length, true)
    dv.setUint32(w + 42, offsets[i], true)
    out.set(e.name, w + 46)
    w += 46 + e.name.length
  }

  dv.setUint32(w, 0x06054b50, true)
  dv.setUint16(w + 8, entries.length, true)
  dv.setUint16(w + 10, entries.length, true)
  dv.setUint32(w + 12, w - cdStart, true)
  dv.setUint32(w + 16, cdStart, true)

  return out.buffer
}
