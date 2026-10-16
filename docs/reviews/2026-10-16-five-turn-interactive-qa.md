# 5턴 시뮬레이션·마이크 전환 검증

검증일: 2026-10-16

## 결과

- 지정 USB 마이크를 우선 선택하고, 없거나 연결이 실패하면 OS 기본 입력을 사용하도록 수정했다.
- 현재 준비된 시나리오는 **신입 자기소개, 회식 제안 대응 2개**다. 한 세션에 하나를 선택하고 사용자 답변 **5회** 뒤 종료한다.
- 첫 질문은 준비된 문구이며, 이후 4개 질문은 실제 OpenAI `gpt-4o`에서 생성했다. 답변에 따라 문구가 달라지는 구조는 확인했다.
- 최종 검증은 자기소개·맥락 이탈, 회식 조건 확인, 반복 거절의 3개 경로를 각 5턴 진행했다. 흐름은 모두 5번째 답변에서 종료했다.
- **대화 자연스러움은 부분 통과다.** 확인 안내·마무리 반복과 재초대가 남았으며 아래 원문에 그대로 기록했다.

## 마이크 동작

1. 장치명 `USBAudio 1.0` 중 식별자 `3634:4155`가 있는 마이크를 우선 선택한다. 식별자가 없으면 같은 장치명으로 찾는다.
2. 해당 USB가 없으면 특정 장치 ID 없이 OS 기본 마이크를 요청한다.
3. USB가 목록에 있어도 장치를 찾지 못하거나 사용할 수 없거나 연결이 시간 초과되면 OS 기본 입력을 다시 요청한다.
4. 권한 전에는 장치명이 숨겨질 수 있어, 허용 후 목록을 다시 확인한다. USB 전환에 실패하면 이미 연결된 OS 마이크를 유지한다.

OS 기본 마이크는 노트북 내장 마이크와 항상 같은 뜻은 아니다. 운영체제 입력 설정에서 선택한 장치다. 브라우저 마이크 권한을 거절하면 권한 허용이 필요하다.

실제 Chrome의 가상 오디오 장치로 없는 USB ID를 요청한 결과, `unplugged-usb-test-id → os-default` 순서로 요청하고 기본 입력 트랙이 `live` 상태가 됐다. 정상 장치는 한 번만 요청했다. 물리적 USB를 뽑는 현장 시험과 사람의 실제 음성 인식 시험은 이번 검증에 포함하지 않았다.

## AI에 들어가는 정보

현재 코드의 후속 질문 생성은 다음 정보를 함께 보낸다.

- 상대 선배의 성격, 대화 목적과 동기
- 장면에서 알고 있는 사실과 모르는 사실
- 첫 질문 및 참고용 준비 질문
- 같은 장면에서 실제로 주고받은 AI 질문과 사용자 답변 전체
- 현재 확인해야 하는 용건

따라서 모든 후속 대사가 미리 정해진 문자열은 아니다. AI 출력은 고정 문구로 교체하지 않고 그대로 사용한다. 출력 내용의 자연스러움은 모델의 지시 준수에 따라 달라질 수 있다.

이번에 모르는 회식 시간·장소를 추측하지 않기, 이미 답한 소개를 다시 요구하지 않기, 조건 확인과 거절을 구분하기, 무관한 코드 요청에 원래 용건으로 돌아오기 등의 프롬프트를 보강했다. 출력문을 하드코딩하는 분기는 추가하지 않았다.

## 시험 범위와 5턴의 의미

각 표의 한 행은 **AI 한 번 발화 → 사용자 한 번 답변**이다. 첫 발화는 준비된 첫 대사, 2~5번째 발화는 실제 GPT-4o 응답이다. 다섯 번째 사용자 답변 후 `finished=true`가 되고 여섯 번째 AI 발화는 생성하지 않는다.

사용자 답변은 검증용 가상 입력이다. 실사용자의 대화·카메라·음성은 전송하지 않았다. 운영 코드의 장면 초기화, 진행 함수, 실제 대화 제공자를 사용했으며 STT·TTS·점수 모델을 포함한 전체 UI 종단 시험은 아니다. 첫 질문의 기존 사전 음성 경로는 바꾸지 않았으며 이 시험에서 음성 파일 재생 자체를 검증한 것은 아니다.

프롬프트 수정 전후 비교를 위해 같은 가상 답변을 재사용했다. 따라서 모델 응답이 달라지면 미리 쓴 사용자 답변이 새 응답과 완전히 맞지 않을 수 있다. 특히 반복 거절 경로의 두 번째 답변은 AI가 이번 실행에서 제안하지 않은 ‘잠깐 들르기’를 선제적으로 거절한다. 이를 전부 AI의 맥락 오류로 계산하지 않는다.

## 최종 대화 원문

### 1. 자기소개·맥락 이탈 후 복귀

