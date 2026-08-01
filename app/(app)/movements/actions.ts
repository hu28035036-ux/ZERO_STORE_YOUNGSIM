'use server'

import type { PostgrestError } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { requireUser } from '@/lib/auth'
import { todayInSeoul } from '@/lib/constants'
import { createClient } from '@/lib/supabase/server'

export type MovementState = { error: string } | null

const ENTRY_TYPE = z.enum(['purchase', 'outbound', 'adjustment', 'stocktake'])

const schema = z.object({
  variantId: z.uuid({ error: '상품을 다시 선택하세요' }),
  type: ENTRY_TYPE,
  // 부호는 종류에서 나온다. 화면에서는 언제나 양수를 받는다.
  qty: z.number().int().min(0).max(1_000_000),
  direction: z.enum(['in', 'out']),
  unitCost: z.number().int().min(0).max(1_000_000_000),
  // 입고·출고 박스 모드. bundle 이면 qty·unitCost 대신 이쪽을 쓴다.
  entryMode: z.enum(['each', 'bundle']),
  bundleCount: z.number().int().min(0).max(10_000),
  bundlePrice: z.number().int().min(0).max(1_000_000_000),
  // 상품에 입수가 없을 때 폼이 그 자리에서 받아 보내는 값. 0 은 "안 보냄".
  bundleUnits: z.number().int().min(0).max(100_000),
  supplierId: z.uuid().nullable(),
  note: z.string().trim().max(200).nullable(),
  date: z.string().nullable(),
})

function toInt(value: FormDataEntryValue | null): number {
  const n = Number(String(value ?? '').replace(/[^\d]/g, ''))
  return Number.isFinite(n) ? n : 0
}

function text(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value.trim() : ''
}

function humanize(error: PostgrestError): string {
  // 원장 트리거와 RPC 는 한국어로 던진다. 제약 위반만 갈아끼우면 된다.
  if (error.code === '23514') {
    if (error.message.includes('chk_purchase_pos')) return '입고 수량은 1개 이상이어야 합니다'
    if (error.message.includes('chk_outbound_neg')) return '출고 수량은 1개 이상이어야 합니다'
    if (error.message.includes('chk_qty_nonzero')) return '수량을 입력하세요'
    return '입력한 값이 원장 규칙에 맞지 않습니다'
  }
  return error.message
}

