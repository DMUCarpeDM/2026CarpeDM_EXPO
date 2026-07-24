# Eye → Expression 축 정합 — 실행 기록 · 파일 인벤토리

> 4-Fit 3번째 점수 축을 **시선(Eye) → 표정(Expression)** 으로 교체하고, 시선은
> 점수 아닌 **보조 관찰 신호**(실시간 넛지·리포트 관찰)로 강등한 마이그레이션.
> 정본: [4fit-scoring-design.md](4fit-scoring-design.md).
> **상태(2026-07-23):** 이 브랜치(`claude/folder-analysis-966724`)에 **완성본 구현·검증 완료.
> main 미병합.** 8/3 시연은 기존 Eye-Fit로 진행하고, 이 브랜치는 **8/3 이후** 반영 대상.

## 왜 8/3 이후인가 (실행 게이트)

- **α 검증이 10월 항목:** 설계서 철칙 — "α 검증 전에는 어떤 점수도 정식 보고 금지 →
  참고용". 그래서 Expression 점수는 리포트에서 `provisional`/`note`로 **'참고용(α 미검증)'**
  표기한다. 검증된 표정 점수는 8/3에 준비되지 않는다.
- **DB 영속 enum:** `FitType`은 `Enum(FitType)`(VARCHAR(8))으로 저장된다. `"expression"`은
  10자라 기존 컬럼에 안 들어가 **`mirroting.db` 삭제·재시드**가 필요하다.
- **mvp 다수 파일 축 참조 + poc/frontend 동결:** 전시 앱은 `mvp/`. `poc/frontend`(TS)는
  7/16 이후 동결이라 **이번 마이그레이션에서 제외**했다(아래 §미이행).

## 설계 결정

1. **enum: `expression` 추가 + `eye` 유지.** `FitType`은 5멤버(response·voice·expression·
   posture·eye). 점수 축은 `SCORED_FITS = (response, voice, expression, posture)` 상수로
   정의(services/report.py). 시선(eye)은 enum에 남겨 관찰 결과 행·과거 데이터·gaze_map·
   admin iris·깜빡임 근거를 그대로 쓰되 **총점·강점·헤드라인·코호트에서 제외**한다.
2. **표정 점수화:** `nonverbal.score_expression()` 신설. 입력은 **프론트가 이미 보내는**
   blendshape 집계(brow_raise_ratio·mouth_press_ratio·expr_recover_sec·smile_ratio·
   smile_duchenne_ratio)만 사용 → **프론트 캡처 변경 불필요**. 얼굴 미검출(깜빡임 0)·구
   페이로드(brow 키 없음)는 '무표정 0점'이 아니라 미측정(None) 처리.
3. **가중 총점:** `scoring.SCORED_FIT_WEIGHTS`(response .35 / voice .30 / expression .175
   / posture .175 — 설계서 "표정·자세 최저", ⚠️ 정확값 미확정 잠정) 도입. 측정된 축으로
   자동 재정규화. `ENGINE_VERSION "1"→"2"`(구 eye·균등평균 표본과 섞이지 않게).
4. **시선 관찰:** 리포트 `fit_scores["eye"]`에 `observation: true` 카드로 노출(점수·gaze_map·
   근거) — 레이더/총점/코호트 제외. 턴별 타임라인(reports.py)에서도 eye 제외.

## 파일 인벤토리 (이 브랜치에서 변경)

