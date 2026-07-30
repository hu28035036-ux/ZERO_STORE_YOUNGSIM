<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 이 저장소에서 일을 시작하기 전에

**`docs/HANDOFF.md` 를 먼저 읽어라.** 무엇이 검증됐고 무엇이 안 됐는지, DB 의
현재 상태, 막혀 있는 것, 다시 밟게 될 함정이 거기 있다. 특히:

- 여섯 화면이 다 구현돼 있지만 **로그인 뒤 화면을 브라우저로 띄워본 적이 없다.**
  검증은 SQL 레벨과 빌드까지다. 이 차이를 모르고 "다 됐다"고 말하지 마라.
- 프로덕션 Supabase 에 직접 붙어 있다. 스모크 테스트는 롤백 트랜잭션으로 하고,
  데모 데이터가 들어 있으니 지우기 전에 확인해라.
- 앱을 실제로 띄우려면 `.claude/skills/run-app/SKILL.md` 를 써라.

## 이 코드베이스의 말투

주석은 한국어로, **무엇을 하는지가 아니라 왜 그렇게 했는지**를 적는다. 특히
"이렇게 안 하면 무엇이 깨지는지"를 적는다. 코드를 읽으면 알 수 있는 것은 다시
쓰지 않는다. 기존 주석 몇 개를 읽어보고 밀도를 맞춰라.

DB 값은 영문으로 저장하고 한국어 라벨은 `lib/constants.ts` 에서만 붙인다.
색은 화면에서 직접 고르지 않는다 — `bg-red-500` 이 아니라 `bg-danger` 다
(`app/globals.css` 의 토큰).
