"""하이브리드 대화 엔진 — 로컬 LLM(Ollama)로 후속 질문을 개인화한다.

설계 (기획서 '하이브리드 콘텐츠' + 리스크 대응 그대로):
- 에피소드 진행/종료 판단과 초기 질문은 항상 템플릿 엔진이 담당 → 시연 안정성 보장
- 후속(followup)/압박(pressure) 질문만 LLM이 사용자 응답을 반영해 다듬는다
- LLM 응답이 늦거나(타임아웃) 이상하면(길이/형식 검증 실패) 템플릿 질문으로 폴백

API 키 불필요: Ollama는 로컬에서 실행되는 오픈소스 런타임이다.
  설치: https://ollama.com  → `ollama pull exaone3.5:2.4b` (한국어 특화 공개 모델)
  활성화: 환경변수 MIRROTING_DIALOGUE_PROVIDER=ollama
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
- 사용자의 직전 답변 내용을 언급하며, 지시된 '확인할 요소'를 정확히 파고드는 질문을 합니다.
- 훈계·설명·인사말 금지. 질문 문장 외에 아무것도 출력하지 않습니다."""


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
        self, spec: QuestionSpec, situation: str, last_response: str
    ) -> str | None:
        """평문 인자만 사용 — 요청 스레드 밖(병렬 실행)에서도 안전하다."""
        if not last_response:
            return None
        prompt = (
            f"[상황] {situation}\n"
            f"[당신의 역할] {spec.character_id} — 말투는 짧고 현실적인 직장 상사/동료\n"
            f"[사용자의 직전 답변] {last_response[:300]}\n"
            f"[확인할 요소] {spec.intent}\n"
            f"[참고용 기본 질문] {spec.question_text}\n"
            "위 요소를 사용자 답변 맥락에 맞춰 파고드는 질문 한 문장을 만드세요."
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
                    "options": {"num_predict": 80, "temperature": 0.4},
                },
                timeout=settings.ollama_timeout_sec,
            )
            resp.raise_for_status()
            text = resp.json()["message"]["content"].strip().strip('"')
        except Exception:
            return None  # 연결 실패/타임아웃 → 템플릿 폴백

        # 첫 질문 문장만 추출 — 모델이 두 가지를 묻거나 토큰 상한에서 잘려도
        # 완결된 첫 질문은 살린다 (실측: 장문 생성 → 물음표 유실 → 과잉 폴백 방지)
        match = re.search(r"[^?\n]{8,118}\?", text)
        if match:
            text = match.group(0).strip()

        # 형식 검증: 한 문장, 적정 길이, 질문형 — 어긋나면 폴백
        if not text or len(text) > 120 or "\n" in text or not text.endswith("?"):
            return None
        return text
