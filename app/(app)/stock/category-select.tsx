'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/field'

import { createCategoryInline } from './actions'
import type { CategoryOption } from './categories'

/**
 * 분류 선택 + 그 자리에서 새로 만들기.
 *
 * 등록하다가 없는 분류를 만나면 설정 화면에 다녀와야 했다 — 그 사이 폼
 * 내용이 날아간다. 새로 만든 분류는 서버 목록을 다시 받지 않고 로컬
 * 목록에 붙여 바로 선택한다. 새로고침하면 서버 목록에 어차피 들어 있다.
 */
export function CategorySelect({
  categories,
  value,
  onChange,
}: {
  categories: CategoryOption[]
  value: string
  onChange: (id: string) => void
}) {
  const [extra, setExtra] = useState<CategoryOption[]>([])
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 서버 목록과 로컬 추가분이 겹칠 수 있다 (다른 탭에서 만들었다든가).
  const seen = new Set(categories.map((c) => c.id))
  const all = [...categories, ...extra.filter((c) => !seen.has(c.id))]

  async function add() {
    const trimmed = name.trim()
    if (!trimmed || busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await createCategoryInline(trimmed)
      if ('error' in res) {
        setError(res.error)
        return
      }
      setExtra((prev) =>
        prev.some((c) => c.id === res.id) ? prev : [...prev, { id: res.id, label: trimmed }],
      )
      onChange(res.id)
      setName('')
      setAdding(false)
    } catch {
      setError('분류를 만들지 못했습니다. 연결을 확인하세요')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <Select
            label="카테고리"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">선택 안 함</option>
            {all.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setAdding((v) => !v)}
          className="shrink-0"
        >
          <Plus size={16} aria-hidden />새 분류
        </Button>
      </div>

      {adding ? (
        <div className="flex items-center gap-2">
          <Input
            aria-label="새 분류 이름"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 냉동 식품"
            maxLength={30}
            className="min-w-0 flex-1"
            onKeyDown={(e) => {
              // 폼 안의 Enter 는 제출로 흐른다. 여기서는 분류 추가여야 한다.
              if (e.key === 'Enter') {
                e.preventDefault()
                void add()
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            disabled={busy || !name.trim()}
            onClick={() => void add()}
            className="shrink-0"
          >
            {busy ? '만드는 중…' : '만들기'}
          </Button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : null}
    </div>
  )
}
