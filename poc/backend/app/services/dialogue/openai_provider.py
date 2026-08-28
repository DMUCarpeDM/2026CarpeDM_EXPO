"""GPT-4o가 역할극 대사를 직접 만드는 대화 제공자."""
import re

import httpx

from app.core.config import settings
from app.models import Episode, RoleplaySession, Scenario, Turn
from app.services.dialogue.base import QuestionSpec

TURN_LIMITS = {5: 6, 10: 11}

ROLEPLAY_SYSTEM_PROMPT = """당신은 직장 대화 연습에서 사용자를 상대하는 한 사람입니다.
당신의 역할은 아래 [상대 페르소나] 그대로 행동하며, 시나리오 속 상대방으로 대화하는 것입니다.

반드시 지킬 규칙:
1. 사용자 역할이 아니라 [상대 페르소나]의 역할로만 말합니다. 사용자를 대신해 사과, 약속, 안내, 업무 처리를 하지 않습니다.
   상대가 고객이면 고객의 불편·확인·요청만 말하고, 직원처럼 사과·교환·환불·보상을 약속하지 않습니다.
   상대가 상사·동료·외부 파트너면 그 직무에서 자연스럽게 할 법한 확인·질문·의견만 말합니다.
2. [시나리오] 밖의 회사, 사람, 일정, 규정, 사건을 만들지 않습니다.
3. [대화 이력]에서 이미 답한 질문과 약속은 반복하지 않습니다. 직전 사용자 답변을 실제로 듣고 자연스럽게 반응합니다.
4. 난이도는 말투의 압박 정도만 바꿉니다. 기본 모드에서는 차분하고 일상적인 존댓말을 씁니다.
5. 안내문, 평가, 코칭, 대본 설명을 말하지 않습니다. 실제 사람이 바로 말할 법한 한국어로 1~2문장, 180자 이내만 말합니다.
6. 답이 필요한 순간에는 질문할 수 있지만, 매번 질문으로 끝낼 필요는 없습니다.
7. 마크다운, 화자 이름, 괄호 속 지시문, 따옴표, JSON을 출력하지 않습니다. 특히 대사 앞에 `상대:`, `AI:`, `이름:` 같은 접두어를 붙이지 않습니다.
"""


class DialogueGenerationError(RuntimeError):
    """외부 대화 모델이 역할극 대사를 만들지 못했을 때 발생한다."""


def _character_for(scenario: Scenario, character_id: str) -> dict:
    """시나리오에 저장된 상대 페르소나를 찾는다."""
    return next((character for character in scenario.characters if character["id"] == character_id), {})


def _episode_for(session: RoleplaySession, episodes: list[Episode]) -> Episode:
    """선택한 장면 또는 시나리오의 첫 장면을 역할극 배경으로 사용한다."""
    selected = next((episode for episode in episodes if episode.id == session.selected_episode_id), None)
    return selected or episodes[0]


def _history(turns: list[Turn]) -> str:
    """역할극 대사가 이어지도록 모든 대화 턴을 프롬프트에 넣는다."""
    return "\n".join(
        f"상대: {turn.question_text}\n사용자: {turn.response_text or '(아직 답변 없음)'}"
        for turn in turns
    )


def _persona(character: dict, difficulty: str) -> str:
    """상대 인물과 난이도의 대화 태도를 한 블록으로 만든다."""
    difficulty_persona = character.get("difficulty_persona", {})
    attitude = difficulty_persona.get(difficulty, difficulty_persona.get("basic", "차분하게 대화한다."))
    return (
        f"이름: {character.get('name', 'AI 상대')}\n"
        f"역할: {character.get('role', '상대')}\n"
        f"성격: {character.get('personality', '현실적인 대화 상대')}\n"
        f"말투: {character.get('speech_style', '자연스러운 존댓말')}\n"
        f"현재 난이도 태도: {attitude}"
    )


def _valid_line(line: str) -> bool:
    """화면에 바로 표시할 수 있는 상대의 발화인지 확인한다."""
    return bool(line) and len(line) <= 180 and "\n" not in line and not line.startswith(("{", "["))