| 턴 | AI 실제 대사 | 사용자 가상 답변 |
|---|---|---|
| 1 | 오늘부터 출근이죠? 스탠드업 시작 전에 팀원들에게 짧게 자기소개하고, 오늘 하루 목표 한 가지만 말해주세요. | 안녕하세요. 저는 김민수입니다. 담당 업무는 아직 정해지지 않았어요. |
| 2 | 오늘 목표는 뭐예요? 한 가지만 구체적으로 말해봐요. | 팀 일을 아직 잘 모르는데, 첫날 목표로 어떤 걸 잡는 게 좋을까요? |
| 3 | 팀 일을 아직 모르니, 첫날에는 팀원들 이름 외우기나 회사 시스템 익히기 같은 작은 목표를 잡아보면 어때요? | 그런데 파이썬으로 피보나치 수열을 출력하는 코드를 짜 주세요. |
| 4 | 지금은 파이썬 코드 작성이 내 역할이 아니에요. 오늘 목표 한 가지만 정해보면 좋겠어요. 예를 들어 팀원들 이름 외우기나 회사 시스템 익히기 같은 작은 목표도 괜찮아요. | 코드 이야기는 그만할게요. 오늘 목표는 팀원들께 인사하고 기본 업무 절차를 배우는 것입니다. |
| 5 | 목표를 정했네요. 팀원들께 인사하고 기본 업무 절차 배우는 것 좋습니다. | 네, 오늘은 인사와 기본 절차 익히기부터 시작하겠습니다. |

판정: 이름을 다시 묻지 않고 남은 목표를 물었으며, 파이썬 코드를 생성하지 않고 원래 목적에 돌아왔다. 다만 4번째 AI 발화는 3문장으로 길고 “내 역할이 아니에요”라는 표현이 다소 기계적이다.

### 2. 회식 시간 확인 후 불참

| 턴 | AI 실제 대사 | 사용자 가상 답변 |
|---|---|---|
| 1 | 오늘 고생했다고 팀장님이 회식 쏘신대요! 첫날인데 같이 갈 거죠? 부담되면 빠져도 된다고는 하셨어요. | 회식은 몇 시에 시작하나요? 제가 오늘 여덟 시에는 나가야 해서요. |
| 2 | 회식 시작 시간은 아직 모르겠어요. 확인해 보고 알려줄게요. 만약 시간이 맞으면 잠깐이라도 얼굴 보러 오는 건 어때요? | 잠깐 참석하기 전에 시작 시간이 정해졌는지부터 알고 싶어요. |
| 3 | 시작 시간이 정해지면 바로 알려줄게요. 미정이라면 결정될 때까지 기다려 주세요. | 시작 시간을 모르면 지금 참석을 확답하기 어렵습니다. 확인한 뒤 알려주시겠어요? |
| 4 | 확인한 뒤 알려줄게요. 결정될 때까지 기다려 주세요. | 생각해 보니 오늘은 일정이 겹쳐서 참석하지 못하겠습니다. |
| 5 | 알겠어요. 오늘 일정이 겹쳤다면 다음 기회에 함께해요. | 오늘은 불참으로 전달해 주세요. 감사합니다. |

판정: 최종 실행에서는 없는 회식 시각을 만들어내지 않았다. 하지만 2번째 발화에서 조건 확인 중 참석을 권하고, 3~4번째 발화에서 같은 안내를 반복했다. 5번째 발화의 “다음 기회에 함께해요”도 재초대를 피하라는 지시를 지키지 못했다.

### 3. 반복 거절·개인 일정 비공개

| 턴 | AI 실제 대사 | 사용자 가상 답변 |
|---|---|---|
| 1 | 오늘 고생했다고 팀장님이 회식 쏘신대요! 첫날인데 같이 갈 거죠? 부담되면 빠져도 된다고는 하셨어요. | 초대는 감사하지만 오늘은 개인 일정이 있어서 참석하기 어렵습니다. |
| 2 | 그럼 다음에 기회 되면 같이 해요. | 잠깐 들르는 것도 어렵습니다. 오늘은 불참하겠습니다. |
| 3 | 알겠어요. 다음에 기회 되면 봐요. | 개인 일정의 자세한 내용은 밝히고 싶지 않습니다. |
| 4 | 알겠어요. 개인 일정은 비공개로 하세요. | 불참으로 전달해 주세요. 이후에 다시 참석을 권하지 않으셨으면 좋겠습니다. |
| 5 | 알겠어요. 이후로는 참석 권하지 않을게요. | 네, 이해해 주셔서 감사합니다. |

판정: 개인 일정의 이유를 캐묻지 않았고 명시적인 재권유 금지 요청에는 동의했다. 그러나 첫 거절에 즉시 마무리했고 다음 기회를 언급하는 문장도 반복했다. “개인 일정은 비공개로 하세요”는 사용자의 경계를 명령처럼 표현해 어색하다.

## 남은 문제와 해석

