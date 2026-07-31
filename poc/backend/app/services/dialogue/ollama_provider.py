"""로컬 Ollama 대화 엔진 — 역할과 난이도에 맞춰 질문을 만든다.

설계 (기획서 '하이브리드 콘텐츠' + 리스크 대응 그대로):
- 에피소드 진행/종료 판단은 템플릿 엔진이 담당한다.
- 모든 화면에 보이는 질문은 Ollama가 역할·난이도·직전 답변에 맞게 만든다.
- Ollama가 꺼졌거나 응답 형식이 맞지 않으면 세션을 시작하거나 다음 턴으로 진행하지 않는다.

API 키 불필요: Ollama는 로컬에서 실행되는 오픈소스 런타임이다.
  설치: https://ollama.com  → `ollama pull exaone3.5:2.4b` (한국어 특화 공개 모델)
  활성화: `ollama serve` 후 `ollama pull exaone3.5:2.4b`
"""
import re

import httpx

from app.core.config import settings
from app.models import Episode, RoleplaySession, Turn
from app.services.dialogue.base import QuestionSpec
from app.services.dialogue.template_provider import TemplateDialogueProvider

SYSTEM_PROMPT = """당신은 직장 역할극 시뮬레이션의 등장인물입니다.
규칙:
- 반드시 한국어 존댓말 질문 한 문장만 출력합니다 (60자 이내, 물음표로 끝냄).
- 질문은 반드시 하나만 합니다. 두 가지를 묻지 마세요 — 가장 중요한 것 하나만.
- [상황], [확인할 요소], [참고용 기본 질문]에 있는 사실과 목표만 사용합니다. 새 업무·인물·일정·조건을 만들거나 다른 시나리오로 바꾸지 마세요.
- 참고용 기본 질문의 의미와 요구를 유지하고, 사용자의 직전 답변 표현에 맞춰 말투만 자연스럽게 다듬습니다. 답변이 벗어났다면 같은 확인할 요소로 다시 돌려 질문합니다.
- 훈계·설명·인사말 금지. 질문 문장 외에 아무것도 출력하지 않습니다."""

_SCENE_STOPWORDS = {
    "사용자", "직전", "답변", "질문", "상황", "요소", "확인", "내용", "현재", "기본", "참고용",
    "대해서", "그리고", "어떻게", "무엇을", "무엇이", "있나요", "주세요", "주시겠어요",
}
_KOREAN_PARTICLES = (
    "으로부터", "에게서", "에서는", "입니다", "합니다", "하세요", "해요", "에서", "으로",
    "에게", "까지", "부터", "처럼", "보다", "에는", "의", "을", "를", "은", "는",
    "이", "가", "에", "와", "과", "로", "도", "만",
)


def _scene_terms(text: str) -> set[str]:
    """장면을 식별할 수 있는 한국어 단어만 느슨하게 뽑는다."""
    terms = set()
    for raw in re.findall(r"[가-힣A-Za-z0-9]{2,}", text):
        term = raw
        for particle in _KOREAN_PARTICLES:
            if term.endswith(particle) and len(term) > len(particle) + 1:
                term = term[: -len(particle)]
                break
        if term not in _SCENE_STOPWORDS and len(term) >= 2:
            terms.add(term)
    return terms


def _stays_in_scene(question: str, spec: QuestionSpec, situation: str) -> bool:
    """생성 문장이 선택 장면의 기준 질문·상황에서 완전히 벗어나지 않았는지 확인한다."""
    anchors = _scene_terms(f"{spec.question_text} {spec.intent} {situation}")
    return not anchors or bool(anchors & _scene_terms(question))


def _persona_instruction(character: dict, difficulty: str) -> str:
    """캐릭터와 난이도에 맞는 말투 규칙을 만든다."""
    difficulty_persona = character.get("difficulty_persona", {})
    mode_rule = difficulty_persona.get(difficulty, difficulty_persona.get("basic", "차분하게 질문합니다."))
    return (
        f"[역할] {character.get('name', 'AI 상대')} — {character.get('role', '상대 역할')}\n"
        f"[기본 성격] {character.get('personality', '현실적인 직장 대화 상대입니다.')}\n"
        f"[말투] {character.get('speech_style', '짧고 자연스러운 존댓말')}\n"
        f"[현재 난이도 태도] {mode_rule}"
    )


