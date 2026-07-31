# G7 출시 준비 리뷰 (LRR) — B2B 온보딩 확장

> 상태: 판정 완료 — **조건부 Go** (2026-07-31)
> 게이트: G7 (Launch Readiness Review) · 의장: TPM · 스펙: S-B2B-001~121 전반
> 적용 강도: Lean (1인/공모전 — 게이트 3개 압축: G0 → G2+G3 통합 → G7)
> 관련: [prd-v1.md](prd-v1.md) · [ai-architecture.md](ai-architecture.md) · [score-display-policy.md](score-display-policy.md) · [consent-copy.md](consent-copy.md) · [hardware-nfc-decision.md](hardware-nfc-decision.md)

## 0. 판정 요약

| 대상 | 판정 | 근거 |
|---|---|---|
| **전시(EXPO) 배포** | **Go** | 아래 §2 체크리스트 전 항목 충족. 폴백 계층으로 하드웨어·네트워크 결손 시에도 체험 지속 |
| **기관(B2B) 실배포** | **조건부 Go** | §4 출시 조건 5건(전부 사람 몫·절차 문서 준비됨) 충족 시 Go |

## 1. 선행 게이트 통과 기록 (Lean 압축)

| 게이트 | 수행 방식 | 증거 (신뢰도) |
|---|---|---|
| G0 PRD | PRD v1 승인 — 문제·범위·지표·MoSCoW·Won't 합의 | [prd-v1.md](prd-v1.md) (높음 — 문서 실존) |
| G1 디자인 | 기존 디자인 시스템 준수 확인 — mvp CSS 변수·컴포넌트 관례, 웹앱 다크 테마 대응, 브라우저 실렌더 검증 | 키오스크·결과·연습 화면 read_page 검증 기록 (높음) |
| G2 ARB | ADR 3종(도메인·NFC 하드웨어·점수 표기) + AI 아키텍처 문서 + 폴백 계층 원칙 유지 | [domain-decision.md](domain-decision.md) 외 (높음) |
| G3 보안 | **적대적 리뷰 보드 시뮬레이션**(12 에이전트: 4렌즈 발견 21건 → 8건 반박 검증 → 7건 확정) 후 전건 수정·회귀 테스트 고정 | §3 AppSec 의견 참조 (높음 — 재현 검증 포함) |
| G4 개인정보 | PIPA 동의 문구 2벌, 미저장 동의 파기 경로에 judge 근거 포함, 교차 기관 개인정보 노출 수정 | [consent-copy.md](consent-copy.md) + `test_pack_report_e2e.py` (높음) |
| G5 코드 리뷰 | 백엔드 461 테스트 / mvp 61 테스트+빌드 / 웹앱 tsc·oxlint·build 전부 통과 (독립 재검증 포함) | 2026-07-31 실행 로그 (높음) |
| G6 CAB | 배포 절차 = 기존 `start-exhibition.ps1` 무변경. 롤백 스위치: `MIRROR_TING_JUDGE_SAMPLES=0`(judge), `MIRROR_TING_NFC_BRIDGE_ENABLED=false`(NFC), 팩 검증 실패 시 기동 거부(조용한 미적재 방지) | [WINDOWS-SETUP.md](../../../WINDOWS-SETUP.md) B2B 섹션 (높음) |

## 2. G7 체크리스트 (전시 기준)

- [x] 전 스위트 그린: 백엔드 461 · mvp 61 · 웹앱 tsc/lint/build — 실행으로 확인
- [x] 실서버 기동: `/api/health` `degraded: false` (whisper + Ollama dialogue/embedding)
- [x] E2E 실기 검증: 키오스크 발급(오류 토스트 경로 포함) → 미러 태그 → 동의 → 카페 크루 시나리오 시작 → 감정 게이지 → 결과 QR·코칭 카드
- [x] 폴백 검증: NFC 미인식 404→수동 폴백, pyscard 부재 시 브리지 휴면, Ollama 다운 시 judge·개인화 결정적 폴백(테스트 고정)
- [x] 내구성: 백엔드 재시작 후 태그 커서 생존, 유령 발급 방지 커서, 유휴 리셋 비충돌
- [x] 운영 문서: 당일 점검 §3.5(B2B/NFC), 문제 발생 시 대응표 3행 추가
- [x] 데이터 이전: 기존 전시 DB 무손실 마이그레이션(`_migrate_columns`) + 골든 회귀 호환(기존 시나리오 균등 가중 유지)

