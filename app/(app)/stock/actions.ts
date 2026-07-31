'use server'

import type { PostgrestError } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import { fail, ok, type ActionState } from '@/lib/action-state'
import { requireUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

const axisSchema = z.object({
  name: z.string().trim().min(1).max(20),
  values: z.array(z.string().trim().min(1).max(30)).min(1).max(50),
})

const variantSchema = z.object({
  options: z.record(z.string(), z.string()),
  sale_price: z.number().int().min(0).max(1_000_000_000),
  initial_unit_cost: z.number().int().min(0).max(1_000_000_000),
  initial_qty: z.number().int().min(0).max(1_000_000),
  // 0 은 "미입력"이다. DB 는 units_per_pack > 0 만 받으므로 보낼 때 null 로 바꾼다.
  units_per_pack: z.number().int().min(0).max(100_000),
  low_stock_threshold: z.number().int().min(0).max(1_000_000),
  // 4자 하한은 DB 의 check 제약과 같은 값이다. 여기서 먼저 걸러야
  // 사용자가 제약 위반 원문을 보는 일이 없다.
  barcode: z
    .string()
    .trim()
    .min(4, { error: '바코드는 4자 이상이어야 합니다' })
    .max(64)
    .nullable(),
})

const payloadSchema = z.object({
  name: z.string().trim().min(1, { error: '상품명을 입력하세요' }).max(120),
  categoryId: z.uuid().nullable(),
  channel: z.string().trim().max(30).nullable(),
  description: z.string().trim().max(500).nullable(),
  // 축이 3개를 넘으면 조합이 폭발하고 휴대폰에서 표가 무너진다.
  optionSchema: z.array(axisSchema).max(3),
  variants: z
    .array(variantSchema)
    .min(1, { error: '재고 단위가 최소 한 개는 있어야 합니다' })
    .max(200),
})

export type CreateProductState = { error: string } | null

/**
 * Postgres 오류를 사람이 읽을 문장으로.
 *
 * RPC 와 트리거가 던지는 예외(P0001)는 이미 한국어라 그대로 쓴다.
 * 제약 위반은 영어 원문이 그대로 나오므로 여기서 갈아끼운다.
 */
function humanize(error: PostgrestError): string {
  if (error.code === '23505') {
    if (error.message.includes('barcodes_pkey')) {
      return '이미 등록된 바코드입니다. 다른 상품이 쓰고 있는지 확인하세요.'
    }
    if (error.message.includes('uq_variants_product_options')) {
      return '옵션 조합이 중복됩니다.'
    }
    if (error.message.includes('variants_sku_key')) {
      return '이미 등록된 SKU 입니다.'
    }
    return '이미 등록된 값이 있습니다.'
  }
  return error.message
}

export async function createProduct(
  _prev: CreateProductState,
  formData: FormData,
): Promise<CreateProductState> {
  // 서버 액션은 UI 를 거치지 않고 POST 로 직접 부를 수 있다. proxy 검사에
  // 기대지 않고 여기서 다시 확인한다.
  await requireUser()

  const raw = formData.get('payload')
  if (typeof raw !== 'string') return { error: '폼 데이터를 읽지 못했습니다' }

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return { error: '폼 데이터를 읽지 못했습니다' }
  }

  const parsed = payloadSchema.safeParse(json)
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }
  const { name, categoryId, channel, description, optionSchema, variants } = parsed.data

  // 선언한 축과 변형의 옵션 키가 정확히 일치해야 한다.
  // DB 트리거는 "선언 안 된 키"만 막는다. 축이 빠진 변형은 통과하는데,
  // 그러면 라벨이 반쪽만 나오고 조합이 서로 겹칠 수 있다.
  const axisNames = optionSchema.map((a) => a.name)
  if (new Set(axisNames).size !== axisNames.length) {
    return { error: '옵션 이름이 중복됩니다' }
  }
  for (const v of variants) {
    const keys = Object.keys(v.options)
    if (keys.length !== axisNames.length || !axisNames.every((n) => n in v.options)) {
      return { error: '옵션 조합이 상품의 옵션 정의와 맞지 않습니다' }
    }
  }

  // 폼 안에서 바코드가 겹치는 경우. DB 도 막지만 어느 줄인지 알려주려면
  // 여기서 먼저 봐야 한다.
  const codes = variants.map((v) => v.barcode).filter((c): c is string => Boolean(c))
  const dupe = codes.find((c, i) => codes.indexOf(c) !== i)
  if (dupe) {
    return { error: `바코드 ${dupe} 가 여러 줄에 중복으로 들어갔습니다` }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('create_product', {
    p_name: name,
    p_category_id: categoryId ?? undefined,
    p_channel: channel ?? undefined,
    p_description: description ?? undefined,
    p_option_schema: optionSchema,
    p_variants: variants.map((v) => ({
      ...v,
      units_per_pack: v.units_per_pack > 0 ? v.units_per_pack : null,
    })),
  })

  if (error) return { error: humanize(error) }

  revalidatePath('/stock')

  // 방금 넣은 상품이 목록 어디에 있는지 찾게 하지 않는다. 이름으로 걸러진
  // 화면으로 보낸다. redirect() 는 예외를 던지므로 try 안에 두면 안 된다.
  redirect(`/stock?q=${encodeURIComponent(name)}`)
}