- 초기 재시험에서는 알려주지 않은 회식 시각을 “여섯 시쯤”이라고 만든 사례가 있었다. 알려진 사실과 모르는 사실을 명시한 뒤 최종 표본에서는 발생하지 않았지만, 한 차례의 통과가 항상 정확함을 보장하지 않는다.
- 회식 참석 여부는 짧은 대화로 끝날 수 있다. 사용자가 이미 거절했는데도 횟수를 5회로 고정하면 할 말이 없어 마무리 문장이 반복될 수 있다. 현재 요청한 5회는 유지했으며, 조기 종료는 추가하지 않았다.
- ‘첫 거절에는 한 번 더 제안’과 ‘반복 거절 뒤에는 더 권하지 않음’을 모델이 일관되게 구분하지 못했다. 프롬프트 보강 후에도 남는 문제다. 따라서 후속 응답 전체가 자연스럽다고 결론 내리지는 않는다.
- 이번 작업은 입력 장치·대화 진행·응답 맥락 확인이다. 거절 시 감점 여부나 표정·음성 점수 정확도는 이번 실시간 시험의 통과 항목이 아니다.

## 코드 검증

| 검증 | 결과 |
|---|---|
| 마이크 선택·실패 전환·권한 거절·미디어 시간 초과 테스트 | 13개 통과 |
| 고정 시나리오·전시 시나리오 API/진행 테스트 | 16개 통과 |
| 실제 Chrome + 가상 오디오 장치 | USB 실패 뒤 기본 장치 트랙 연결 확인 |
| 프런트엔드 production build | 통과, 기존 청크 크기 경고 |
| git diff --check | 통과 |

검증 명령:

```sh
# mvp
node --test src/lib/microphoneInput.test.js src/lib/mediaRequest.test.js
npm run build

# poc/backend
.venv/bin/python -m pytest -q tests/test_workplace_exhibition.py tests/test_fixed_workplace_scene.py
```

최신 설정으로 백엔드를 재시작했고 백엔드·프런트엔드 HTTP 200 응답을 확인했다.

새 5턴 계획은 새 세션에 적용된다. 이미 시작한 세션은 생성 당시 계획을 저장하므로 새로고침 후 첫 화면에서 다시 시작해야 한다.

## 원시 로그

수정 전, 중간 재시험 2회, 최종 시험을 모두 보존했다. 성공한 문구만 골라서 대화 원문을 다시 쓰지 않았다. 저장 위치: `output/qa/2026-10-16-five-turn/`.

- [mirror-five-dinner-attempt2.json](</Users/yanghyojae/Documents/Expo Design/_workspace/mirror-qa-20261009/output/qa/2026-10-16-five-turn/mirror-five-dinner-attempt2.json>)
- [mirror-five-dinner-attempt3.json](</Users/yanghyojae/Documents/Expo Design/_workspace/mirror-qa-20261009/output/qa/2026-10-16-five-turn/mirror-five-dinner-attempt3.json>)
- [mirror-five-dinner-final.json](</Users/yanghyojae/Documents/Expo Design/_workspace/mirror-qa-20261009/output/qa/2026-10-16-five-turn/mirror-five-dinner-final.json>)
- [mirror-five-dinner.json](</Users/yanghyojae/Documents/Expo Design/_workspace/mirror-qa-20261009/output/qa/2026-10-16-five-turn/mirror-five-dinner.json>)
- [mirror-five-intro-attempt2.json](</Users/yanghyojae/Documents/Expo Design/_workspace/mirror-qa-20261009/output/qa/2026-10-16-five-turn/mirror-five-intro-attempt2.json>)
- [mirror-five-intro-attempt3.json](</Users/yanghyojae/Documents/Expo Design/_workspace/mirror-qa-20261009/output/qa/2026-10-16-five-turn/mirror-five-intro-attempt3.json>)
- [mirror-five-intro-final.json](</Users/yanghyojae/Documents/Expo Design/_workspace/mirror-qa-20261009/output/qa/2026-10-16-five-turn/mirror-five-intro-final.json>)
- [mirror-five-intro.json](</Users/yanghyojae/Documents/Expo Design/_workspace/mirror-qa-20261009/output/qa/2026-10-16-five-turn/mirror-five-intro.json>)
- [mirror-five-refusal-attempt2.json](</Users/yanghyojae/Documents/Expo Design/_workspace/mirror-qa-20261009/output/qa/2026-10-16-five-turn/mirror-five-refusal-attempt2.json>)
- [mirror-five-refusal-attempt3.json](</Users/yanghyojae/Documents/Expo Design/_workspace/mirror-qa-20261009/output/qa/2026-10-16-five-turn/mirror-five-refusal-attempt3.json>)
- [mirror-five-refusal-final.json](</Users/yanghyojae/Documents/Expo Design/_workspace/mirror-qa-20261009/output/qa/2026-10-16-five-turn/mirror-five-refusal-final.json>)
- [mirror-five-refusal.json](</Users/yanghyojae/Documents/Expo Design/_workspace/mirror-qa-20261009/output/qa/2026-10-16-five-turn/mirror-five-refusal.json>)
