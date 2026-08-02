/**
 * `node --test` 로 앱의 .ts 파일을 그대로 돌리기 위한 해석기 훅.
 *
 * 노드 22 는 타입 표기를 스스로 벗겨내므로 별도 빌드가 필요 없다. 막히는 것은
 * 하나뿐이다 — 이 저장소는 번들러 기준이라 상대 import 에 확장자를 안 쓰는데
 * (`from '../../sales/import/columns'`), 노드의 ESM 해석기는 확장자를 요구한다.
 * 여기서 그 간극만 메운다.
 *
 * 테스트를 위해 앱 코드의 import 문을 고치는 쪽은 택하지 않았다. 그러면 테스트
 * 편의를 위해 제품 코드의 관례가 흔들리고, tsconfig 에
 * allowImportingTsExtensions 까지 켜야 한다.
 *
 * 새 의존성은 하나도 안 쓴다. pnpm 이 공급망 정책(minimumReleaseAge)에 걸려
 * 설치가 막히는 일이 잦은 저장소라, 테스트 하나 돌리자고 devDependency 를
 * 늘리면 그 자체가 다음 사람의 걸림돌이 된다.
 */
import { existsSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'

const CANDIDATES = ['', '.ts', '.tsx', '/index.ts', '/index.tsx']
// tsconfig 의 paths 와 같은 뜻: '@/' 는 저장소 뿌리다.
const ROOT = pathToFileURL(process.cwd() + '/').href

registerHooks({
  resolve(specifier, context, next) {
    const isAlias = specifier.startsWith('@/')
    const isRelative = specifier.startsWith('.')
    if ((isAlias || isRelative) && !/\.[mc]?[jt]sx?$/.test(specifier)) {
      const base = isAlias
        ? new URL(specifier.slice(2), ROOT)
        : new URL(specifier, context.parentURL)
      for (const ext of CANDIDATES) {
        const candidate = new URL(base.href + ext)
        if (existsSync(fileURLToPath(candidate))) {
          // 별칭은 파일 URL 로 바꿔서 넘긴다 — '@/...' 는 노드가 패키지
          // 이름으로 읽어 node_modules 에서 찾으려 든다.
          return next(isAlias ? candidate.href : specifier + ext, context)
        }
      }
    }
    return next(specifier, context)
  },
})
