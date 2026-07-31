# 팀장 영상 클립 제작 가이드

김서윤 팀장의 추가 클립(다독임·아쉬움·결말 3종)을 기존 4클립과 톤을 맞춰 만드는 방법.

## 전제: 팀장은 AI 생성 인물이다

- 기존 4클립(듣기·말하기·긍정·부정, 2026-07-26 추가)은 배우 촬영이 아니라 **원본 초상화 1장을
  이미지→영상 AI로 움직인 것**이다. 근거: 긍정 클립의 원본 파일명이
  `text_Keep_the_exact_identit2.mp4`(생성 도구가 프롬프트로 자동 명명), 초상화 우하단 생성 도구
  워터마크(✦).
- 원본 초상화는 리포에 있다: `mvp/src/assets/team-lead-video-portrait.png` (1280×720).
  **새 클립도 반드시 이 이미지(또는 아래의 듣기 클립 정지컷)에서 시작해야 동일 인물이 유지된다.**
- 최초 제작자는 hyojae04 — **어떤 도구를 썼는지 먼저 확인**하고 같은 도구를 쓰는 것이 색감·모션
  결이 가장 잘 맞는다. 도구의 생성 히스토리가 남아 있으면 같은 캐릭터로 즉시 이어 만들 수 있다.

## 제작 절차

1. **소스 이미지 준비** — 두 가지 중 하나.
   - 기본: `team-lead-video-portrait.png` 그대로 사용.
   - 권장(전환이 더 자연스러움): 듣기 클립에서 정지컷을 뽑아 소스로 쓴다. 리액션 클립은 재생이
     끝나면 듣기 화면으로 돌아가므로, 듣기 자세에서 시작·종료하는 클립이 이음새 없이 붙는다.
     ```bash
     ffmpeg -i mvp/src/assets/team-lead-videos/team-lead-listening.mp4 -ss 0.5 -frames:v 1 listening-still.png
     ```
     (ffmpeg 없으면 `winget install ffmpeg`)
2. **이미지→영상 생성** — Kling·Hailuo(MiniMax)·Runway·Veo 등 이미지→영상 도구에 소스 이미지 업로드
   후 아래 프롬프트 사용. 10초, 무음. **카메라 고정이 필수**(기존 클립이 웹캠 고정 프레임 톤).
   시작/끝 프레임을 각각 지정할 수 있는 도구(Kling 등)라면 둘 다 듣기 정지컷으로 지정하면
   완벽한 루프가 된다.
3. **후보 2~3개 생성 후 선별** — 표정 과장·손 등장·배경 왜곡이 없는 컷을 고른다.
4. **후처리** — 10초 컷, 음성 제거, 기존과 같은 규격(≈2.5MB)으로 압축:
   ```bash
   ffmpeg -i 생성본.mp4 -an -t 10 -c:v libx264 -b:v 2M -vf scale=1280:720 -movflags +faststart team-lead-reassure.mp4
   ```
5. **루프 검수** — 반복 재생으로 이음새 확인. 리액션류(다독임·아쉬움)는 시작·끝이 듣기 자세와
   이어지는지 본다.

## 클립별 프롬프트 (복붙용)

모든 프롬프트 앞에 공통 프리픽스를 붙인다 (인물·복장·배경 고정 + 카메라 고정):

> Keep the exact same identity, face, hairstyle, beige blazer, and blurred office background.
> Static camera, webcam framing, chest-up, no camera movement. Subtle natural motion only.

| 파일명 | 용도 | 동작 프롬프트 |
| --- | --- | --- |
| `team-lead-reassure.mp4` | 긴장 인지 다독임 (S-EXPR-ACK) | She gives a gentle, warm, reassuring smile with soft kind eyes and one slow small nod, as if comforting a nervous junior colleague. Starts and ends in a neutral attentive listening pose. |
| `team-lead-puzzled.mp4` | missing/short 아쉬움·갸웃 | She tilts her head slightly with a puzzled, mildly disappointed expression, brows drawn a little, lips pressed briefly, then returns to a neutral attentive listening pose. |
| `team-lead-ending-high.mp4` | 결말 · 인정 | She smiles with warm approval and nods once, proud and satisfied, like wrapping up a good workday with a trusted teammate. |
| `team-lead-ending-mid.mp4` | 결말 · 격려 | She gives an encouraging soft smile with a slight nod, supportive and warm, like telling a junior colleague they did okay today. |
| `team-lead-ending-low.mp4` | 결말 · 아쉬움 | She exhales lightly with a calm, slightly disappointed but composed expression, then offers a faint supportive smile. |

