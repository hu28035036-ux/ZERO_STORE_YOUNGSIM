'use server'

import type { PostgrestError } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { fail, ok, type ActionState } from '@/lib/action-state'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

function text(v: FormDataEntryValue | null): string {
  return typeof v === 'string' ? v.trim() : ''
}

function toInt(v: FormDataEntryValue | null): number {
  const n = Number(String(v ?? '').replace(/[^\d]/g, ''))
  return Number.isFinite(n) ? n : 0
}

/** 제약 위반은 영어 원문이 그대로 나온다. 트리거가 던지는 한국어는 그대로 쓴다. */
function humanize(error: PostgrestError, ctx: 'category' | 'supplier' | ''): string {
  if (error.code === '23505') {
    if (ctx === 'category') return '같은 이름의 카테고리가 이미 있습니다'
    if (ctx === 'supplier') return '같은 이름의 거래처가 이미 있습니다'
    return '이미 등록된 값입니다'
  }
  if (error.code === '23503') {
    // categories.parent_id 가 on delete restrict 다.
    return '하위 카테고리가 있어 지울 수 없습니다. 아래 것부터 지우세요.'
  }
  return error.message
}

// ---------------------------------------------------------------------------
// 가게 정보
// ---------------------------------------------------------------------------

export async function updateStore(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser()

  const parsed = z
    .object({
      storeName: z.string().trim().min(1, { error: '가게 이름을 입력하세요' }).max(60),
      defaultLowStock: z.number().int().min(0).max(100_000),
    })
    .safeParse({
      storeName: text(formData.get('storeName')),
      defaultLowStock: toInt(formData.get('defaultLowStock')),
    })

  if (!parsed.success) return fail(parsed.error.issues[0].message)

  const supabase = await createClient()
  const { error } = await supabase
    .from('app_settings')
    .update({
      store_name: parsed.data.storeName,
      default_low_stock: parsed.data.defaultLowStock,
    })
    // 행이 하나뿐인 테이블이지만 update 에 where 를 안 걸면 PostgREST 가 거부한다.
    .eq('id', true)

  if (error) return fail(humanize(error, ''))

  // 가게 이름은 셸 상단에 박혀 있다. 레이아웃까지 무효화해야 다시 그려진다.
  revalidatePath('/', 'layout')
  return ok('저장했습니다')
}

// ---------------------------------------------------------------------------
// 내 표시 이름 — 입출고 내역의 "처리" 칸에 나온다
// ---------------------------------------------------------------------------

export async function updateProfile(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()

  const name = text(formData.get('displayName')).slice(0, 40)

  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update({ display_name: name || null })
    .eq('id', user.id)

  if (error) return fail(humanize(error, ''))

  revalidatePath('/', 'layout')
  revalidatePath('/movements')
  return ok('저장했습니다')
}

// ---------------------------------------------------------------------------
// 카테고리
// ---------------------------------------------------------------------------

export async function createCategory(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser()

  const name = text(formData.get('name'))
  if (!name) return fail('카테고리 이름을 입력하세요')
  if (name.length > 30) return fail('이름이 너무 깁니다')

  const parentId = text(formData.get('parentId')) || null

  const supabase = await createClient()
  const { error } = await supabase
    .from('categories')
    .insert({ name, parent_id: parentId })

  if (error) return fail(humanize(error, 'category'))

  revalidatePath('/settings')
  revalidatePath('/stock')
  return ok(`“${name}” 을(를) 추가했습니다`)
}

export async function renameCategory(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser()

  const id = text(formData.get('id'))
  const name = text(formData.get('name'))
  if (!id) return fail('카테고리를 찾을 수 없습니다')
  if (!name) return fail('카테고리 이름을 입력하세요')

  const supabase = await createClient()
  const { error } = await supabase.from('categories').update({ name }).eq('id', id)

  if (error) return fail(humanize(error, 'category'))

  revalidatePath('/settings')
  revalidatePath('/stock')
  return ok('바꿨습니다')
}

export async function deleteCategory(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser()

  const id = text(formData.get('id'))
  if (!id) return fail('카테고리를 찾을 수 없습니다')

  const supabase = await createClient()
  const { error } = await supabase.from('categories').delete().eq('id', id)

  if (error) return fail(humanize(error, 'category'))

  revalidatePath('/settings')
  revalidatePath('/stock')
  // products.category_id 가 on delete set null 이라 상품은 남고 분류만 풀린다.
  return ok('지웠습니다. 그 카테고리였던 상품은 미분류가 됩니다.')
}

// ---------------------------------------------------------------------------
// 거래처
// ---------------------------------------------------------------------------

export async function createSupplier(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser()

  const name = text(formData.get('name'))
  if (!name) return fail('거래처 이름을 입력하세요')
  if (name.length > 60) return fail('이름이 너무 깁니다')

  const supabase = await createClient()
  const { error } = await supabase.from('suppliers').insert({
    name,
    phone: text(formData.get('phone')).slice(0, 30) || null,
    memo: text(formData.get('memo')).slice(0, 200) || null,
  })

  if (error) return fail(humanize(error, 'supplier'))

  revalidatePath('/settings')
  revalidatePath('/movements')
  return ok(`“${name}” 을(를) 추가했습니다`)
}

/**
 * 거래처는 지우지 않고 쓰지 않음으로 돌린다.
 *
 * stock_movements.supplier_id 가 on delete set null 이라, 지우면 과거 입고가
 * 어디서 왔는지가 장부에서 사라진다. 원장은 지우지 않는다는 이 앱의 원칙과
 * 같은 이유다.
 */
export async function toggleSupplier(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser()

  const id = text(formData.get('id'))
  if (!id) return fail('거래처를 찾을 수 없습니다')
  const next = text(formData.get('next')) === 'true'

  const supabase = await createClient()
  const { error } = await supabase
    .from('suppliers')
    .update({ is_active: next })
    .eq('id', id)

  if (error) return fail(humanize(error, 'supplier'))

  revalidatePath('/settings')
  revalidatePath('/movements')
  return ok(next ? '다시 쓰도록 했습니다' : '쓰지 않음으로 바꿨습니다')
}

// ---------------------------------------------------------------------------
// 재고 재계산
// ---------------------------------------------------------------------------

export async function recalcStock(_prev: ActionState): Promise<ActionState> {
  await requireUser()

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('recalc_stock')

  if (error) return fail(humanize(error, ''))

  revalidatePath('/settings')
  revalidatePath('/stock')

  const fixed = Number(data ?? 0)
  return ok(
    fixed === 0
      ? '어긋난 곳이 없었습니다. 재고 수량이 원장과 맞습니다.'
      : `${fixed}개 품목의 재고 수량을 원장에 맞춰 고쳤습니다.`,
  )
}
