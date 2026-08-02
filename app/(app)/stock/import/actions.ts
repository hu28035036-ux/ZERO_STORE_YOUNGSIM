'use server'

import type { PostgrestError } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireUser } from '@/lib/auth'
import { chunks, chunksByEncodedLength } from '@/lib/chunks'
import { createClient } from '@/lib/supabase/server'

/**
 * 상품 임포트 두 액션: 중복 확인(resolveProductRows)과 확정(importProducts).
 *
 * 판매 임포트와 구조는 같지만 "매칭"의 뜻이 반대다 — 판매는 기존 상품을
 * 찾아야 정상이고, 상품 등록은 기존 상품이 **없어야** 정상이다. 찾히면
 * 중복이니 미리보기에서 걸러야 한다.
 */

// ---------------------------------------------------------------------------
// 중복 확인
// ---------------------------------------------------------------------------

export type DupQuery = { code: string | null; name: string | null }

export type DupResult = {
  /** 이 코드가 이미 등록돼 있으면 true — 코드는 PK 라 강행이 불가능하다 */
  codeTaken: boolean
  /** 같은 이름의 상품이 이미 있으면 그 이름. 이름은 중복 등록이 가능은 하다 */
  nameTaken: boolean
}

const dupSchema = z
  .array(
    z.object({
      code: z.string().trim().max(64).nullable(),
      name: z.string().trim().max(200).nullable(),
    }),
  )
  .max(2_000)

export async function resolveProductRows(raw: DupQuery[]): Promise<DupResult[]> {
  await requireUser()

  const parsed = dupSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error('중복 확인 요청이 올바르지 않습니다')
  }
  const rows = parsed.data

  const supabase = await createClient()

  // 코드는 barcodes 가 진실이다. v_variant_stock 의 barcode 는 대표 하나뿐이라
  // 부바코드로 등록된 코드를 놓친다.
  const codes = [...new Set(rows.map((r) => r.code).filter((v): v is string => !!v))]
  const takenCodes = new Set<string>()
  for (const part of chunks(codes)) {
    const { data, error } = await supabase.from('barcodes').select('code').in('code', part)
    if (error) {
      throw new Error('코드 중복 확인에 실패했습니다: ' + error.message)
    }
    for (const b of data ?? []) takenCodes.add(b.code)
  }

  // 이름은 숨긴 상품(is_active=false)까지 본다 — 되살릴 수 있는 상품과
  // 이름이 겹치면 나중에 목록에 같은 이름이 두 줄 생긴다. 알려는 준다.
  const names = [...new Set(rows.map((r) => r.name).filter((v): v is string => !!v))]
  const takenNames = new Set<string>()
  for (const part of chunksByEncodedLength(names)) {
    const { data, error } = await supabase.from('products').select('name').in('name', part)
    if (error) {
      // 실패를 "중복 없음"으로 삼키면 중복 상품이 그대로 등록된다.
      throw new Error('이름 중복 확인에 실패했습니다: ' + error.message)
    }
    for (const p of data ?? []) takenNames.add(p.name)
  }

  return rows.map((r) => ({
    codeTaken: !!r.code && takenCodes.has(r.code),
    nameTaken: !!r.name && takenNames.has(r.name),
  }))
}

// ---------------------------------------------------------------------------
// 확정
// ---------------------------------------------------------------------------

const productSchema = z.object({
  name: z.string().trim().min(1, { error: '상품명이 빈 줄이 있습니다' }).max(120),
  /** 정제 전 원문에서 떼어낸 규격 — description 으로 들어간다 */
  spec: z.string().trim().max(500).nullable(),
  channel: z.string().trim().max(30).nullable(),
  categoryName: z.string().trim().max(30).nullable(),
  // 4자 하한은 barcodes 의 check 제약과 같은 값. 짧은 코드는 클라이언트가
  // 미리 코드 없음으로 바꿔 보낸다.
  code: z.string().trim().min(4).max(64).nullable(),
  unitsPerPack: z.number().int().min(1).max(100_000).nullable(),
  initialQty: z.number().int().min(0).max(1_000_000),
  cost: z.number().int().min(0).max(1_000_000_000),
  price: z.number().int().min(0).max(1_000_000_000),
  lowStockThreshold: z.number().int().min(0).max(1_000_000),
})

