# IRIS 라이선스

**IRIS는 GNU General Public License v3.0 이상(GPL-3.0-or-later)으로 배포됩니다.**

- 라이선스 전문: 저장소 루트 [`LICENSE`](LICENSE)
- SPDX 식별자: `GPL-3.0-or-later`
- 저작권: `Copyright (C) 2026 IRIS Project Contributors`

이 문서는 **왜 GPL-3.0-or-later인지**, 그리고 **이 저장소가 참조하는 서드파티
라이선스들과 어떻게 충돌 없이 맞물리는지**를 정리합니다.

---

## 1. 결론 요약

| 질문 | 답 |
|------|-----|
| 프로젝트 전체 라이선스 | **GPL-3.0-or-later** |
| MIT / Apache-2.0 가능한가 | **불가능** — PyQt6가 GPL-3.0-only |
| 왜 "가장 개방적"인가 | GPLv3 제약 아래에서 선택 가능한 것 중 가장 허용적. AGPL·비공개·비상업 조항 없음 |
| 서드파티 충돌 | **없음** — 모든 의존성이 GPLv3 호환 (아래 §3) |
| 더 개방적으로 가려면 | PyQt6 → PySide6(LGPL-3.0) 전환이 유일한 경로 (§5) |

---

## 2. GPL-3.0-or-later를 고른 이유

### 2.1 PyQt6가 GPL-3.0-only이다 — 이것이 결정 요인

IRIS의 UI 전체(`iris/ui/`)는 PyQt6 위에 올라가 있습니다. 설치된 패키지
메타데이터가 명시적으로 밝히는 라이선스는 다음과 같습니다.

```
# .venv/Lib/site-packages/pyqt6-6.11.0.dist-info/METADATA
License-Expression: GPL-3.0-only

# .venv/Lib/site-packages/pyqt6_webengine-6.11.0.dist-info/METADATA
License-Expression: GPL-3.0-only
```

PyQt6는 Riverbank Computing의 **듀얼 라이선스** 제품입니다 — GPL v3, 또는 유료
상업 라이선스. 상업 라이선스를 구매하지 않은 이상 GPL v3 조건이 적용되며,
PyQt6를 import하는 응용 프로그램은 GPL v3에서 말하는 **결합 저작물(combined work)**
로 취급됩니다. 따라서 IRIS를 배포하려면 GPL v3와 호환되는 조건이어야 합니다.

> 참고: 하위 런타임 패키지 `PyQt6-Qt6`/`PyQt6-WebEngine-Qt6`(Qt 라이브러리 본체)는
> LGPL v3이지만, 파이썬 바인딩인 `PyQt6` 자체가 GPL v3입니다. 우리 코드가 직접
> import 하는 것은 바인딩 쪽이므로 더 강한 쪽인 GPL v3가 적용됩니다.

### 2.2 이론이 아니라 실제 배포에 걸린다

이 저장소는 **빌드된 바이너리를 직접 배포**합니다.

- `dist/IRIS.exe` — Git LFS로 커밋된 PyInstaller 산출물 (약 540MB)
- `IRIS.spec` — 해당 빌드 스펙

이 exe 안에는 PyQt6와 Qt 런타임이 함께 번들되어 있습니다. 즉 IRIS는 "소스만
공개하는 프로젝트"가 아니라 GPL 대상 코드를 포함한 실행 파일을 재배포하는
프로젝트이며, GPL v3 §6(비소스 형태 배포 시 대응 소스 제공 의무)이 그대로
적용됩니다. 저장소가 공개되어 있으므로 이 의무는 충족됩니다.

### 2.3 "가장 개방적"의 의미

교수님 피드백의 요구는 *"거버넌스로 충돌이 되지 않는 가장 개방적인 라이선스"*
였습니다. PyQt6 제약을 만족하는 라이선스 집합 안에서:

| 후보 | 판정 |
|------|------|
| MIT, Apache-2.0, BSD | ❌ PyQt6 GPL-3.0-only와 충돌 (배포 시) |
| LGPL-3.0 | ❌ PyQt6는 LGPL이 아니라 GPL — 약한 카피레프트로 못 내려감 |
| **GPL-3.0-or-later** | ✅ **채택** — 조건을 만족하는 것 중 가장 허용적 |
| GPL-3.0-only | △ 가능하지만 미래 버전 선택권을 스스로 없앰 |
| AGPL-3.0 | ❌ 네트워크 사용까지 소스 공개를 요구 — 더 폐쇄적 |
| 비상업/연구용 커스텀 | ❌ OSI 비승인, 오픈소스가 아님 |

