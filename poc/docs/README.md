# 문서 색인 (poc/docs)

4-Fit 미러팅의 기획·설계·전시 운영 문서 모음. 코드 주석의 `S-XXXXXX`/`F-XXXXXX`/
`R-XXXXXX`는 [`prd.json`](prd.json)의 스펙·기능·요구사항 ID를 가리킨다.

## 상위 기획 (마스터)

2026-07-22에 편입된 상위 기획 3종. PM 체크리스트 틀에 맞춘 상위 문서이며, 아래
구현·검증·조달 문서들이 이들의 하위에 대응한다.

| 문서 | 내용 |
|---|---|
| [expo-2026-masterplan.md](expo-2026-masterplan.md) | **EXPO 2026 상위 기획서.** 문제정의·가치제안·PRD·MVP 범위·기능명세·IA·리스크·부스 운영. `⚠️` 미확정 칸을 명시적으로 비워 둔 상위 기획. |
| [4fit-scoring-design.md](4fit-scoring-design.md) | **4-Fit 채점 설계서.** 채점 근거·방법·검증(사람 상한 대비 α), 툴킷, 판정 모델 로드맵. **⚠️ 3번째 축을 시선(Eye)→표정(Expression)으로 교체 확정.** |
| [eye-to-expression-migration.md](eye-to-expression-migration.md) | **시선→표정 축 교체 실행 기록·파일 인벤토리.** 이 브랜치에 구현·검증 완료(main 미병합), 8/3 이후 반영 대상. |
| [hardware-spec-2026.md](hardware-spec-2026.md) | **10월 본전시 최종 HW 스펙.** 65" 미러·Azure Kinect·지향성 마이크·NFC·80mm 프린터·컴퓨트 사양·BOM. |

> **정합 주의 (문서 vs 배포 코드)**
> - **4-Fit 축:** 배포 코드는 `응답·음성·시선(Eye)·자세` + 표정(관찰). 설계서는
>   `응답·음성·표정(Expression)·자세` + 시선(보조 신호). 코드가 이행하기 전까지는
>   [studies/expert-rubric-v1.md](studies/expert-rubric-v1.md)·리포트·대시보드가
>   **배포 코드 기준(Eye-Fit)** 으로 유효하다.
> - **하드웨어:** 8월 중간심사 조달·예산은 [hardware-plan.md](hardware-plan.md),
>   10월 최종 물리 스펙은 [hardware-spec-2026.md](hardware-spec-2026.md). 단계가
>   다른 상호 보완 문서(삭제·대체 관계 아님).

## 제품·기획

| 문서 | 내용 |
|---|---|
| [prd.json](prd.json) | 기획서 원본(요구사항·기능·스펙 ID 정본). 코드 주석이 참조. |
| [planning-council.md](planning-council.md) | 기획 협의체 플레이북 — 기획 리부트용 Fable 프롬프트 8종. |
| [mirror-ux-plan.md](mirror-ux-plan.md) | 제품 UX 기획 — 소개 사이트 + 반응형 웹 + 스마트 미러 3표면. |
| [ai-mastery-plan.md](ai-mastery-plan.md) | 4-Fit + 교차 분석을 최고 수준으로 끌어올리는 AI 마스터리 플랜. |
| [fable-playbook.md](fable-playbook.md) | Fable 플레이북 v2 — 미러형 디스플레이 집중, 중간심사(8/1) 완성 작전. |

## 아키텍처·데이터

| 문서 | 내용 |
|---|---|
| [architecture/2026-scale-out-design.md](architecture/2026-scale-out-design.md) | 10월 이후 확장 아키텍처 + ARB 심사 — 키오스크에서 기관 배포로. |
| [database-design.md](database-design.md) | 4-Fit 미러팅 데이터베이스 설계서. |

## 하드웨어

| 문서 | 내용 |
|---|---|
| [hardware-plan.md](hardware-plan.md) | **8월 중간심사 조달·예산 전략**(32" 아크릴 리그, 지원 규정 안 구매 계획·발주 타임라인). |
| [hardware-spec-2026.md](hardware-spec-2026.md) | **10월 본전시 최종 물리 스펙·배치·BOM**(상위 기획 참조). |

## 검증(측정 타당성)

| 문서 | 내용 |
|---|---|
| [studies/measurement-validity-study.md](studies/measurement-validity-study.md) | 4-Fit 측정 타당성 검증 스터디 설계(Study A). |
| [studies/expert-rubric-v1.md](studies/expert-rubric-v1.md) | 전문가 블라인드 평정 루브릭 v1(배포 코드 4-Fit 기준). |

## 전시(피치·시연·점검)

| 문서 | 내용 |
|---|---|
| [pitch/pitch-1min.md](pitch/pitch-1min.md) | 부스 심사위원용 1분/30초 피치. |
| [pitch/pitch-5min.md](pitch/pitch-5min.md) | 중간심사 5분 발표 대본. |
| [pitch/slides-outline.md](pitch/slides-outline.md) | 슬라이드 골격 12장(중간심사용). |
| [pitch/demo-scenario.md](pitch/demo-scenario.md) | 시연 큐시트 — 중간심사 라이브 데모. |
| [pitch/qa-anticipation.md](pitch/qa-anticipation.md) | 예상 질문 15 + 모범 답변. |
| [demo-checklist.md](demo-checklist.md) | 전시 당일 아침 15분 점검 체크리스트. |
| [reviews/2026-08-01-launch-readiness.md](reviews/2026-08-01-launch-readiness.md) | 출시 준비 리뷰(LRR) — 2026-08-01 중간심사. |

---

> **참고:** 상위 기획 3종(`expo-2026-masterplan`·`4fit-scoring-design`·
> `hardware-spec-2026`)은 본문에서 `development-roadmap.md`·
> `validity-pilot-protocol.md`·`prompt-scenario-architecture.md`·
> `character-bibles.md`·`engagement-features-plan.md` 등 **이 저장소에 없는 팀 문서**를
> 참조한다(외부 관리). 저장소 내 대응 문서는 위 표 기준이다.
