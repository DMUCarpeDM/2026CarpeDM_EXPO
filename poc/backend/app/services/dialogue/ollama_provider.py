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
from app.services.dialogue.prompts import build_character_system_prompt, clean_generated_line
from app.services.dialogue.template_provider import TemplateDialogueProvider


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
        # 시나리오가 로드돼 있으면 페르소나·세계관을 프롬프트 재료로 쓴다
        # (단독 생성된 세션 객체에서는 None — 범용 프롬프트로 동작)
        scenario = getattr(session, "scenario", None)
        characters = (scenario.characters if scenario is not None else None) or []
        character = next((c for c in characters if c.get("id") == spec.character_id), None)
        personalized = self.personalize_question(
            spec, episode.situation if episode else "", turns[-1].response_text,
            character=character,
            world=scenario.world_setting if scenario is not None else None,
            difficulty=session.difficulty or "basic",
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
        self,
        spec: QuestionSpec,
        situation: str,
        last_response: str,
        character: dict | None = None,
        world: dict | None = None,
        difficulty: str = "basic",
    ) -> str | None:
        """평문 인자만 사용 — 요청 스레드 밖(병렬 실행)에서도 안전하다."""
        if not last_response:
            return None
        system_prompt = build_character_system_prompt(
            character, world, question_type=spec.question_type, difficulty=difficulty,
        )
        # 페르소나가 시스템 프롬프트에 없을 때(범용 폴백)만 역할 한 줄을 보강
        role_line = (
            "" if character
            else f"[당신의 역할] {spec.character_id} — 말투는 짧고 현실적인 직장 상사/동료\n"
        )
        prompt = (
            f"[상황] {situation}\n"
            + role_line
            + f"[사용자의 직전 답변] {last_response[:300]}\n"
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
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": prompt},
                    ],
                    "stream": False,
                    "keep_alive": settings.ollama_keep_alive,
                    # num_predict 48: 60자 질문 ≈ 30~45토큰이면 충분. 로컬 CPU에서
                    # 디코드가 지연의 주범이라 상한이 곧 타임아웃 여유다 (하네스 실측:
                    # 80토큰 상한에서는 생성이 7초 예산에 상시 근접 → 과잉 폴백).
                    "options": {"num_predict": 48, "temperature": 0.4},
                },
                timeout=settings.ollama_timeout_sec,
            )
            resp.raise_for_status()
            text = clean_generated_line(
                resp.json()["message"]["content"],
                ((character or {}).get("name", ""), spec.character_id),
            )
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
