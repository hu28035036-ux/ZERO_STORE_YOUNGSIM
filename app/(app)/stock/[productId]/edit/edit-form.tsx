'use client'

import Link from 'next/link'
import { useActionState, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, NumberInput, Select } from '@/components/ui/field'
import { formatQty, formatWon } from '@/lib/constants'
import type { ActionState } from '@/lib/action-state'

import { updateProduct } from '../../actions'
import { type CategoryOption } from '../../categories'
import { Cell, toInt } from '../../variant-fields'

export type EditVariant = {
  variantId: string
  label: string
  salePrice: string
  lowStockThreshold: string
  barcode: string
  stockQty: number
  costPrice: number
}

const GRID = 'sm:grid-cols-[1.6fr_1fr_1fr_1.4fr]'

export function EditProductForm({
  productId,
  initialName,
  initialCategoryId,
  initialDescription,
  categories,
  initialVariants,
}: {
  productId: string
  initialName: string
  initialCategoryId: string
  initialDescription: string
  categories: CategoryOption[]
  initialVariants: EditVariant[]
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    updateProduct,
    null,
  )

  const [name, setName] = useState(initialName)
  const [categoryId, setCategoryId] = useState(initialCategoryId)
  const [description, setDescription] = useState(initialDescription)
  const [variants, setVariants] = useState<EditVariant[]>(initialVariants)

  function setVariant(variantId: string, patch: Partial<EditVariant>) {
    setVariants((prev) =>
      prev.map((v) => (v.variantId === variantId ? { ...v, ...patch } : v)),
    )
  }

  // 옵션 축이 동적이라 폼 필드로 펼치는 대신 JSON 한 덩이로 보낸다.
  // 검증은 서버의 zod 와 DB 제약이 다시 한다.
  const payload = useMemo(
    () =>
      JSON.stringify({
        productId,
        name,
        categoryId: categoryId || null,
        description: description.trim() || null,
        variants: variants.map((v) => ({
          variantId: v.variantId,
          salePrice: toInt(v.salePrice),
          lowStockThreshold: toInt(v.lowStockThreshold),
          barcode: v.barcode.trim() || null,
        })),
      }),
    [productId, name, categoryId, description, variants],
  )

  return (
    <form action={formAction} className="flex flex-col gap-4 pb-4">
      <input type="hidden" name="payload" value={payload} />

      <Card>
        <CardHeader>
          <CardTitle>기본 정보</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <Input
            label="상품명"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={120}
          />
          <Select
            label="카테고리"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">선택 안 함</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
          <Input
            label="설명"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="선택 입력"
            maxLength={500}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>재고 단위 {variants.length}개</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          <div
            className={`text-ink-muted hidden gap-2 px-1 text-xs sm:grid ${GRID}`}
            aria-hidden
          >
            <span>옵션</span>
            <span>판매가</span>
            <span>최소재고</span>
            <span>바코드</span>
          </div>

          {variants.map((v) => (
            <div
              key={v.variantId}
              className={`border-border-base grid grid-cols-2 gap-2 rounded-lg border p-3 sm:items-center sm:rounded-none sm:border-0 sm:border-b sm:p-0 sm:pb-3 ${GRID}`}
            >
              <div className="col-span-2 sm:col-span-1">
                <div className="text-ink text-sm font-medium sm:truncate">
                  {v.label}
                </div>
                {/* 재고와 원가는 원장이 만드는 값이라 고칠 수 없다. 그래도
                    보여주는 이유는 판매가를 얼마로 할지 정할 근거이기 때문이다. */}
                <div className="text-ink-subtle mt-0.5 text-xs" data-numeric>
                  재고 {formatQty(v.stockQty)}개 · 원가 {formatWon(v.costPrice)}
                </div>
              </div>

              <Cell label="판매가">
                <NumberInput
                  aria-label={`${v.label} 판매가`}
                  value={v.salePrice}
                  onChange={(e) =>
                    setVariant(v.variantId, { salePrice: e.target.value })
                  }
                />
              </Cell>
              <Cell label="최소재고">
                <NumberInput
                  aria-label={`${v.label} 최소재고`}
                  value={v.lowStockThreshold}
                  onChange={(e) =>
                    setVariant(v.variantId, { lowStockThreshold: e.target.value })
                  }
                />
              </Cell>
              <div className="col-span-2 sm:col-span-1">
                <Cell label="바코드">
                  <Input
                    aria-label={`${v.label} 바코드`}
                    placeholder="선택"
                    inputMode="numeric"
                    autoComplete="off"
                    value={v.barcode}
                    onChange={(e) =>
                      setVariant(v.variantId, { barcode: e.target.value })
                    }
                    maxLength={64}
                  />
                </Cell>
              </div>
            </div>
          ))}

          <p className="text-ink-muted text-sm leading-relaxed">
            재고와 원가는 여기서 고칠 수 없습니다. 재고는 입출고 전표의 합이고
            원가는 입고가 만드는 이동평균입니다.{' '}
            <Link href="/movements/new" className="text-primary font-medium">
              입출고에서 바꾸세요
            </Link>
            .
          </p>
          <p className="text-ink-subtle text-sm leading-relaxed">
            옵션 축과 재고 단위 개수는 이 화면에서 바뀌지 않습니다.
          </p>
        </CardBody>
      </Card>

      <p aria-live="polite" className="min-h-5 text-sm">
        {state?.status === 'error' ? (
          <span className="text-danger">{state.message}</span>
        ) : state?.status === 'ok' ? (
          <span className="text-in">{state.message}</span>
        ) : null}
      </p>

      <Button type="submit" size="lg" full disabled={pending || !name.trim()}>
        {pending ? '저장 중…' : '저장'}
      </Button>
    </form>
  )
}
