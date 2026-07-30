import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'

import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  // 화면마다 title 을 주면 "재고 · ZERO STORE" 형태로 붙는다.
  title: {
    default: 'ZERO STORE',
    template: '%s · ZERO STORE',
  },
  description: '영심 스토어 재고·판매 관리',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // maximumScale 로 확대를 막지 않는다. 눈이 나쁜 사람이 화면을 키우지 못하게
  // 되는 쪽이, 입력창에서 화면이 잠깐 확대되는 것보다 훨씬 나쁘다.
  // (iOS 확대 문제는 입력 글자 크기를 16px 이상으로 두어 해결했다)
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f4f5' },
    { media: '(prefers-color-scheme: dark)', color: '#09090b' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  )
}