우선순위: ① reassure(새 표정 인지 기능의 시각 완성) → ② puzzled(부족한 답변 무반응 구멍) →
③ ending 3종(리포트 화면 강화, 선택).

## 시연 영상용 발화(speaking) 변주 클립

시연 영상(8/4 선정심사, docs/demo-video-script.md)에서 팀장 발화 장면은 S6 풀스크린 질문·S8 반응
발화 포함 5턴 내내 반복 노출된다. 현재 speaking 클립이 1개뿐이라 같은 입모양 루프가 계속 보이므로,
톤별 변주를 만들어 장면마다 다르게 쓴다. 공통 프리픽스는 위와 동일하고, 발화 클립은 앱에서
루프 재생되므로 **10초 내내 끊기지 않고 말하는 상태**로 뽑는 것이 원칙이다(끝에 멈추는 컷은
편집 전용).

공통 프리픽스에 발화용 한 줄을 추가한다:

> She is talking naturally in Korean with varied, realistic mouth movements — no exaggerated jaw,
> natural blinks, subtle head movement while speaking.

| 파일명 | 장면 | 동작 프롬프트 |
| --- | --- | --- |
| `team-lead-speaking-calm.mp4` | S6 기본 질문 (풀스크린 히어로 컷) | She speaks calmly and clearly like a busy but composed team leader asking a work question, occasional small nods, professional neutral expression, talking continuously for the whole clip. |
| `team-lead-speaking-explain.mp4` | 긴 질문·브리핑 턴 | She explains something in a measured, matter-of-fact tone, slight head tilts while making points, composed and attentive, talking continuously. |
| `team-lead-speaking-firm.mp4` | S9 대비 시연 후속 (부족한 답변 뒤) | She speaks briskly and firmly, direct and slightly stern, brows subtly engaged, no smile, short decisive mouth movements, talking continuously. |
| `team-lead-speaking-warm.mp4` | S8 반응 발화 (칭찬·표정 인지 한마디) | She speaks with a light warm smile between phrases, approving and encouraging tone, soft eyes, one small nod, talking continuously. |
| `team-lead-speaking-ask.mp4` | 질문 마침 → 답변 대기 (편집 컷 포인트) | She finishes asking a short question in the first 6 seconds, then stops talking and looks at the camera attentively, waiting for an answer with a neutral expectant expression. |

- **히어로 컷은 립싱크가 최선**: S6처럼 팀장이 크게 잡히는 컷은, 립싱크 기능이 있는 도구
  (Kling 립싱크, HeyGen, Hedra 등)에 **앱 TTS로 읽힌 실제 질문 대사 음성**을 넣어 입을 맞추면
  체감이 완전히 달라진다. PiP 크기 컷은 위 일반 발화 변주로 충분하다.
- 변주 클립을 앱이 턴마다 돌아가며 재생하게 하는 배선(랜덤 로테이션)은 코드 몇 줄이다 —
  파일이 준비되면 요청할 것. 그러면 편집 합성 없이 화면 녹화만으로 변주가 찍힌다.

## 주의

- **워터마크**: 전시 출품작이므로 워터마크 없는 플랜/도구로 출력한다(기존 초상화에는 우하단
  워터마크가 남아 있다 — 교체 기회에 함께 정리하면 좋다).
- **인물 일관성이 전부다**: 프롬프트의 "Keep the exact same identity ..." 줄을 지우지 말 것.
  다른 도구를 쓰면 색감이 달라질 수 있으니 한 클립 먼저 뽑아 기존 클립과 나란히 비교한다.
- 완성본은 `mvp/src/assets/team-lead-videos/`에 위 파일명으로 넣는다. 상태 머신 연결
  (`turnSignals.expression`→reassure, missing/short→puzzled, 결말→ResultPage)은 코드 작업이
  별도로 필요하다 — 파일이 준비되면 요청할 것.
