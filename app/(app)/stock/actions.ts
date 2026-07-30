'use server'

import type { PostgrestError } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

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
  const { name, categoryId, description, optionSchema, variants } = parsed.data

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
    p_description: description ?? undefined,
    p_option_schema: optionSchema,
    p_variants: variants,
  })

  if (error) return { error: humanize(error) }

  revalidatePath('/stock')

  // 방금 넣은 상품이 목록 어디에 있는지 찾게 하지 않는다. 이름으로 걸러진
  // 화면으로 보낸다. redirect() 는 예외를 던지므로 try 안에 두면 안 된다.
  redirect(`/stock?q=${encodeURIComponent(name)}`)
}
