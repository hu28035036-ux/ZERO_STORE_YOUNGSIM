import Link from 'next/link'
import { Boxes, ChevronRight, Plus } from 'lucide-react'

import { buttonClass } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/server'

export const metadata = { title: '박스 묶음' }

/**
 * 박스 묶음 목록.
 *
 * 여기 있는 박스는 상품이 아니다 — 재고를 갖지 않고, 입고할 때 고르는 서식이다.
 * 재고는 언제나 안에 든 낱개가 센다.
 */
export default async function KitsPage() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('v_kits')
    .select('*')
    .eq('is_active', true)
    .order('name')

  const kits = data ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-ink text-xl font-semibold tracking-tight">박스 묶음</h1>
          <p className="text-ink-muted mt-1 max-w-prose text-sm">
            한 박스에 여러 맛이 섞여 오는 상품을 여기 등록해 두면, 입고할 때 맛별로
            펼쳐서 개수만 확인하면 됩니다. 재고는 맛별로 따로 셉니다.
          </p>
        </div>
        <Link href="/kits/new" className={buttonClass('primary', 'md', false, 'shrink-0')}>
          <Plus className="h-4 w-4" />
          박스 만들기
        </Link>
      </div>

      {error ? (
        <Card className="p-4">
          <p className="text-danger text-sm">목록을 불러오지 못했습니다: {error.message}</p>
        </Card>
      ) : kits.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <Boxes className="text-ink-subtle h-8 w-8" />
          <p className="text-ink-muted text-sm">
            아직 등록한 박스가 없습니다.
            <br />
            곤약젤리 버라이어티팩처럼 <b>한 박스에 여러 맛</b>이 든 상품을 만들어 보세요.
          </p>
          <Link href="/kits/new" className={buttonClass('secondary')}>
            박스 만들기
          </Link>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {kits.map((k) => (
            <li key={k.kit_id}>
              <Card className="hover:border-border-strong flex items-center gap-3 p-4 transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="text-ink truncate font-medium">{k.name}</p>
                  <p className="text-ink-subtle mt-0.5 text-xs">
                    <span data-numeric>{k.item_count}</span>종류 · 한 박스에{' '}
                    <span data-numeric>{k.default_total_qty}</span>개
                    {k.note ? ` · ${k.note}` : ''}
                  </p>
                </div>
                <Link
                  href={`/kits/${k.kit_id}/receive`}
                  className={buttonClass('primary', 'sm', false, 'shrink-0')}
                >
                  입고
                </Link>
                <Link
                  href={`/kits/${k.kit_id}`}
                  aria-label={`${k.name} 구성 고치기`}
                  className="text-ink-subtle hover:bg-surface-sunken hover:text-ink inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
