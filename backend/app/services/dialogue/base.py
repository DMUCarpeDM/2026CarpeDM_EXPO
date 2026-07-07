"""대화 제공자 인터페이스.

템플릿 기반(기본) 외에 로컬 LLM(Ollama)이나 외부 API 구현체로 교체할 수 있도록
질문 선택 로직을 이 인터페이스 뒤로 숨긴다. (기획서 리스크 대응: LLM 실패 시 템플릿 폴백)
"""
from dataclasses import dataclass
from typing import Protocol

from app.models import Episode, RoleplaySession, Turn


@dataclass
class QuestionSpec:
    episode_id: int
    question_type: str  # initial | followup | pressure
    question_text: str
    character_id: str
    intent: str = ""
    virtual_time: str = ""  # 에피소드 가상 시각 "09:04" — 하루 프레이밍


class DialogueProvider(Protocol):
    def first_question(self, session: RoleplaySession, episodes: list[Episode]) -> QuestionSpec: ...

    def next_question(
        self, session: RoleplaySession, episodes: list[Episode], turns: list[Turn]
    ) -> QuestionSpec | None:
        """다음 질문(계획 + 개인화 일체형). None이면 역할극 종료."""
        ...

    def plan_next(
        self, session: RoleplaySession, episodes: list[Episode], turns: list[Turn]
    ) -> QuestionSpec | None:
        """진행/종료 결정만 (LLM 없음) — 개인화는 personalize_question이 담당.

        호출자가 개인화를 리액션 다듬기와 병렬로 돌릴 수 있게 두 단계를 나눈다.
        """
        ...

    def personalize_question(
        self, spec: QuestionSpec, situation: str, last_response: str
    ) -> str | None:
        """spec 질문을 직전 답변 맥락으로 다듬는다 (실패·비활성 시 None).

        평문 인자만 받으므로 스레드에서 안전하다 (ORM 객체 전달 금지).
        """
        ...
