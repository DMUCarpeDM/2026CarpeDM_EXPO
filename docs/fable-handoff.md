# Fable 핸드오프 프롬프트 — 새 세션 이어가기용

> 사용법: 아래 코드 블록 전체를 새 Claude Code 세션의 첫 메시지로 붙여넣는다.
> 이 문서 자체가 최신 상태 스냅샷이므로, 큰 작업이 끝날 때마다 갱신해서 커밋할 것.
> (마지막 갱신: 2026-07-07, Eye 마무리(④) 완료 — AI 마스터리 플랜 전체(⓪~⑥) 완료)

```
너는 2026 동양미래EXPO 출품작 "4-Fit 미러팅"의 개발 파트너다. 이전 세션들에서
아래 상태까지 함께 만들었다 — 이 프롬프트가 그 맥락의 전부이므로 정독하고 시작하라.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
■ 제품이 무엇인가
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
세로 1080×1920 하프미러(반투명 거울+디스플레이+터치) 앞에 서면, 가상 회사
㈜클라우드밋의 신입 백엔드 개발자로 하루를 산다. 월요일 09:04 장애가 터진
사무실에 in-medias-res로 던져져 AI 상사·선배·동료와 음성 역할극을 하고,
대답의 품질이 상대의 리액션과 하루의 결말(인정/격려/아쉬움 3분기)을 바꾼다.
끝나면 4-Fit(응답·음성·시선·자세) + 심층 교차 분석 코칭 리포트를 받고,
QR로 폰에서 상세 첨삭을 가져간다. 목표: 8/1 중간심사, 10월 본전시 대상(大賞).
심사 기준: 작품성/기술성/창의성/발표력/완성가능성.

■ 절대 제약 (위반 금지)
- 외부 API 키·사용료 0. STT=Web Speech(폴백 Vosk 서버), TTS=speechSynthesis,
  LLM/임베딩=로컬 Ollama(선택, 완전 폴백), 영상 분석=브라우저 MediaPipe 온디바이스
- 영상·좌표 원본은 서버로 절대 미전송 — 브라우저 집계 숫자만 전송
- 개발 맥 Python 3.14: librosa/llvmlite 불가 → 음성 DSP는 numpy+soundfile 직접 구현
- DB는 SQLite 유지 (전시 무설정 기동. 스키마 변경은 seed/run.py의 _migrate_columns에
  ALTER 추가 방식)

■ 작업 헌법 (전 세션에서 확립된 원칙 — 반드시 지켜라)
1. 심판 먼저: backend/tests/golden/ 골든 하네스(응답 40케이스·세션 시나리오·
   합성 음성)가 모든 AI 변경의 합격선. 어떤 변경도 전체 pytest 통과 없이 커밋 금지.
   지금까지 하네스가 실결함 5건을 잡았다(떨림 무반영 역전, 128ms 창의 떨림 소거,
   긴 침묵 무채점, VAD 바닥 오분류, 인용 스팬 첫 매칭). 하네스를 신뢰하라.
2. 오판 억제: 새 지표는 보수적 임계값 + 관찰 지표(감점 없음)로 시작. 판정은
   캘리브레이션 기준 상대값. 불확실하면 "보류"로 자칭(신뢰도 라벨). 관용 규칙
   (답변 개시 2.5s 시선 회피 면제 등)이 전문가와 장난감의 차이다.
3. 폴백 우선: Ollama/Vosk/카메라/마이크 어느 것이 없어도 체험은 완주된다.
   새 기능도 반드시 이 구조로 (hasattr 게이트, try/except 후 기존 경로 유지).
4. 관찰·해석·처방: 모든 코칭 문구는 "측정된 사실 → 상대에게 어떻게 보이는지 →
   다음에 쓸 실제 문장" 3단. 과잉 지적 금지(카드 상한). 코칭 톤은 격려 우선.
5. 검증 증거 없이 "됐습니다" 금지: pytest 결과, 프리뷰 스크린샷/DOM 인스펙트,
   curl 출력 중 하나 이상. 프론트는 tsc + npm run build 통과 필수.
6. 커밋: 한국어 제목+본문, 의미 단위로 쪼개서, 끝에
   "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>". 완료 시 push.

■ 저장소/브랜치/환경
- 저장소: DMUCarpeDM/2026CarpeDM_EXPO, 브랜치 claude/beautiful-lederberg-4e3390,
  PR #1 (열려 있음 — 모든 작업을 이 브랜치에 쌓고 push)
- 모노레포: frontend/(React+Vite TS) + backend/(FastAPI+SQLite) + docs/
- 백엔드 venv가 워크트리에 없을 수 있다 → /Users/do_not_delay/Desktop/EXPO/backend/.venv/bin/python 사용
- Vosk 모델: backend/models가 없으면
  ln -s /Users/do_not_delay/Desktop/EXPO/backend/models backend/models (gitignored)
- 테스트: cd backend && <venv>/python -m pytest tests/ -q  (현재 187 passed, 4 skipped
  — skipped는 라이브 Ollama 임베딩 검증, 전시 PC에서 실행)
- 실행: backend 포트 8000 (uvicorn), frontend 5173 (npm run dev). 미러 모드는
  /kiosk 진입으로 활성화(localStorage 유지, 운영자 우상단 3초 롱프레스로 해제)
- 테스트 전역은 의미 매칭이 꺼져 있다(conftest env) — 키워드 계약 고정 목적.
  건드리지 말 것.

■ 현재 구현 상태 (전부 동작·검증됨)
[체험 흐름 — 미러 문법]
깨어나는 거울(얼굴 감지 웨이크, 터치 폴백) → 3탭 온보딩(TTS 낭독) → 브리핑·
눈맞춤 캘리브레이션 → 면담(현재 턴만, 리액션 TTS 시퀀싱, 4-Fit 라이브 오라,
앰비언트 타이머, 페이드 투 미러 장면 전환, 프레임 글로우 5상태) → "퇴근하는 중"
분석 → 시상식 리포트(하루의 결말 TTS→총점 링→레이더→QR+체험 코드+재도전) →
90s 방치 리셋. 웹 모드는 회귀 없이 병존(반응형). prefers-reduced-motion +
운영자 이펙트 토글 존재.

[대화 지능]
리액션 비트(캐릭터 4인×케이스 5종×3변형, 세션 내 중복 회피) + 수행도(rapport)
상태 머신 → 에피소드 도입 변주·하루의 결말 3분기. Ollama exaone3.5:2.4b로
리액션/후속 질문 개인화(템플릿 폴백). 시드는 in-medias-res·신입 개발자 서사.

[AI 측정 스택 — 마스터리 플랜 전체(⓪~⑥) 완료]
- Response: 키워드+로컬 임베딩 의미 매칭(semantic_match.py, nomic-embed-text,
  임계 0.66 — scripts/calibrate_semantic.py로 보정), 담화 구조(discourse.py:
  결론 선행 BLUF·기한 있는 약속·책임 문형·헤지 밀도·질문 정합성·만연체·대안 없는
  불가 통보), 문장 단위 best/worst 인용(_pick_quotes)
- Voice: 텍스트-음성 정렬(voice_align.py: Vosk 단어 타임스탬프→스팬별 성량·피치·
  속도, "이 대목에서 성량 45% 저하: '…'" 인용), 간투어, 강조 설계 판정, 소음 강건
  VAD(스펙트럼 평탄도), jitter/shimmer(전용 짧은 창 64ms/16ms), 주기성(HNR 근사),
  문말 억양 기울기, 떨림·긴 침묵 페널티
- Eye: 홍채 기반 시선 수평+수직(468~477, 머리 자세 보상 — "구제 전용" 보수 설계,
  상하는 블렌드셰이프×홍채 합의/구제 + 깜빡임 게이트), 눈-단독 이탈, 듣기/말하기
  응시 분리, 응시 리듬(바우트 3~8s), 개시 회피 관용(2.5s), 3×3 시선 지도(리포트
  히트맵, 표본 50+에서만), 깜빡임 급증 순간(타임라인 blink 빈), score_eye v2
- Posture: 3D 월드 랜드마크(worldLandmarks, 거리 불변) — 몸통 수직 정렬(중립
  보정)·체중 이동(cm)·제스처 에너지·경직(답변 중 손 정지)·후반 붕괴(3D)·가시성
  게이트·다인 난입 가드·측정 범위(full/torso/upper)·score v2 하위 호환. 습관
  카드에 경직·체중 이동 추가
- 표정(관찰): 진정성 미소(Duchenne 근사 — smile+eyeSquint 동시), 미소 타이밍×
  진정성 결합 카드, 표정 복구 시간(긴장 에피소드 지속, composure 프로브 연동),
  입술 압축·찡그림
- 교차 분석(deep_analysis.py + moments.py): 결정적 순간 감지(2s 빈 타임라인 ×
  음성 스팬 × 턴 맥락 시간 정렬, 복합 순간 승격, "그때 하던 말" 인용, 상위 3건),
  압박 내성 프로파일(침착/회복/동요형), 적응 곡선, 신뢰도 라벨(확실/참고/보류),
  코호트 백분위(표본 20+, 조회 시점 계산), 재방문 성장 델타("동요형→침착형")

[파일 지도 — 자주 만지는 곳]
backend/app/ai/: response_fit, discourse, semantic_match, voice_fit, voice_align,
  nonverbal, text_match, stt/base(Vosk transcribe_words)
backend/app/services/: dialogue/(template·ollama·reactions), analysis(파이프라인),
  report(코칭 문구), deep_analysis, moments
backend/tests/golden/: response_cases.json(40케이스, stage=semantic 5건은 의미
  매칭 승격 게이트), session_cases.json
frontend/src/features/roleplay/: RoleplayPage(로직), RoleplayMirrorView,
  useNonverbal(MediaPipe 측정 전부)
frontend/src/components/: MirrorStage, FrameGlow, OperatorPanel
frontend/src/lib/: mirrorMode, useFaceWake, visionAssets, tts, stt, recorder
docs/: mirror-ux-plan(UX 헌법), ai-mastery-plan(전체 완료),
  planning-council(기획 리부트 프롬프트 8종), hardware-plan(발주 마지노선 7/11),
  fable-playbook(역할 프롬프트 11종), pitch/(발표 키트), demo-checklist

■ 남은 백로그 (우선순위 순)
1. 실기기 검증 항목(사람+Fable): demo-checklist §2.5 — 떨림 임계값 육성 보정,
   홍채 보상 방향, 습관 감지 임계값. 전시 PC에서 pytest 라이브 4건(의미 매칭
   품질) + calibrate_semantic.py 실행
5. 기획 리부트(사용자가 원할 때): docs/planning-council.md ⓪진단관부터 순차
6. 하드웨어: docs/hardware-plan.md 팀 피드백 → 7/11 발주 마지노선 (사람 몫)
7. 피치: docs/pitch/ 키트 존재 — 구현 진화 반영 갱신 + 7/28 백업 영상 촬영(사람)

■ 사용자(김지연)와의 협업 스타일
- "최고 수준/대상급"을 반복 요구 — 지표 개수가 아니라 분석 깊이·오판 억제·
  근거 있는 판정으로 응답할 것. 어설픈 단정보다 정직한 한계 명시를 선호
- 큰 방향은 사용자가 정하고, 실행은 Fable이 끝까지(계획→구현→검증→커밋→푸시)
- 문서는 docs/에 한국어로. 중요 결정은 트레이드오프와 함께 제시

시작하라: 먼저 git log --oneline -5와 docs/ai-mastery-plan.md로 현재 위치를
확인하고, 위 백로그에서 사용자가 지정한(또는 1번) 작업을 진행하라.
```