### 백엔드 (완료)
| 파일 | 변경 |
|---|---|
| `app/models/models.py` | `FitType.expression` 추가, `eye` 관찰용 주석, docstring/fit_scores 주석 |
| `app/ai/scoring.py` | `ENGINE_VERSION="2"`, `SCORED_FIT_WEIGHTS` 신설 |
| `app/ai/nonverbal.py` | `score_expression()` + 표정 밴드 상수, docstring |
| `app/services/analysis.py` | 표정 채점·행 기록, session_scores 표정으로 교체(시선 제외·관찰 행은 유지) |
| `app/services/report.py` | `SCORED_FITS`·FIT_LABELS·NOT_MEASURED·`_expression_evidence`·EVIDENCE_BUILDERS·`_fit_detail_metrics`·STRENGTH_BY_BAND·빌드 루프(SCORED_FITS)·시선 관찰 카드·가중 총점·provisional 플래그 |
| `app/api/admin.py` | CSV 헤더/축 튜플 `eye→expression` (iris 관측성은 eye 유지) |
| `app/api/reports.py` | 턴 타임라인·코호트에서 관찰(eye) 제외 |
| `app/seed/demo_data.py` | FIT_LABELS `eye→expression`, 가중 총점 |
| `app/schemas/schemas.py` | 표정 필드 주석(관찰→Expression-Fit 신호) |
| `tests/` | test_scoring/test_expression(표정 점수 6종)·test_cohort_isolation(FITS)·test_analysis_correctness(축 교체 E2E) |

### mvp 프론트 (완료)
| 파일 | 변경 |
|---|---|
| `src/lib/reportFits.js`(+test) | 3번째 축 `Eye-Fit→Expression-Fit` |
| `src/App.jsx` | DEMO fit_scores 키·요약·provisional (시선 evidence는 관찰로 유지) |
| `src/components/report/Charts.jsx` | FIT_COLORS·레이더 라벨/aria 표정 (라이브 시선 링/색 유지) |
| `src/components/ui/IconGlyph.jsx` | `expression: FaceSmile` (eye 아이콘 유지) |
| `src/data/homeContent.js`·`pages/HomePage.jsx` | 홈 카드·레이더·미니차트 표정, 카드 아이콘 글리프 폴백 |
| `pages/ResultPage.jsx`·`ComparePage.jsx`·`FeedbackPage.jsx`·`components/AttractLoop.jsx` | 라벨/축 표정 |
| `styles/base·result·dashboard·feedback·attract.css` | `--fit-expression` 토큰 + `.expression` 색상 규칙(라이브 `.eye` 유지) |

### 문서 (완료)
| 파일 | 변경 |
|---|---|
| `README.md`·`poc/README.md` | 4-Fit 표·프롬프트를 표정 점수 축 + 시선 보조로 갱신 |

### 의도적으로 **유지**(시선 = 보조 신호)
- `mvp/src/lib/useFaceTracking.js`(시선·표정 신호 계산), `pages/PracticePage.jsx`
  라이브 "시선 유지" 넛지·camera-eye-chip, `Charts.jsx` EyeGlyph/LIVE_FIT_COLORS/
  RING_GLYPHS, `styles/practice-live.css`, `PreviewPage`(카메라 아이콘), `FeedbackPage`
  관찰 스텝 아이콘.

## 아직 안 함 (8/3 이후 · 본 이행 시 필요)

- [ ] **main 병합 + `mirroting.db` 재시드** (배포 시점에). 백분위/추이는 v2 표본끼리만.
- [ ] **표정축 α 검증**(Krippendorff/ICC, 한국 표정 데이터 대조) → `provisional` 해제 판단.
- [ ] **`SCORED_FIT_WEIGHTS` 정확값 확정**(설계서 ⚠️) — 현재 잠정.
- [ ] **poc/frontend(TS) 동결 해제 시** 축 정합(api/types·nonverbalCore·report/roleplay 뷰).
- [ ] **표정 리치 신호**(expression-speech sync, AU6 cheekSquint) — 프론트 캡처 추가(fast-follow).
- [ ] `rubric_version` 도입 검토(축 세트 스냅샷).
- [ ] `mvp` 홈 카드용 **표정 일러스트 PNG**(현재 FaceSmile 글리프 폴백).
- [ ] 문서 pending 주석 완화: [README.md](README.md)(색인)·[4fit-scoring-design.md](4fit-scoring-design.md) "코드 이행 전" 문구 (실제 배포 후).

## 검증 (이 브랜치)

- 백엔드 `pytest`: **323 passed** (신규 표정 점수 6 + 축 교체 E2E 1 포함).
- mvp `npm test`: **16 passed**, `npm run build`: **성공**.
