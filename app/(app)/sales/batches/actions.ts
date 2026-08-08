'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { fail, ok, type ActionState } from '@/lib/action-state'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

/**
 * 판매 되돌리기 — 임포트 배치 단위와 영수증 단위.
 *
 * 원장은 지우지 않는다. RPC 가 반대 부호 전표를 원본 날짜에 넣어 재고와
 * 일별 매출을 그 판매가 없던 모습으로 되돌린다. 개별 판매 전표를
 * void_movement 로 뒤집으면 영수증 합계가 안 맞게 남는다 — 판매 취소는
 * 반드시 이 두 액션(= void_sale_order / void_import_batch)으로 한다.
 */

function refresh() {
  revalidatePath('/')
  revalidatePath('/stock')
  revalidatePath('/movements')
  revalidatePath('/stats')
  // 'layout' 이라 /sales 아래 전부(배치·영수증 상세 포함)가 같이 갱신된다.
  // 영수증 상세에서 되돌렸을 때 그 화면이 "되돌림"으로 바로 바뀌어야 한다.
  revalidatePath('/sales', 'layout')
}

export async function voidBatch(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser()

  const parsed = z.uuid().safeParse(formData.get('batchId'))
  if (!parsed.success) return fail('배치를 찾을 수 없습니다')

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('void_import_batch', {
    p_batch_id: parsed.data,
    p_reason: '임포트 배치 되돌림',
  })

  if (error) return fail(error.message)
  refresh()
  return ok(`전표 ${data}장을 되돌렸습니다. 재고와 매출이 원래대로 돌아왔습니다`)
}

export async function voidOrder(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser()

  const parsed = z.uuid().safeParse(formData.get('orderId'))
  if (!parsed.success) return fail('영수증을 찾을 수 없습니다')

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('void_sale_order', {
    p_order_id: parsed.data,
    p_reason: '영수증 되돌림',
  })

  if (error) return fail(error.message)
  refresh()
  return ok(`전표 ${data}장을 되돌렸습니다`)
}