class OllamaDialogueProvider:
    """TemplateDialogueProvider를 감싸는 개인화 레이어."""

    def __init__(self, fallback: TemplateDialogueProvider | None = None):
        self.fallback = fallback or TemplateDialogueProvider()

    def first_question(self, session: RoleplaySession, episodes: list[Episode]) -> QuestionSpec:
        return self.fallback.first_question(session, episodes)

    def next_question(
        self, session: RoleplaySession, episodes: list[Episode], turns: list[Turn]
    ) -> QuestionSpec | None:
        spec = self.plan_next(session, episodes, turns)
        if spec is None or spec.question_type == "initial" or not turns:
            return spec  # 진행/종료/에피소드 전환은 템플릿 대본 유지

        episode = next((e for e in episodes if e.id == spec.episode_id), None)
        personalized = self.personalize_question(
            spec, episode.situation if episode else "", turns[-1].response_text,
        )
        if personalized:
            spec.question_text = personalized
        return spec

    def plan_next(
        self, session: RoleplaySession, episodes: list[Episode], turns: list[Turn]
    ) -> QuestionSpec | None:
        """진행/종료 결정은 항상 템플릿 — LLM은 문장만 다듬는다."""
        return self.fallback.next_question(session, episodes, turns)

    def personalize_question(
        self, spec: QuestionSpec, situation: str, last_response: str,
        character: dict | None = None, difficulty: str = "basic",
        emotion_directive: str = "",
    ) -> str | None:
        """평문 인자만 사용 — 요청 스레드 밖(병렬 실행)에서도 안전하다."""
        persona = _persona_instruction(character or {}, difficulty)
        # 감정 상태 주입 (S-B2B-EMOTION) — 상태 머신이 정한 현재 감정을 연기시킨다
        if emotion_directive:
            persona += f"\n[현재 감정 상태] {emotion_directive}"
        prompt = (
            f"{persona}\n"
            f"[상황] {situation}\n"
            f"[역할 ID] {spec.character_id}\n"
            f"[사용자의 직전 답변] {last_response[:300] or '아직 답변 전입니다.'}\n"
            f"[확인할 요소] {spec.intent}\n"
            f"[참고용 기본 질문] {spec.question_text}\n"
            "위 장면 밖의 내용은 추가하지 말고, 참고용 기본 질문과 같은 목표를 묻는 질문 한 문장을 만드세요."
        )
        try:
            resp = httpx.post(
                f"{settings.ollama_base_url}/api/chat",
                json={
                    "model": settings.ollama_model,
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": prompt},
                    ],
                    "stream": False,
                    "keep_alive": settings.ollama_keep_alive,
                    "options": {"num_predict": 80, "temperature": 0.15},
                },
                timeout=settings.ollama_timeout_sec,
            )
            resp.raise_for_status()
            text = resp.json()["message"]["content"].strip().strip('"')
        except (httpx.HTTPError, KeyError, TypeError, ValueError):
            return None  # 연결 실패/타임아웃 → 템플릿 폴백

        # 첫 질문 문장만 추출 — 모델이 두 가지를 묻거나 토큰 상한에서 잘려도
        # 완결된 첫 질문은 살린다 (실측: 장문 생성 → 물음표 유실 → 과잉 폴백 방지)
        match = re.search(r"[^?\n]{8,118}\?", text)
        if match:
            text = match.group(0).strip()

        # 형식 검증: 한 문장, 적정 길이, 질문형 — 어긋나면 폴백
        if not text or len(text) > 120 or "\n" in text or not text.endswith("?"):
            return None
        if not _stays_in_scene(text, spec, situation):
            return None
        return text
