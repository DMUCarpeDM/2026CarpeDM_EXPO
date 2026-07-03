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


class DialogueProvider(Protocol):
    def first_question(self, session: RoleplaySession, episodes: list[Episode]) -> QuestionSpec: ...

    def next_question(
        self, session: RoleplaySession, episodes: list[Episode], turns: list[Turn]
    ) -> QuestionSpec | None:
        """다음 질문. None이면 역할극 종료."""
        ...
