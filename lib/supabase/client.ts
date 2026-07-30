'use client'

import { createBrowserClient } from '@supabase/ssr'

import type { Database } from '@/lib/database.types'

import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './env'

// 브라우저 클라이언트는 요청마다 새로 만들 필요가 없다.
// createBrowserClient 는 내부적으로 싱글턴을 유지하므로 그대로 호출해도 된다.
export function createClient() {
  return createBrowserClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
}
