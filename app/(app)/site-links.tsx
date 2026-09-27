import Image, { type StaticImageData } from 'next/image'
import { ExternalLink } from 'lucide-react'

import { buttonClass } from '@/components/ui/button'

import balju from './site-icons/balju.png'
import onlyonefoodnet from './site-icons/onlyonefoodnet.png'
import orderqueen from './site-icons/orderqueen.png'
import zerostore from './site-icons/zerostore.png'

/**
 * 홈의 바깥 사이트 바로가기 — 가게 일에 같이 쓰는 사이트들(2026-09-27 사용자 지정).
 *
 * 이름은 주소가 아니라 그 사이트가 스스로 붙인 이름(브라우저 탭 제목)이고, 아이콘도
 * 그 사이트의 파비콘이다 — 탭에서 늘 보던 모양이라야 한눈에 찾는다. 아이콘을 그
 * 사이트에서 바로 불러오지 않고 저장소에 둔 이유: 남의 서버가 느리거나 막히면 홈의
 * 아이콘 자리가 비어 버린다(글꼴을 자체 호스팅하는 것과 같은 이유). 사이트가 로고를
 * 바꾸면 여기 파일도 바꿔야 한다.
 */
const SITES: { name: string; href: string; icon: StaticImageData }[] = [
  {
    name: '오더퀸 백오피스',
    href: 'https://www.orderqueen.kr/backoffice_admin/SAL01010.itp',
    icon: orderqueen,
  },
  { name: '온리원푸드넷', href: 'https://onlyonefoodnetfo.ifresh.co.kr/', icon: onlyonefoodnet },
  { name: '발주GO', href: 'https://balju.co.kr/zero', icon: balju },
  { name: '제로스토어 관리자', href: 'https://zerostore.kr/Administrator', icon: zerostore },
]

export function SiteLinks() {
  return (
    <nav aria-label="자주 가는 사이트">
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {SITES.map((site) => (
          <li key={site.href}>
            {/* 새 탭: 홈은 매장 PC 에 켜 두는 화면이라 이 탭을 떠나면 안 된다. */}
            <a
              href={site.href}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass(
                'secondary',
                'md',
                true,
                'h-auto min-h-14 justify-start gap-3 px-3 py-2 text-left text-sm sm:text-[0.9375rem]',
              )}
            >
              {/* 파비콘은 이미 작은 PNG 라 이미지 최적화를 거칠 게 없다. */}
              <Image
                src={site.icon}
                alt=""
                width={28}
                height={28}
                unoptimized
                className="size-7 shrink-0 object-contain"
              />
              {/* break-keep: 휴대폰 두 칸에서 "제로스토어"가 "제로스토/어"로 쪼개지지
                  않고 띄어쓰기에서만 줄을 바꾸게 한다. */}
              <span className="min-w-0 flex-1 leading-snug break-keep">{site.name}</span>
              {/* 휴대폰 두 칸에서는 이 표시까지 들어갈 자리가 없어 이름이 잘린다. */}
              <ExternalLink size={14} aria-hidden className="text-ink-subtle hidden shrink-0 sm:block" />
              <span className="sr-only">(새 탭에서 열림)</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