## 3. 리뷰 보드 의견 (역할별)

**제품 총괄** — 승인. MoSCoW의 Must 전 항목이 산출물로 연결됨. Won't(실물 하프미러 등) 이탈 없음. 유일한 우려는 §4-C4(플레이테스트 미실시)로, 콘텐츠 품질은 현재 "작성자 검증+자동 회귀"까지만 확보된 상태(신뢰도: 중간).

**Tech Lead** — 승인. 신규 모듈이 전부 기존 폴백 계층 원칙을 따르고, 회귀는 골든 하네스가 고정. 잔여 기술 부채(수용): ① claim check-then-act 경쟁(SQLite 단일 프로세스라 실위험 낮음, 리뷰 low로 분류) ② `pressure_questions.basic` 플래그가 엔진에서 미소비(기존 시드도 동일한 잠재 상태 — 팩에서는 제거해 정직화).

**AppSec/보안 총괄** — 승인 (OWASP LLM Top 10 2025 기준 자체 점검). LLM01 프롬프트 인젝션: judge 전사에서 화자 마커·개행 위조 무해화 + 루브릭 방어 명문화 + 회귀 테스트(수정 완료). 인가: 기관 스코프 404 정책, NFC UID를 자격증명으로 쓰지 않음(실물 태그 증거 2분 요구), UID 스트림 운영 가드. 잔여 리스크 수용: `/nfc/resolve`는 무인증 존재 오라클로 남음(직무·시나리오만 노출, 개인정보 무관 — 전시 구성은 백엔드 127.0.0.1 바인딩이라 노출면 없음). LAN 개방 배포 시 §4-C2 필수.

**DPO** — 승인. 영상 원본 미전송·집계 지표만 전송 원칙 유지. 미저장 동의 파기 경로가 judge 근거까지 확장됨(테스트 고정). 교차 기관 클레임 시 제3자 개인정보 제공 경로 차단. 동의 문구는 법무 검토 전 초안임을 문서에 명시(신뢰도 표기 준수).

**SRE** — 승인. 재시작 복구(분석 재큐잉·태그 커서), 프리웜, 진행률 정체 감지 기존 체계에 편입. judge는 백그라운드 분석에만 얹혀 턴 지연에 영향 없음. 킬 스위치 2종 문서화.

**QA** — 승인. 신규 테스트 55건(관통·보안·감정·팩·judge·E2E), 확정 결함 7건 전부 회귀 테스트로 고정. 미커버 수용: 실물 ACR122U 하드웨어 경로(시뮬레이터로만 검증 — 하드웨어 입고 후 §4-C1에서 실측).

## 4. 출시 조건 (기관 배포 전 — 전부 사람 몫, 절차 문서 준비됨)

| # | 조건 | 담당 | 절차 |
|---|---|---|---|
| C1 | ACR122U 2대 입고·실측 (`pip install pyscard` 후 자동 인식) | 하드웨어 담당 | [hardware-nfc-decision.md](hardware-nfc-decision.md) |
| C2 | `MIRROR_TING_JWT_SECRET`(32B+) 설정 + `REQUIRE_SECURE=true` + `claim_base_url` 실주소 | 운영 담당 | `.env.example` 주석 |
| C3 | 전시 PC 의미 매칭 임계 재보정 + 육성 떨림 검증 | AI 담당 | demo-checklist §2.5 |
| C4 | 팀원 상호 플레이테스트 2회전 → 부자연 지점 수정 | 전원 | [playtest-protocol.md](playtest-protocol.md) |
| C5 | human agreement 예비 측정 (α 산출 → 점수 표기 전환 판단) | 논문 트랙 | `scripts/measure_agreement.py` |

## 5. 다음 액션

1. C1~C5를 스프린트 백로그로 이관 (기한: 전시 리허설일 전).
2. C5 결과가 α ≥ 0.667이면 [score-display-policy.md](score-display-policy.md)의 전환 조건 발동 검토.
3. 출시 후 첫 운영일에 무비난 회고 1회(governance 포스트모템 프롬프트 사용) — NFC 실물 동작·감정 게이지 체감 반응 수집.