const importSchema = z.object({
  products: z
    .array(productSchema)
    .min(1, { error: '등록할 상품이 없습니다' })
    .max(2_000, { error: '한 번에 2,000개까지만 등록할 수 있습니다' }),
  /** 파일에 나온 분류 이름 → 처리 방법. 화면의 분류 카드에서 정한 값이다. */
  categoryPlan: z.array(
    z.object({
      name: z.string().trim().min(1).max(30),
      mode: z.enum(['create', 'existing', 'none']),
      existingId: z.uuid().nullable(),
    }),
  ),
})

export type ProductImportPayload = z.infer<typeof importSchema>

export type ProductImportResult =
  | { status: 'error'; error: string }
  | { status: 'done'; batchId: string; count: number }

function humanize(error: PostgrestError): string {
  if (error.code === '23505') {
    if (error.message.includes('barcodes_pkey')) {
      // 미리보기의 중복 확인을 뚫고 온 경쟁 상태(그 사이 누가 등록).
      // 트랜잭션 전체가 굴러갔으니 하나도 안 들어갔다.
      return '이미 등록된 상품코드가 있어 전체를 반영하지 못했습니다. 파일을 다시 올려 중복을 확인하세요'
    }
    return '이미 등록된 값이 있어 반영하지 못했습니다'
  }
  return error.message
}

export async function importProducts(
  payload: ProductImportPayload,
): Promise<ProductImportResult> {
  await requireUser()

  const parsed = importSchema.safeParse(payload)
  if (!parsed.success) {
    return { status: 'error', error: parsed.error.issues[0].message }
  }
  const { products, categoryPlan } = parsed.data

  const supabase = await createClient()

  // 분류 이름 → id. 새로 만들 분류는 RPC 밖에서 먼저 만든다 — 임포트가
  // 실패해도 분류가 남는 것은 깨진 상태가 아니고(설정에서 지울 수 있다),
  // RPC 안에서 만들면 이름 충돌 처리가 두 벌이 된다.
  const catId = new Map<string, string>()
  for (const plan of categoryPlan) {
    if (plan.mode === 'existing' && plan.existingId) {
      catId.set(plan.name, plan.existingId)
    } else if (plan.mode === 'create') {
      const { data, error } = await supabase
        .from('categories')
        .insert({ name: plan.name, parent_id: null })
        .select('id')
        .single()
      if (error && error.code === '23505') {
        // 그 사이 누가 같은 이름을 만들었다. 그 분류를 그대로 쓴다.
        const { data: existing } = await supabase
          .from('categories')
          .select('id')
          .eq('name', plan.name)
          .is('parent_id', null)
          .maybeSingle()
        if (existing) catId.set(plan.name, existing.id)
      } else if (error) {
        return { status: 'error', error: `분류 "${plan.name}" 만들기 실패: ${error.message}` }
      } else if (data) {
        catId.set(plan.name, data.id)
      }
    }
  }

  const { data, error } = await supabase.rpc('import_products', {
    p_products: products.map((p) => ({
      name: p.name,
      description: p.spec,
      channel: p.channel,
      category_id: p.categoryName ? (catId.get(p.categoryName) ?? null) : null,
      variants: [
        {
          options: {},
          sale_price: p.price,
          initial_unit_cost: p.cost,
          initial_qty: p.initialQty,
          low_stock_threshold: p.lowStockThreshold,
          units_per_pack: p.unitsPerPack,
          barcode: p.code,
        },
      ],
    })),
  })

  if (error) return { status: 'error', error: humanize(error) }

  // 상품·재고·홈 타일이 전부 움직인다.
  revalidatePath('/')
  revalidatePath('/stock')
  revalidatePath('/movements')

  const rows = data ?? []
  return {
    status: 'done',
    batchId: rows[0]?.batch_id ?? '',
    count: rows.length,
  }
}