export async function recordMovement(
  _prev: MovementState,
  formData: FormData,
): Promise<MovementState> {
  await requireUser()

  const parsed = schema.safeParse({
    variantId: text(formData.get('variantId')),
    type: text(formData.get('type')),
    qty: toInt(formData.get('qty')),
    direction: text(formData.get('direction')) === 'in' ? 'in' : 'out',
    unitCost: toInt(formData.get('unitCost')),
    entryMode: text(formData.get('entryMode')) === 'bundle' ? 'bundle' : 'each',
    bundleCount: toInt(formData.get('bundleCount')),
    bundlePrice: toInt(formData.get('bundlePrice')),
    bundleUnits: toInt(formData.get('bundleUnits')),
    supplierId: text(formData.get('supplierId')) || null,
    note: text(formData.get('note')) || null,
    date: text(formData.get('date')) || null,
  })

  if (!parsed.success) return { error: parsed.error.issues[0].message }
  const { variantId, type, direction, supplierId, date } = parsed.data
  let { qty, unitCost, note } = parsed.data

  const supabase = await createClient()

  // 박스 모드 환산은 서버가 한다. 클라이언트가 낱개 수를 실어 보내는 설계는
  // 위조 한 번에 재고가 틀어진다 — 서버 액션은 UI 없이도 POST 로 불린다.
  const bundleMode =
    (type === 'purchase' || type === 'outbound') && parsed.data.entryMode === 'bundle'
  if (bundleMode) {
    const { data: v, error } = await supabase
      .from('v_variant_stock')
      .select('units_per_pack, purchase_unit_name, unit')
      .eq('variant_id', variantId)
      .maybeSingle()
    if (error) return { error: error.message }

    // 시트가 입수=1 을 "낱개 발주"라는 뜻으로 쓰던 값이라 1 은 박스가 아니다.
    let perPack = v?.units_per_pack ?? 0
    if (perPack < 2) {
      // 상품에 입수가 없으면 폼이 그 자리에서 받은 값을 쓴다. 이 값도 환산의
      // 근거로만 쓰는 게 아니라 상품에 저장한다 — 안 그러면 매번 다시 물어야
      // 하고, 수정 화면의 낱개 환산 도우미도 계속 입수를 모른 채로 남는다.
      if (parsed.data.bundleUnits < 2) {
        return { error: `1${v?.purchase_unit_name || '박스'}당 낱개 수를 넣으세요 (2 이상)` }
      }
      perPack = parsed.data.bundleUnits

      // RPC 를 거치지 않고 variants 를 직접 만지는 이유: 입수 하나 저장하자고
      // update_product(이름·분류까지 다 받는)를 부를 수는 없다. 분류 인라인
      // 생성(stock/actions.ts)과 같은 선례고, RLS 는 로그인 사용자의 변형
      // 수정을 이미 허용한다. 전표 등록이 뒤에서 실패해도 입수는 남는데,
      // 사용자가 방금 친 사실이라 남아도 해가 없다.
      const { error: saveError } = await supabase
        .from('variants')
        .update({ units_per_pack: perPack })
        .eq('id', variantId)
      if (saveError) return { error: saveError.message }
    }

    if (parsed.data.bundleCount < 1) {
      return { error: `${v?.purchase_unit_name || '박스'} 수는 1 이상이어야 합니다` }
    }

    qty = parsed.data.bundleCount * perPack
    if (qty > 1_000_000) return { error: '수량이 너무 큽니다' }

    // 박스가 ÷ 입수는 원 아래 소수가 남는다. 저장 컬럼(numeric 12,2)에 맞춰
    // 2자리로 굳힌다 — 나눠떨어지지 않으면 매입액이 실지불액과 원 미만으로
    // 어긋나는데, 재고 파악이라는 목적에서 허용하고 폼 미리보기로 보여준다.
    // 출고는 단가를 받지 않는다 — 원장 트리거가 그 시점 원가를 스냅샷한다.
    unitCost =
      type === 'purchase' && parsed.data.bundlePrice > 0
        ? Math.round((parsed.data.bundlePrice / perPack) * 100) / 100
        : 0

    // 몇 박스가 들어왔는지는 전표에 남아야 나중에 읽힌다. 사용자 메모는 뒤에
    // 잇고, 합쳐서 200자(zod 상한)에 맞춰 자른다.
    const prefix = `[${parsed.data.bundleCount}${v?.purchase_unit_name || '박스'} × ${perPack}${v?.unit || '개'}]`
    note = `${prefix}${note ? ` ${note}` : ''}`.slice(0, 200)
  }

  // 실사만 0 이 뜻을 갖는다 ("세어보니 없더라"). 나머지는 0 이면 넣을 게 없다.
  if (type !== 'stocktake' && qty < 1) {
    return { error: '수량은 1개 이상이어야 합니다' }
  }

  const today = todayInSeoul()
  if (date && date > today) {
    // 아직 일어나지 않은 일을 원장에 넣으면 통계가 미래로 샌다.
    return { error: '앞날짜로는 등록할 수 없습니다' }
  }

  if (type === 'stocktake') {
    // record_stocktake 에는 occurred_at 인자가 없다. 실사는 언제나 "지금 센 것"이라
    // 화면에서도 날짜를 받지 않는다.
    const { error } = await supabase.rpc('record_stocktake', {
      p_variant_id: variantId,
      p_counted_qty: qty,
      p_note: note ?? undefined,
    })
    if (error) return { error: humanize(error) }
  } else {
    // 오늘이면 now() 그대로 두어 시각까지 남긴다. 지난 날짜면 그 날 정오로
    // 박는다 — KST 오프셋을 명시해야 날짜 버킷이 하루 밀리지 않는다.
    const occurredAt = date && date !== today ? `${date}T12:00:00+09:00` : undefined

    const signed =
      type === 'purchase' ? qty : type === 'outbound' ? -qty : direction === 'in' ? qty : -qty

    const { error } = await supabase.rpc('record_stock_movement', {
      p_variant_id: variantId,
      p_type: type,
      p_qty: signed,
      // 입고가 아니면 단가를 넘기지 않는다. 트리거가 그 시점 이동평균 원가를
      // 스냅샷하도록 두어야 과거 마진이 소급해 바뀌지 않는다.
      p_unit_cost: type === 'purchase' && unitCost > 0 ? unitCost : undefined,
      p_supplier_id: type === 'purchase' ? (supplierId ?? undefined) : undefined,
      p_note: note ?? undefined,
      p_occurred_at: occurredAt,
    })
    if (error) return { error: humanize(error) }
  }

  revalidatePath('/movements')
  revalidatePath('/stock')
  redirect('/movements')
}

export async function voidMovement(
  _prev: MovementState,
  formData: FormData,
): Promise<MovementState> {
  await requireUser()

  const id = Number(text(formData.get('id')))
  if (!Number.isSafeInteger(id) || id <= 0) {
    return { error: '전표를 찾을 수 없습니다' }
  }

  const reason = text(formData.get('reason')).slice(0, 200) || null

  const supabase = await createClient()
  const { error } = await supabase.rpc('void_movement', {
    p_id: id,
    p_reason: reason ?? undefined,
  })

  if (error) return { error: humanize(error) }

  revalidatePath('/movements')
  revalidatePath('/stock')
  return null
}
