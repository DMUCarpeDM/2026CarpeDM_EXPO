# Eye → Expression 축 교체 — 실행 기록 · 파일 인벤토리

> 4-Fit 3번째 점수 축을 **시선(Eye) → 표정(Expression)** 으로 교체하고, 시선은
> 점수 아닌 **보조 관찰 신호**(실시간 넛지·리포트 관찰 카드·gaze_map)로 강등한 마이그레이션.
> 설계 정본은 채점 설계서(`4fit-scoring-design.md`)이나 이 저장소에는 아직 미편입이라,
> 아래 결정 사항이 현재 코드의 기준이다.
>
> **상태(2026-08-01): 현행 코드에 반영 완료.** 설계·구현은 2026-07-24 브랜치
> `claude/mirrorting-workplace-coaching-42466b`(커밋 `28b384e`)에서 완성됐고, main이 26커밋
> 앞서간 뒤라 그 diff를 스펙으로 삼아 현재 코드에 재적용했다(B2B 팩 루브릭·judge·키넥트
> 배선과 충돌 없이 병합).

## 설계 결정

1. **enum: `expression` 추가 + `eye` 유지.** `FitType`은 5멤버(response·voice·expression·
   posture·eye). 점수 축은 `SCORED_FITS = (response, voice, expression, posture)` 상수로
   정의(`services/report.py`). 시선(eye)은 enum에 남겨 관찰 결과 행·과거 데이터·gaze_map·
   admin iris 관측성·깜빡임 근거를 그대로 쓰되 **총점·강점·헤드라인·코호트·턴 타임라인에서 제외**한다.
2. **표정 점수화:** `nonverbal.score_expression()`. 입력은 **프론트가 이미 보내는**
   blendshape 집계(brow_raise_ratio·mouth_press_ratio·expr_recover_sec·smile_ratio·
   smile_duchenne_ratio)만 사용 → **프론트 캡처 변경 불필요**. 얼굴 미검출(깜빡임 0)·구
   페이로드(brow 키 없음)는 '무표정 0점'이 아니라 미측정(None) 처리.
3. **가중 총점:** `scoring.SCORED_FIT_WEIGHTS`(response .35 / voice .30 / expression .175 /
   posture .175 — 설계서 "표정·자세 최저", ⚠️ 정확값 미확정 잠정). 직무 팩이 `rubric_weights`를
   주면 그 배점이 우선하고(`{**SCORED_FIT_WEIGHTS, **rubric}`), 측정 안 된 축은 `weighted_mean`이
   남은 축 가중치로 자동 재정규화한다. 종전 '균등 평균' 경로는 사라졌다.
4. **`ENGINE_VERSION "3" → "4"`.** 축 세트와 총점 산식이 둘 다 바뀌므로 v3 이하 표본과
   백분위·추이를 섞지 않는다(`api/reports.py`가 engine_version으로 거른다).
5. **시선 관찰:** 리포트 `fit_scores["eye"]`에 `observation: true` 카드로 노출(점수·근거·
   gaze_map) — 레이더/총점/코호트 제외.
6. **표정은 `provisional`:** 설계서 철칙(α 검증 전 정식 보고 금지)에 따라 카드에
   `provisional: true` + `note`("아직 검증 중인 참고 지표")를 붙인다.

## DB — 재시드 불필요 (2026-08-01 실측으로 정정)

브랜치 기록은 "`FitType`이 `VARCHAR(8)`이라 `expression`(10자)이 안 들어가므로 DB 삭제·재시드
필요"라고 적었으나, **실측 결과 SQLite에서는 해당 없다.** `analysis_results.fit_type`은
`VARCHAR(8)`이되 **CHECK 제약이 없고**(SQLAlchemy 1.4+ 기본 `create_constraint=False`),
SQLite는 VARCHAR 길이를 강제하지 않는다. DB 복사본에 `expression` 행 삽입이 그대로 성공했다.
→ **7/31 리허설 데이터(세션 19·리포트 11건)를 보존한 채 전환했다.** PostgreSQL 등으로 옮길 때는
컬럼 길이를 함께 늘려야 한다.

## 파일 인벤토리

