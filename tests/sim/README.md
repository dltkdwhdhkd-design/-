# 실시간 다중 인스턴스 시뮬레이터

실제 `lib/live-server.ts`, `app/api/field/route.ts`, `app/api/game/route.ts`와 클라이언트 네트워크 코드(`lib/field-net.ts`, 비교용 v21 클라이언트는 `baseline-client.mjs`)를 Node 한 프로세스에서 그대로 실행하고, 그 사이의 네트워크와 D1만 모형으로 바꿉니다.

- **Worker 인스턴스(isolate)**: `live-server.ts`를 시나리오마다 여러 번 새 모듈로 불러와 인스턴스별 메모리를 분리합니다. 접속자는 인스턴스에 고르게 흩어집니다(`iso1`=모두 한 인스턴스, `iso29`=모두 다른 인스턴스).
- **D1**: `node:sqlite` 위의 단일 스레드 큐(`d1.mjs`). 왕복 지연(RTT)과 지터, 쓰기 처리 시간, 큐 대기, 문장 수, 읽은 바이트를 기록합니다. 실제 마이그레이션(`drizzle/*.sql`)을 그대로 적용합니다.
- **네트워크**: 순서 보장(FIFO) 링크, 지연·지터·손실(손실은 TCP처럼 재전송 지연으로 나타남), 탭 숨김 시 1초 묶음 전달, 강제 재접속(`net.mjs`).
- **봇**: 29명이 실제 입력(20 ms 단위)으로 걷고 멈추며, 정해진 시각에 임포스터가 가까운 대상을 실제 공격 경로로 공격합니다.

## 실행
```sh
node --no-warnings --import ./tests/sim/register.mjs tests/sim/realtime-sim.mjs [시나리오...] --client current --out tests/sim/results/current.json [--seconds 20]
node --no-warnings --import ./tests/sim/register.mjs tests/sim/realtime-sim.mjs --client baseline --out tests/sim/results/baseline.json   # v21 소스 트리에서 실행
python3 tests/sim/summary.py tests/sim/results/baseline-final.json tests/sim/results/current-final.json
```
시나리오: `p6c2-iso1-d25`(6명 방·2명 접속), `p16-iso16-d25`, `p29-iso29-d25`, `p29-iso1-d170`, `p29-iso29-d170`, `p29-iso29-d25-recycle`(D1 쿼리 예산 120으로 재접속 교대 강제), `p29-iso29-d170-adverse`(지연 30±15 ms, 손실 2 %, 6–11초 탭 숨김, 12초 강제 재접속). `d25`/`d170`은 D1 왕복 25 ms / 170 ms(같은 지역 / 먼 지역)입니다.

## 모형이 다루지 않는 것 (실제 배포에서 따로 확인해야 함)
- Cloudflare가 실제로 접속을 몇 개의 인스턴스에 어떻게 나누는지, 인스턴스 축출·재시작 시점.
- 실제 D1의 지연 분포, 동시 쓰기 처리량, 요금·한도(무료 50 / 유료 1000 쿼리/호출).
- Workers의 "다른 요청의 I/O 금지" 규칙. 시뮬레이터에서는 다른 접속의 소켓에 써도 동작합니다. 이 규칙 위반은 시뮬레이터가 아니라 실제 workerd(로컬 `wrangler dev`, Miniflare)에서 발견했고 `tests/live-protocol-multiplayer.mjs` 6번 항목이 이를 검사합니다.
- 실제 기기의 프레임 속도, 브라우저 타이머 제약, 학교망.

수치는 같은 모형에서 v21과 현재 코드를 비교하는 용도이며, 실제 교실 성능의 보증이 아닙니다.