`-or-later`를 붙이면 이후 FSF가 GPL v4를 발표했을 때 이용자가 그 조건을 택할 수
있어, 같은 카피레프트 강도에서 더 개방적입니다.

### 2.4 프로젝트 목표와도 맞는다

IRIS는 "구독료 없이 누구나 쓰는 로컬 우선 AI 에이전트"를 지향합니다. GPLv3는
포크·개작·재배포를 모두 허용하되 그 결과물도 같은 자유를 유지하도록 강제하므로,
프로젝트가 내건 접근성·격차 완화 목표와 방향이 일치합니다.

---

## 3. 서드파티 라이선스 인벤토리

아래 표는 이 저장소의 `requirements*.txt`와 실제 설치된 패키지 메타데이터
(`.venv`, `.venv-voice`의 `*.dist-info/METADATA`)에서 확인한 값입니다.

### 3.1 핵심 런타임 (`requirements.txt`)

| 패키지 | 라이선스 | GPLv3 호환 |
|--------|----------|:---:|
| PyQt6, PyQt6-WebEngine | **GPL-3.0-only** | ✅ (제약의 근원) |
| PyQt6-Qt6, PyQt6-WebEngine-Qt6 | LGPL-3.0 | ✅ |
| PyQt6-sip | BSD-2-Clause | ✅ |
| psutil | BSD-3-Clause | ✅ |
| mss | MIT | ✅ |
| Pillow | MIT-CMU (HPND) | ✅ |
| Markdown | BSD-3-Clause | ✅ |
| python-dotenv | BSD-3-Clause | ✅ |
| PyYAML | MIT | ✅ |
| **pynput** | **LGPL-3.0** | ✅ |
| opencv-python-headless | Apache-2.0 | ✅ (일방향: → GPLv3 가능) |
| numpy | BSD-3-Clause 외 | ✅ |
| onnxruntime | MIT | ✅ |
| openai (SDK) | Apache-2.0 | ✅ |
| anthropic (SDK) | MIT | ✅ |
| pypdf | BSD-3-Clause | ✅ |
| pytesseract | Apache-2.0 | ✅ |
| PyMuPDF | **AGPL-3.0 OR Commercial** | ✅\* (무료 휠=AGPL; GPL-3와 결합 가능 — 스캔 리포트 참고) |
| comtypes | MIT | ✅ |
| pywin32 | PSF-2.0 | ✅ |
| pyobjc-framework-* | MIT | ✅ |

\* 상세: [`docs/검증/license-scan-report.md`](docs/검증/license-scan-report.md) · 고지: [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)

### 3.2 선택 음성 런타임 (`services/voice_runtime/requirements-voice*.txt`)

| 패키지 | 라이선스 | 비고 |
|--------|----------|------|
| **mutagen** | **GPL-2.0-or-later** | ✅ `or later` 이므로 GPLv3 선택 가능. **GPL-2.0-only 프로젝트였다면 여기서 충돌했을 항목** |
| **soxr** | **LGPL-2.1-or-later** | ✅ GPLv3 호환 |
| certifi, orjson, tqdm | MPL-2.0 (일부 듀얼) | ✅ MPL-2.0은 GPL 호환(2차 라이선스 조항) |
| fastapi, pydantic, faster-whisper, ctranslate2, librosa(ISC), einops | MIT / ISC | ✅ |
| av (PyAV) | BSD-3-Clause | ✅ (번들 FFmpeg 빌드 구성은 §4.2 참고) |
| soundfile, uvicorn, starlette, torch, torchaudio, scipy, pandas | BSD 계열 | ✅ |
| transformers, accelerate, huggingface_hub, safetensors, tokenizers, gradio | Apache-2.0 | ✅ |
| **qwen-tts** | Apache-2.0 | ✅ 코드 기준. **모델 가중치는 별도 조건** — §4.1 |
| **faster-qwen3-tts** | **MIT** | ✅ PyPI License-Expression 실측 (0.3.2, 2026-09-23) |