// ---------------------------------------------------------------------------
// 분류 인라인 생성
//
// 설정 화면의 createCategory 는 폼 액션(ActionState)이라 만들어진 id 를
// 돌려주지 못한다. 상품 등록 도중 "새 분류"를 만들면 그 자리에서 바로
// 선택돼야 하므로 id 를 돌려주는 전용 액션을 둔다.
// ---------------------------------------------------------------------------

export async function createCategoryInline(
  rawName: string,
): Promise<{ id: string } | { error: string }> {
  await requireUser()

  const name = rawName.trim()
  if (!name) return { error: '분류 이름을 입력하세요' }
  if (name.length > 30) return { error: '이름이 너무 깁니다' }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('categories')
    .insert({ name, parent_id: null })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      // 이미 있는 이름이면 만들 필요 없이 그 분류를 골라 준다.
      const { data: existing } = await supabase
        .from('categories')
        .select('id')
        .eq('name', name)
        .is('parent_id', null)
        .maybeSingle()
      if (existing) return { id: existing.id }
      return { error: '같은 이름의 분류가 이미 있습니다 (소분류로)' }
    }
    return { error: error.message }
  }

  revalidatePath('/stock')
  revalidatePath('/settings')
  return { id: data.id }
}

// ---------------------------------------------------------------------------
// 수정
// ---------------------------------------------------------------------------

const editVariantSchema = z.object({
  variantId: z.uuid(),
  salePrice: z.number().int().min(0).max(1_000_000_000),
  lowStockThreshold: z.number().int().min(0).max(1_000_000),
  // 0 은 "미입력"이다. DB 는 units_per_pack > 0 만 받으므로 보낼 때 null 로 바꾼다.
  unitsPerPack: z.number().int().min(0).max(100_000),
  // 4자 하한은 DB 의 check 제약과 같은 값이다. 여기서 먼저 걸러야 사용자가
  // 제약 위반 원문을 보는 일이 없다.
  barcode: z
    .string()
    .trim()
    .min(4, { error: '바코드는 4자 이상이어야 합니다' })
    .max(64)
    .nullable(),
})

const editPayloadSchema = z.object({
  productId: z.uuid(),
  name: z.string().trim().min(1, { error: '상품명을 입력하세요' }).max(120),
  categoryId: z.uuid().nullable(),
  channel: z.string().trim().max(30).nullable(),
  description: z.string().trim().max(500).nullable(),
  variants: z.array(editVariantSchema).max(200),
})

export async function updateProduct(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser()

  const raw = formData.get('payload')
  if (typeof raw !== 'string') return fail('폼 데이터를 읽지 못했습니다')

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return fail('폼 데이터를 읽지 못했습니다')
  }

  const parsed = editPayloadSchema.safeParse(json)
  if (!parsed.success) return fail(parsed.error.issues[0].message)

  const { productId, name, categoryId, channel, description, variants } = parsed.data

  // 폼 안에서 바코드가 겹치는 경우. DB 도 막지만 어느 값인지 알려주려면
  // 여기서 먼저 봐야 한다.
  const codes = variants.map((v) => v.barcode).filter((c): c is string => Boolean(c))
  const dupe = codes.find((c, i) => codes.indexOf(c) !== i)
  if (dupe) return fail(`바코드 ${dupe} 가 여러 줄에 중복으로 들어갔습니다`)

  const supabase = await createClient()
  const { error } = await supabase.rpc('update_product', {
    p_product_id: productId,
    p_name: name,
    p_category_id: categoryId ?? undefined,
    p_channel: channel ?? undefined,
    p_description: description ?? undefined,
    p_variants: variants.map((v) => ({
      variant_id: v.variantId,
      sale_price: v.salePrice,
      low_stock_threshold: v.lowStockThreshold,
      barcode: v.barcode,
      units_per_pack: v.unitsPerPack > 0 ? v.unitsPerPack : null,
    })),
  })

  if (error) return fail(humanize(error))

  // 재고 목록과 수정 화면 둘 다 방금 값을 보여줘야 한다.
  revalidatePath('/stock')
  revalidatePath(`/stock/${productId}/edit`)

  // createProduct 와 달리 redirect 하지 않는다. 가격을 고치고 나서 재고를
  // 확인하는 흐름이 자연스럽고, 여러 변형을 연달아 고치는 일도 잦다.
  return ok('저장했습니다')
}
