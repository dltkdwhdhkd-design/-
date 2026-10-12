# 밤의 시민 — Claude 인계 패키지

> **v24 귀여운 캐릭터 + 끊김·지연 개선(로컬 변경, 배포하지 않음):** 캐릭터 모델을 장난감 피규어 스타일로 새로 만들고, 프레임 간격·3D 화질 자동 조절·게임 중 멈춤·장치 반응을 손봤습니다. 내용과 측정은 `REPORT_V24_KO.md`. 설치·실행 방법은 그대로입니다(새 마이그레이션 없음). 끊김 측정: 서버를 띄운 뒤 `BASE=http://127.0.0.1:8787 node tests/browser/verify-ui.mjs hitches`.
>
> **v23 모델링 개선(로컬 변경, 배포하지 않음):** v22 위에 캐릭터 3D 모델과 1인칭 내 팔(`lib/doll-character.ts`, `lib/scene3d.ts`)만 다시 다듬었습니다. 내용은 `REPORT_V23_MODEL_KO.md`. 설치·실행 방법은 v22와 같습니다(새 마이그레이션 없음).
>
> **v22 작업본(로컬 변경, 배포하지 않음).** 무엇을 왜 바꿨는지, 실제로 확인한 것과 추정·미검증을 구분한 내용은 `REPORT_V22_KO.md`에 있습니다. 아래 설치·실행 방법은 v22 기준으로 갱신했습니다(마이그레이션 0004, `LIVE_D1_QUERY_BUDGET`, 전체 테스트 명령).

이 폴더는 이미 만들어진 멀티플레이 게임의 실제 소스입니다. 새 게임으로 대체하지 말고 기존 구현을 읽고 개선하세요.

## 기준
- 배포 v21의 소스 커밋: `e9cb18602a22c8d278056214f497d94bfb5e0d44`
- 서비스: https://nightfall-class-mafia.kittien.chatgpt.site
- 최근 반영: 캐릭터 얼굴·머리카락 개선, 같은 3D 모델로 초상화 생성, 전체화면 버튼.
- 이 패키지는 해당 커밋의 사본입니다. 운영 데이터, 참가자 정보, 접속 토큰, Git 이력, 의존성 설치 폴더와 빌드 결과는 없습니다.
- 소스를 전달하는 작업이며 현재 서비스는 수정하거나 재배포하지 않았습니다.

## Claude에 전달하는 방법
1. Claude Code: `nightfall-source` 폴더를 열고 `CLAUDE_HANDOFF.md`부터 읽도록 요청하세요.
2. Claude 대화창: 압축을 풀고 `CLAUDE_HANDOFF.md`와 `SOURCE_FOR_CLAUDE.txt`를 첨부하세요. 통합 텍스트가 업로드 한도를 넘으면 인계 문서에 나열된 핵심 파일부터 올리세요.
3. 그림과 기존 캐릭터 리소스는 `public/`에 있습니다. 통합 텍스트에는 이미지 바이너리가 없으므로 실제 수정·실행에는 전체 폴더가 필요합니다.
4. 수정된 파일만이 아니라 실행 가능한 전체 프로젝트와 변경점, 검증 결과를 요청하세요.

## 로컬 실행
원본 package.json 기준 Node >=22.13.0, 패키지 관리자 pnpm 11.25.0입니다. TypeScript 테스트는 Node 22.13에서 `--experimental-strip-types`를 사용합니다. 외부 패키지 설치에는 인터넷이 필요합니다.

```sh
pnpm install --frozen-lockfile
pnpm run build
```

생성된 `dist/server/wrangler.json`을 사용해 아래 SQL을 **로컬 DB**에 한 번씩 순서대로 적용합니다.

```sh
pnpm exec wrangler d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_true_beast.sql
pnpm exec wrangler d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_lazy_microchip.sql
pnpm exec wrangler d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_wild_catseye.sql
pnpm exec wrangler d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0003_shallow_quicksilver.sql
pnpm exec wrangler d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0004_sweet_snowbird.sql
pnpm run start
```

v22에서 `0004_sweet_snowbird.sql`이 추가됐습니다(기본값이 있는 열 4개 추가). 이미 0003까지 적용한 로컬 DB에는 0004만 실행하면 됩니다. 운영 DB에서는 새 코드를 올리기 **전에** 0004를 먼저 적용해야 합니다.