### 3.3 벤더링된 코드

| 경로 | 출처 | 라이선스 |
|------|------|----------|
| `integrations/showui-aloha/` | [showlab/ShowUI-Aloha](https://github.com/showlab/ShowUI-Aloha) | **Apache-2.0** (원문 `integrations/showui-aloha/LICENSE` 동봉, `UPSTREAM.md`에 출처 명시) |

Apache-2.0 → GPLv3는 **일방향 호환**입니다. Apache-2.0 코드를 GPLv3 저작물에
포함하는 것은 허용되며, 그 결과물 전체는 GPLv3로 배포됩니다. Apache-2.0의
저작권·고지 보존 의무를 지키기 위해 원본 `LICENSE`와 `UPSTREAM.md`는 삭제하지
말고 그대로 두어야 합니다.

또한 ShowUI-Aloha 업스트림은 **PySide6(LGPL-3.0)** 를 씁니다. IRIS는 이를
같은 프로세스에 import하지 않고 `AlohaBridge`로 **별도 프로세스에서 실행**하므로
Qt 바인딩 충돌과 라이선스 결합 범위가 함께 분리됩니다.

### 3.4 런타임에 연동하되 번들하지 않는 것

이들은 IRIS가 **설치·기동·HTTP 호출**만 하고 소스를 포함하지 않으므로, 각자의
라이선스가 IRIS 코드에 전파되지 않습니다.

| 대상 | 관계 | 라이선스 |
|------|------|----------|
| [Ollama](https://ollama.com/) | 별도 프로세스, `:11434` HTTP | MIT |
| [Hermes Agent](https://hermes-agent.nousresearch.com/) | 별도 프로세스, `:8642` gateway API | 업스트림 조건 |
| Silero VAD (`silero_vad.onnx` v5.1.2) | 최초 실행 시 `~/.iris-light/models/`로 **다운로드** — 저장소에 미포함 | MIT |
| Android 에뮬레이터 / mobile-mcp / Node.js | 선택 설치 | 각 업스트림 |
| 클라우드 모델 API (OpenAI, Anthropic 등) | 네트워크 호출 | 각 서비스 약관 |

---

## 4. 코드 라이선스와 별개로 다뤄야 하는 것

GPLv3는 **소프트웨어**에 적용됩니다. 아래 항목은 별도 판단이 필요합니다.

### 4.1 모델 가중치

`qwen-tts` 패키지 코드는 Apache-2.0이지만, 다운로드되는 **모델 가중치는 배포처
(Hugging Face 등)의 모델 라이선스**를 따릅니다. IRIS 저장소는 어떤 모델 가중치도
포함하지 않으며, 모두 사용자 PC에서 실행 시 내려받습니다. 가중치를 저장소에
커밋하려는 경우 해당 모델 카드의 조건을 먼저 확인해야 합니다.

### 4.2 FFmpeg (PyAV 경유)

`av` 패키지 자체는 BSD-3-Clause지만 휠에 FFmpeg 라이브러리를 포함합니다. FFmpeg는
빌드 구성에 따라 LGPL-2.1+ 또는 GPL-2.0+입니다. IRIS 전체가 GPL-3.0-or-later이므로
LGPL 구성은 문제가 없고, GPL-2.0-**only** 구성 FFmpeg만 피하면 됩니다. PyPI 공식
`av` 휠은 LGPL 구성입니다.

### 4.3 음성 녹음 데이터 (⚠ 중요)

`1차 아이리스 녹음/`, `2차 아이리스 녹음 A-B/`, `2차 아이리스 녹음 C-H/` 및
여기서 파생된 보이스 프로필은 **실제 사람의 음성**입니다.

- 현재 `.gitignore`가 `*.wav`, `*.m4a`, `*.mp3`, `voice_models/` 등을 제외하고
  있어 **저장소에 커밋되어 있지 않습니다.** (`git ls-files` 확인 결과 0건)
- 이 데이터는 GPLv3의 대상이 아니며, **성우 본인의 이용 동의 범위**를 따릅니다.
- 공개 저장소에 음성 원본이나 학습된 보이스 프로필을 올리려면 별도 동의와
  데이터 라이선스(예: CC BY-NC-SA 또는 비공개 유지) 표기가 선행되어야 합니다.
- 현 상태 유지(미커밋)를 권장합니다.

### 4.4 문서·에셋

`docs/`, `obsidian-vault/`, `assets/`의 문서와 이미지는 별도 표기가 없는 한
프로젝트 저작권자에게 귀속되며, 코드와 함께 GPL-3.0-or-later로 제공됩니다.

---

## 5. 더 개방적인 라이선스로 가고 싶다면

MIT/Apache-2.0로 가는 **유일한 경로**는 GPL 의존성을 제거하는 것입니다.

| 단계 | 내용 | 난이도 |
|------|------|--------|
| 1 | PyQt6 → **PySide6**(LGPL-3.0, Qt 공식 바인딩)로 전환 | 높음 — UI 전 모듈의 import·시그널 문법 수정, `IRIS.spec` 재작성, 빌드 재검증 |
| 2 | pynput(LGPL-3.0) → 동적 링크 유지 또는 대체 | 중간 — LGPL은 동적 링크 시 전파되지 않으나 PyInstaller 번들은 별도 검토 필요 |
| 3 | mutagen(GPL-2.0+) → `tinytag`(MIT) 등으로 교체 | 낮음 — 오디오 메타데이터 읽기 용도뿐 |
| 4 | 재검증 후 Apache-2.0 전환 | — |

**현재 제출 일정 기준으로는 권장하지 않습니다.** 1번만으로도 UI 전체 회귀
테스트가 필요하고, ShowUI-Aloha가 이미 PySide6를 쓰기 때문에 지금 프로세스
분리로 피해 둔 Qt 바인딩 충돌을 다시 설계해야 합니다.

---

## 6. IRIS IDE (Eclipse Theia, optional)

`integrations/iris-ide/`는 **선택 설치** optional runtime입니다. IRIS IDE를
설치하지 않으면 Node.js/Theia는 내려받지 않습니다.

| 구성요소 | 라이선스 | 비고 |
|----------|----------|------|
| Eclipse Theia 1.74.x | **EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0** | `@theia/*` npm packages |
| Monaco Editor (Theia 경유) | MIT | Theia transitive |
| Open VSX / VS Code extension host (Theia) | 각 확장 라이선스 | `@theia/plugin-ext-vscode`, `@theia/vsx-registry` |

Theia는 IRIS Python 앱과 **별도 Node 프로세스**로 `127.0.0.1`에서만 동작합니다.
About/Third-party notices에서 Eclipse Theia 사용 사실과 라이선스를 숨기지 않습니다.

---

## 7. 배포 전 체크리스트

- [x] 루트에 `LICENSE` (GPL v3 전문) 존재
- [x] 루트에 `LICENSE.md` (본 문서) 존재
- [x] README 라이선스 섹션이 실제 라이선스와 일치
- [x] 벤더링 코드의 원본 `LICENSE`·출처 표기 보존 (`integrations/showui-aloha/`)
- [x] 음성 원본 데이터 미커밋 상태 확인
- [x] `faster-qwen3-tts` 업스트림 라이선스 최종 확인 (§3.2) — **MIT** (2026-09-23 실측)
- [x] `dist/IRIS.exe` / `IRIS-Setup.exe` 배포 시 대응 소스 위치 명시 — 본 저장소
  `https://github.com/kwakminoo/Project-IRIS-Light` (`docs/installer-release.md` §대응 소스)

---

## 8. 기여자에게

이 저장소에 PR을 보내면 해당 기여는 **GPL-3.0-or-later**로 제공하는 데 동의하는
것으로 간주합니다. 새 의존성을 추가할 때는 다음을 지켜 주세요.

- **금지**: GPL-3.0 비호환 라이선스 — 독점/비공개 라이선스, GPL-2.0-**only**
  (`or later` 없음), CC BY-**NC** 계열, "연구용/비상업용" 커스텀 조건
- **주의**: 새 카피레프트 의존성을 넣었다면 §3 표에 한 줄 추가
- **필수**: 코드를 벤더링할 때는 원본 `LICENSE`와 출처를 함께 커밋
  (`integrations/showui-aloha/` 방식을 따를 것)
