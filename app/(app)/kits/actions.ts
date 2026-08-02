'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { requireUser } from '@/lib/auth'
import { fail, ok, type ActionState } from '@/lib/action-state'
import { createClient } from '@/lib/supabase/server'

/**
 * 박스 묶음 두 갈래: 구성 저장(saveKit)과 입고(receiveKit).
 *
 * 이 앱의 기존 "박스"(variants.units_per_pack)는 같은 물건 N개다. 여기는 한
 * 박스에 다른 맛이 여러 종류 든 경우이고, 팔리는 것은 맛별 낱개라 재고도
 * 맛별로 세야 한다. 발주·입고만 박스 하나로 온다.
 *
 * 화면이 보낸 수량을 그대로 믿는다 — 구성이 늘 같지는 않다. 기본값은 화면을
 * 채우는 데만 쓰고, 실제로 다르게 온 날 사람이 고친 값이 이긴다.
 */

const itemSchema = z.object({
  variantId: z.uuid(),
  qty: z.number().int().min(1).max(10_000),
})

const kitSchema = z.object({
  kitId: z.uuid().nullable(),
  name: z.string().trim().min(1, { error: '박스 이름을 입력하세요' }).max(120),
  note: z.string().trim().max(200).nullable(),
  items: z
    .array(itemSchema)
    .min(2, { error: '박스에는 두 종류 이상을 담아야 합니다' })
    .max(100, { error: '한 박스에 100종류까지만 담을 수 있습니다' }),
})

export async function saveKit(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser()

  const parsed = kitSchema.safeParse(safeJson(formData.get('payload')))
  if (!parsed.success) return fail(parsed.error.issues[0].message)
  const { kitId, name, note, items } = parsed.data

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('upsert_kit', {
    // null 을 그대로 보낸다 — 이 인자는 SQL 기본값이 없어서 생략하면 죽는다.
    // 새로 만들 때 null 이라는 뜻이 인자 자체에 있다.
    p_kit_id: kitId,
    p_name: name,
    p_note: note ?? undefined,
    p_items: items.map((i) => ({ variant_id: i.variantId, default_qty: i.qty })),
  })
  if (error) return fail(error.message)

  revalidatePath('/kits')
  redirect(`/kits?saved=${encodeURIComponent(String(data ?? ''))}`)
}

const receiveSchema = z.object({
  kitId: z.uuid(),
  boxes: z.number().int().min(1).max(999),
  // 0 을 허용한다 — "이 맛은 이번에 안 왔다" 가 정상이고, RPC 가 0 인 줄은
  // 전표를 만들지 않는다. 여기서 막으면 사람이 줄을 지워야 하는데 그러면
  // 다음에 그 맛이 왔을 때 다시 찾아 넣어야 한다.
  lines: z
    .array(z.object({ variantId: z.uuid(), qty: z.number().int().min(0).max(100_000) }))
    .min(1)
    .max(100),
  boxCost: z.number().int().min(0).max(100_000_000).nullable(),
  supplierId: z.uuid().nullable(),
  note: z.string().trim().max(200).nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: '날짜 형식이 잘못됐습니다' }),
})

export async function receiveKit(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser()

  const parsed = receiveSchema.safeParse(safeJson(formData.get('payload')))
  if (!parsed.success) return fail(parsed.error.issues[0].message)
  const { kitId, boxes, lines, boxCost, supplierId, note, date } = parsed.data

  if (lines.every((l) => l.qty === 0)) {
    return fail('들어온 개수가 모두 0 입니다. 하나 이상 채워 주세요')
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('receive_kit', {
    p_kit_id: kitId,
    p_lines: lines.map((l) => ({ variant_id: l.variantId, qty: l.qty })),
    p_boxes: boxes,
    p_box_cost: boxCost ?? undefined,
    p_supplier_id: supplierId ?? undefined,
    p_note: note ?? undefined,
    // 정오로 박는 규칙은 입출고·판매 임포트와 같다. 자정은 오프셋 실수 한 번에
    // 날짜가 하루 밀리지만 정오는 ±12시간 여유가 있다.
    p_occurred_at: `${date}T12:00:00+09:00`,
  })
  if (error) return fail(error.message)

  // 박스 입고는 재고·원장·홈·통계를 전부 움직인다.
  revalidatePath('/')
  revalidatePath('/stock')
  revalidatePath('/movements')
  revalidatePath('/stats')

  const rows = data ?? []
  const total = rows.reduce((s, r) => s + (r.qty ?? 0), 0)
  return ok(`${rows.length}종 ${total}개를 입고했습니다`)
}

/** 박스를 목록에서 감춘다. 지우지 않는 이유는 전표 메모에 이름이 남아서다. */
export async function archiveKit(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser()
  const id = String(formData.get('kitId') ?? '')
  if (!z.uuid().safeParse(id).success) return fail('박스를 찾을 수 없습니다')

  const supabase = await createClient()
  const { error } = await supabase.from('kits').update({ is_active: false }).eq('id', id)
  if (error) return fail(error.message)

  revalidatePath('/kits')
  return ok('목록에서 감췄습니다')
}

function safeJson(raw: FormDataEntryValue | null): unknown {
  try {
    return JSON.parse(String(raw ?? ''))
  } catch {
    return null
  }
}
