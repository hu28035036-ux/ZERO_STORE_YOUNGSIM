import { redirect } from 'next/navigation'

/**
 * 옛 주소. 등록 화면이 /movements 본체가 되면서(2026-08-08) 여기는 주소만
 * 받아 넘긴다 — 북마크·바깥에 남은 링크가 깨지지 않게 한 릴리스쯤 두고 지운다.
 */
export default async function LegacyNewMovementPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const params = new URLSearchParams()
  if (typeof sp.q === 'string' && sp.q) params.set('q', sp.q)
  if (typeof sp.variant === 'string' && sp.variant) params.set('variant', sp.variant)
  const qs = params.toString()
  redirect(qs ? `/movements?${qs}` : '/movements')
}