### 백엔드
| 파일 | 변경 |
|---|---|
| `app/models/models.py` | `FitType.expression` 추가, `eye` 관찰용 주석, docstring·fit_scores·nonverbal_metrics 주석 |
| `app/ai/scoring.py` | `ENGINE_VERSION="4"`, `SCORED_FIT_WEIGHTS` 신설 |
| `app/ai/nonverbal.py` | `score_expression()` + 표정 밴드 상수 4종, 모듈 docstring |
| `app/services/analysis.py` | 표정 채점·행 기록, `session_scores`를 표정으로 교체(시선 행은 관찰용으로 계속 기록) |
| `app/services/report.py` | `SCORED_FITS`·FIT_LABELS·NOT_MEASURED·`_expression_evidence`·EVIDENCE_BUILDERS·`_fit_detail_metrics`·STRENGTH_BY_BAND·빌드 루프·시선 관찰 카드·팩 루브릭+기본 가중 총점·provisional |
| `app/api/admin.py` | CSV 헤더/축 `eye_fit→expression_fit` (iris 관측성 집계는 eye 유지) |
| `app/api/reports.py` | 턴 타임라인에서 eye 제외, 코호트에서 `observation` 카드 제외 |
| `app/seed/packs.py` | `FIT_KEYS`의 배점 가능 축을 expression으로 |
| `app/seed/packs/*.json` | 두 팩의 `rubric_weights` 키 `eye→expression` |
| `app/seed/demo_data.py` | FIT_LABELS + 가중 총점 |
| `tests/` | `test_expression.py`에 점수 축 테스트 5종 추가, `test_analysis_correctness.py`에 축 교체 E2E(E), `test_cohort_isolation`·`test_pack_report_e2e` 축 정합 |

### mvp 프론트 (전시 화면)
`lib/reportFits.js`(+test) · `App.jsx`(DEMO 리포트·히스토리) · `components/report/Charts.jsx`
(FIT_COLORS·레이더 라벨/aria) · `components/ui/IconGlyph.jsx`(`expression: FaceSmile`) ·
`data/homeContent.js` + `pages/HomePage.jsx`(홈 카드·레이더·미니차트, 글리프 폴백) ·
`pages/ResultPage.jsx`·`ComparePage.jsx`·`FeedbackPage.jsx`·`components/AttractLoop.jsx` ·
`styles/base·result·dashboard·feedback·attract.css`(`--fit-expression` 토큰 + `.expression` 규칙)

### poc/frontend (B2B 웹앱)
브랜치에서는 "동결"이라 제외했으나 7/31 B2B 온보딩으로 다시 활성 코드가 됐다. **리포트 축만**
정합했다: `features/report/RadarChart.tsx` · `features/report/MirrorReportView.tsx` · `lib/b2b.ts`.

### 의도적으로 **유지**(시선 = 보조 신호)
`mvp/src/lib/useFaceTracking.js`·`nonverbalMetrics.js`(시선 신호 계산), `pages/PracticePage.jsx`
라이브 "시선 유지" 넛지·camera-eye-chip, `Charts.jsx` LIVE_FIT_COLORS/RING_GLYPHS,
`lib/overlayHud.js`(시선 정면/이탈 HUD), `styles/practice-live.css`,
poc/frontend `RoleplayMirrorView`·`RoleplayGlassesView`의 라이브 시선 칩, admin iris 관측성.

## 아직 안 함

- [ ] **표정축 α 검증**(Krippendorff/ICC, 한국 표정 데이터 대조) → `provisional` 해제 판단.
      **α < 0.67이면 축 폐기 조건이 유효하다.**
- [ ] **`SCORED_FIT_WEIGHTS` 정확값 확정**(설계서 ⚠️) — 현재 잠정.
- [ ] **표정 리치 신호**(expression-speech sync, AU6 cheekSquint) — 프론트 캡처 추가(fast-follow).
- [ ] `rubric_version` 도입 검토(축 세트 스냅샷).
- [ ] `mvp` 홈 카드용 **표정 일러스트 PNG**(현재 `IconGlyph`의 FaceSmile 글리프 폴백,
      `assets/fit-icon-eye.png`는 미사용으로 남음).
- [ ] 발표 자료·계획서(HWP)의 Eye-Fit 표기와의 이력 설명 유지 — 백업 슬라이드 A3 '채점 축 개편 이력'.

## 검증 (2026-08-01, 현행 코드)

- 백엔드 `pytest`: **519 passed** (표정 점수 5 + 축 교체 E2E 1 신규 포함).
- mvp: `npm test` **83 passed**, `npm run build` 성공.
- poc/frontend: `tsc -b` 통과, `npm test` **39 passed**, `npm run build` 성공, `oxlint` 기존 경고만.
- 런타임: mvp 데모 경로(`?demo=result|compare`, 홈)에서 4-Fit 라벨·레이더·비교표가 모두 **표정**으로 렌더됨을 확인.