def _without_speaker_prefix(line: str, character_name: str) -> str:
    """모델이 실수로 붙인 화자 표시는 채팅 UI 이름과 중복되지 않게 제거한다."""
    prefix = re.compile(rf"^(?:상대|AI(?:\s*상대)?|{re.escape(character_name)})\s*[:：]\s*")
    for _ in range(2):
        cleaned = prefix.sub("", line, count=1)
        if cleaned == line:
            break
        line = cleaned
    return line


class OpenAIDialogueProvider:
    """첫 대사는 고정하고, 이후 역할극 대사는 GPT-4o가 생성한다."""

    def first_question(self, session: RoleplaySession, episodes: list[Episode]) -> QuestionSpec:
        """첫 대사는 사용자가 선택한 기존 시나리오 대사를 그대로 사용한다."""
        episode = _episode_for(session, episodes)
        return QuestionSpec(
            episode_id=episode.id,
            question_type="initial",
            question_text=episode.initial_question,
            character_id=episode.character_id,
            virtual_time=episode.virtual_time or "",
        )

    def next_question(
        self,
        session: RoleplaySession,
        scenario: Scenario,
        episodes: list[Episode],
        turns: list[Turn],
    ) -> QuestionSpec | None:
        """시나리오와 전체 대화 이력에서 다음 역할극 대사를 생성한다."""
        if len(turns) >= TURN_LIMITS.get(session.mode, 6):
            return None
        if not episodes:
            raise DialogueGenerationError("선택한 역할극 장면을 찾을 수 없습니다")

        episode = _episode_for(session, episodes)
        character = _character_for(scenario, episode.character_id)
        line = self._generate_line(session, scenario, episode, character, turns)
        return QuestionSpec(
            episode_id=episode.id,
            question_type="ai_roleplay",
            question_text=line,
            character_id=episode.character_id,
            virtual_time=episode.virtual_time or "",
        )

    def _generate_line(
        self,
        session: RoleplaySession,
        scenario: Scenario,
        episode: Episode,
        character: dict,
        turns: list[Turn],
    ) -> str:
        """OpenAI 응답에서 상대 발화 한 덩어리만 꺼낸다."""
        api_key = settings.openai_api_key.get_secret_value()
        if not api_key:
            raise DialogueGenerationError("GPT-4o API 키가 설정되지 않았습니다")

        prompt = (
            f"[시나리오]\n제목: {scenario.title}\n설명: {scenario.description}\n"
            f"사용자 역할: {(scenario.world_setting or {}).get('user_role', '연습 참여자')}\n"
            f"장면: {episode.title}\n배경: {episode.situation}\n연습 목표: {episode.question_intent}\n\n"
            f"[상대 페르소나]\n{_persona(character, session.difficulty)}\n\n"
            f"[대화 진행]\n현재 {len(turns)}턴째이며 최대 {TURN_LIMITS.get(session.mode, 6)}턴입니다.\n"
            f"[대화 이력]\n{_history(turns)}\n\n"
            "위 정보를 바탕으로 상대 역할의 다음 발화만 작성하세요."
        )
        try:
            response = httpx.post(
                f"{settings.openai_base_url}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"},
                json={
                    "model": settings.openai_model,
                    "messages": [
                        {"role": "system", "content": ROLEPLAY_SYSTEM_PROMPT},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.45,
                    "max_tokens": 180,
                },
                timeout=settings.openai_timeout_sec,
            )
            response.raise_for_status()
            line = response.json()["choices"][0]["message"]["content"].strip().strip('"')
        except (AttributeError, httpx.HTTPError, IndexError, KeyError, TypeError, ValueError) as error:
            raise DialogueGenerationError("GPT-4o 역할극 대사를 만들지 못했습니다") from error

        line = _without_speaker_prefix(re.sub(r"\s+", " ", line), character.get("name", ""))
        if not _valid_line(line):
            raise DialogueGenerationError("GPT-4o가 사용할 수 없는 역할극 대사를 반환했습니다")
        return line