환경변수: 설정할 것이 없습니다(비밀값도 없음). `LIVE_D1_QUERY_BUDGET`은 테스트용 상한(기본 800)이며, 호스팅의 연결당 D1 쿼리 한도는 서버가 오류에서 스스로 알아냅니다. 설명은 `.dev.vars.example`.

게임 중 F3 또는 주소 뒤 `?netdebug=1`로 네트워크 진단 패널(RTT, 원격 표시 지연, 입력 확인 지연, 서버 인스턴스 수, D1 지연·쿼리 수)을 볼 수 있습니다.

출력된 로컬 URL을 여세요. 수정 중 HMR은 `pnpm run dev`를 사용합니다. 원본 README.md에 프레임워크와 로컬 실행 구조가 있습니다. 새 사본에는 실행 환경 설정이 없어 portable 모드가 선택됩니다. 원본 `install:ci`는 관리형 Linux용 Bash 도구를 사용하므로 일반 PC에서는 위 pnpm 설치 명령을 사용하세요.

이 명령은 코드와 스크립트를 근거로 정리한 것입니다. 이번 인계 과정에서 새 PC의 전체 설치·실행을 재현한 것은 아닙니다. 일반 정적 HTML 호스팅만으로는 멀티플레이 서버가 실행되지 않습니다. Cloudflare Worker/D1 및 WebSocket 환경 또는 별도 서버 이식이 필요합니다. 기존 Sites의 `.openai/hosting.json`은 구성 보존용이며 접속 권한을 부여하지 않습니다. 다른 호스팅에서는 별도 배포 설정이 필요합니다.

## 검증
아래는 프로젝트에 포함된 테스트입니다. 전체 테스트를 단순 glob으로 실행하지 마세요. HTTP 테스트와 모델 출력 스크립트는 실행 환경이 다릅니다.

```sh
node node_modules/typescript/bin/tsc --noEmit
pnpm run build
node tests/run-all.mjs        # 단위 24개 + Miniflare HTTP/WebSocket 12개 + 쿼리 예산 교대 변형 1개
```

`tests/run-all.mjs`는 단위 테스트를 직접, HTTP·WebSocket 테스트를 빌드된 Worker(Miniflare)로 하나씩 실행합니다(Windows·macOS·Linux 공통). 그 밖의 도구:
- `tests/sim/`: 여러 Worker 인스턴스·D1 지연을 모형화한 실시간 시뮬레이터. 사용법과 한계는 `tests/sim/README.md`.
- `tests/browser/verify-ui.mjs`: 실행 중인 로컬 서버에 봇을 WebSocket으로 붙이고 헤드리스 Chromium으로 화면·전체화면·회의 전환·모바일 배치를 확인합니다(Playwright 필요, 파일 머리말 참고).

`worker.cjs`는 빌드 후 Miniflare와 임시 DB로 HTTP 테스트를 실행합니다. 특정 파일만 실행하려면 macOS/Linux에서 `TEST_FILE=first-person-multiplayer.mjs node tests/worker.cjs`, PowerShell에서는 `$env:TEST_FILE="first-person-multiplayer.mjs"; node tests/worker.cjs`를 사용합니다. `render-doll*.mjs`는 과거 오프라인 모델 검사 스크립트이며 `/workspace` 출력 경로를 로컬 경로로 바꿔야 합니다.

v21 작업 당시 타입 검사, 16개 모델의 리그·기하 검사, 이동 및 상호작용 테스트, 빌드가 통과했습니다. 실제 29대 기기 부하, 학교망 지터, 기기별 전체화면·WebGL 테스트가 완료됐다는 의미는 아닙니다.

v22에서는 위 전체 테스트 37개가 통과했고, 헤드리스 Chromium으로 화면을 확인했습니다. 실제 Cloudflare 분산 환경, 실기기, 학교망은 여전히 확인되지 않았습니다(`REPORT_V22_KO.md` 7절).

## 패키지 파일
- `CLAUDE_HANDOFF.md`: 요구사항·구조·검토 순서·복사할 요청문
- `SOURCE_FOR_CLAUDE.txt`: 소스 및 설정을 파일 경계와 함께 연결한 텍스트
- `EXPORT_MANIFEST.json`: 기준 커밋, 제외 목록, 원본 파일 SHA-256
- 나머지: 원본 프로젝트 소스·리소스·테스트
