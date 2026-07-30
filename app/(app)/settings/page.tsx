import { ActionForm } from '@/components/ui/action-form'
import { Badge } from '@/components/ui/badge'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card'
import { Input, NumberInput, Select } from '@/components/ui/field'
import { getSessionUser } from '@/lib/auth'
import { formatQty } from '@/lib/constants'
import { createClient } from '@/lib/supabase/server'

import {
  createCategory,
  createSupplier,
  deleteCategory,
  recalcStock,
  renameCategory,
  toggleSupplier,
  updateProfile,
  updateStore,
} from './actions'

export const metadata = { title: '설정' }

export default async function SettingsPage() {
  const supabase = await createClient()
  const user = await getSessionUser()

  const [settings, profile, categories, suppliers, integrity] = await Promise.all([
    supabase.from('app_settings').select('*').maybeSingle(),
    user
      ? supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('categories').select('id, name, parent_id').order('name'),
    supabase.from('suppliers').select('*').order('is_active', { ascending: false }).order('name'),
    supabase.from('v_stock_integrity').select('*').limit(20),
  ])

  const cats = categories.data ?? []
  const parents = cats.filter((c) => !c.parent_id)
  const childrenOf = (id: string) => cats.filter((c) => c.parent_id === id)

  const drift = integrity.data ?? []

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-ink text-lg font-semibold tracking-tight">설정</h1>

      <Card>
        <CardHeader>
          <CardTitle>가게 정보</CardTitle>
        </CardHeader>
        <CardBody>
          <ActionForm action={updateStore} submitLabel="저장">
            <Input
              label="가게 이름"
              name="storeName"
              defaultValue={settings.data?.store_name ?? ''}
              maxLength={60}
              required
            />
            <NumberInput
              label="기본 최소 재고"
              name="defaultLowStock"
              defaultValue={String(settings.data?.default_low_stock ?? 0)}
              hint="상품을 새로 등록할 때 채워지는 기본값입니다. 이미 등록된 상품은 바뀌지 않습니다."
            />
          </ActionForm>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>내 이름</CardTitle>
        </CardHeader>
        <CardBody>
          <ActionForm action={updateProfile} submitLabel="저장">
            <Input
              label="표시 이름"
              name="displayName"
              defaultValue={profile.data?.display_name ?? ''}
              maxLength={40}
              placeholder={user?.email?.split('@')[0] ?? ''}
              hint="입출고 내역의 “처리” 칸에 이 이름이 나옵니다."
            />
          </ActionForm>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>카테고리</CardTitle>
          <span className="text-ink-muted text-xs">대분류 &gt; 소분류, 2단까지</span>
        </CardHeader>
        <CardBody className="flex flex-col gap-5">
          <ActionForm action={createCategory} submitLabel="추가" layout="row">
            <div className="min-w-40 flex-1">
              <Input label="새 카테고리" name="name" placeholder="예: 음료" required />
            </div>
            <div className="min-w-40 flex-1">
              <Select label="상위 (선택)" name="parentId" defaultValue="">
                <option value="">대분류로 만들기</option>
                {parents.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
          </ActionForm>

          {cats.length === 0 ? (
            <p className="text-ink-muted text-sm">아직 카테고리가 없습니다.</p>
          ) : (
            <ul className="flex flex-col gap-4">
              {parents.map((parent) => (
                <li key={parent.id} className="flex flex-col gap-2">
                  <CategoryRow id={parent.id} name={parent.name} />
                  {childrenOf(parent.id).length > 0 ? (
                    <ul className="border-border-base ml-4 flex flex-col gap-2 border-l pl-4">
                      {childrenOf(parent.id).map((child) => (
                        <li key={child.id}>
                          <CategoryRow id={child.id} name={child.name} />
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>거래처</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-5">
          <ActionForm action={createSupplier} submitLabel="추가" layout="row">
            <div className="min-w-40 flex-1">
              <Input label="새 거래처" name="name" placeholder="예: 영심유통" required />
            </div>
            <div className="min-w-32 flex-1">
              <Input label="전화 (선택)" name="phone" inputMode="tel" />
            </div>
          </ActionForm>

          {(suppliers.data ?? []).length === 0 ? (
            <p className="text-ink-muted text-sm">
              아직 거래처가 없습니다. 입고를 넣을 때 거래처는 선택 사항입니다.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {(suppliers.data ?? []).map((s) => (
                <li
                  key={s.id}
                  className="border-border-base flex items-center justify-between gap-3 border-b pb-2 last:border-0"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-ink truncate text-sm font-medium">
                        {s.name}
                      </span>
                      {!s.is_active ? <Badge tone="neutral">쓰지 않음</Badge> : null}
                    </div>
                    {s.phone ? (
                      <span className="text-ink-muted text-xs" data-numeric>
                        {s.phone}
                      </span>
                    ) : null}
                  </div>
                  <ActionForm
                    action={toggleSupplier}
                    submitLabel={s.is_active ? '쓰지 않음' : '다시 쓰기'}
                    submitVariant="secondary"
                    submitSize="sm"
                    layout="row"
                  >
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="next" value={String(!s.is_active)} />
                  </ActionForm>
                </li>
              ))}
            </ul>
          )}

          <p className="text-ink-muted text-sm leading-relaxed">
            거래처는 지우지 않고 “쓰지 않음”으로 돌립니다. 지우면 과거 입고가 어디서
            왔는지가 장부에서 사라집니다.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>재고 점검</CardTitle>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          {drift.length === 0 ? (
            <p className="text-ink text-sm">
              재고 수량이 입출고 원장과 모두 맞습니다.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-danger text-sm font-medium">
                {drift.length}개 품목의 재고 수량이 원장과 어긋나 있습니다.
              </p>
              <ul className="text-ink-muted flex flex-col gap-1 text-sm">
                {drift.map((d) => (
                  <li key={d.variant_id} className="flex justify-between gap-3">
                    <span className="truncate">{d.product_name}</span>
                    <span data-numeric className="whitespace-nowrap">
                      화면 {formatQty(d.cached_qty)} / 원장 {formatQty(d.ledger_qty)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-ink-muted text-sm leading-relaxed">
            입출고 내역이 진실이고 상품별 재고 수량은 그걸 더해 둔 사본입니다.
            둘이 어긋나면 아래 버튼이 원장을 다시 더해 수량을 맞춥니다.
            <br />
            원가는 건드리지 않습니다 — 이동평균은 입고 순서에 따라 달라져서
            지금 값에서 되돌릴 수 없습니다.
          </p>

          <ActionForm
            action={recalcStock}
            submitLabel="원장으로 재고 다시 맞추기"
            submitVariant="secondary"
            confirmLabel="다시 맞추기 실행"
          />
        </CardBody>
      </Card>
    </div>
  )
}

/** 카테고리 한 줄: 이름 고치기 + 지우기. 폼 두 개가 나란히 선다. */
function CategoryRow({ id, name }: { id: string; name: string }) {
  return (
    <div className="flex items-end gap-2">
      <ActionForm
        action={renameCategory}
        submitLabel="저장"
        submitVariant="secondary"
        submitSize="sm"
        layout="row"
        className="flex-1"
      >
        <input type="hidden" name="id" value={id} />
        <div className="min-w-32 flex-1">
          <Input aria-label={`${name} 이름`} name="name" defaultValue={name} required />
        </div>
      </ActionForm>

      <ActionForm
        action={deleteCategory}
        submitLabel="삭제"
        submitVariant="ghost"
        submitSize="sm"
        confirmLabel="정말 삭제"
        layout="row"
      >
        <input type="hidden" name="id" value={id} />
      </ActionForm>
    </div>
  )
}
