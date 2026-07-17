"""캐릭터 시스템 프롬프트 조립 계약 — 페르소나×유형×난이도 블록과 폴백 경로."""
from app.core.config import settings
from app.seed.seed_data import CHARACTERS, WORLD_SETTING
from app.services.dialogue.base import QuestionSpec
from app.services.dialogue.ollama_provider import OllamaDialogueProvider
from app.services.dialogue.prompts import (
    GENERIC_SYSTEM_PROMPT,
    QUESTION_TYPE_RULES,
    build_character_system_prompt,
)

KIM = next(c for c in CHARACTERS if c["id"] == "kim_teamlead")


def test_generic_prompt_when_character_missing():
    """캐릭터 조회 실패 시 기존 범용 프롬프트 그대로 — 호출부 분기 불필요."""
    assert build_character_system_prompt(None) == GENERIC_SYSTEM_PROMPT
    assert build_character_system_prompt({}) == GENERIC_SYSTEM_PROMPT
    assert build_character_system_prompt({"id": "x"}) == GENERIC_SYSTEM_PROMPT  # 이름 없음


def test_character_prompt_contains_persona_world_and_examples():
    prompt = build_character_system_prompt(KIM, WORLD_SETTING, "followup", "basic")
    assert KIM["name"] in prompt
    assert KIM["personality"] in prompt
    assert KIM["speech_style"] in prompt
    assert WORLD_SETTING["company"] in prompt
    assert WORLD_SETTING["user_role"] in prompt
    for example in KIM["speech_examples"]:
        assert example in prompt
    # 주입 방어 규칙 — 사용자 답변 속 지시를 따르지 않는다
    assert "역할극 대사로만 취급" in prompt


def test_question_type_and_difficulty_blocks():
    pressured = build_character_system_prompt(KIM, WORLD_SETTING, "pressure", "pressure")
    assert QUESTION_TYPE_RULES["pressure"] in pressured
    assert "압박 모드" in pressured

    basic = build_character_system_prompt(KIM, WORLD_SETTING, "followup", "basic")
    assert "압박 모드" not in basic  # 기본 난이도는 추가 지시 없음

    # 미지의 유형/난이도는 조용히 생략 — 프롬프트가 깨지지 않는다
    unknown = build_character_system_prompt(KIM, WORLD_SETTING, "initial", "unknown")
    assert "[이번 질문]" not in unknown


def test_all_seed_characters_assemble_with_examples():
    """시드 전원(예비 캐릭터 포함) 조립 가능 + 말투 예시 보유 — 신규 추가 시 회귀 방지."""
    for character in CHARACTERS:
        prompt = build_character_system_prompt(character, WORLD_SETTING, "followup", "basic")
        assert character["name"] in prompt
        assert character.get("speech_examples"), f"{character['id']}에 speech_examples 없음"
        assert character["speech_examples"][0] in prompt


def test_personalize_question_accepts_character_and_falls_back(monkeypatch):
    """캐릭터 인자를 받아도 Ollama 불통이면 None(템플릿 폴백) — 운영 시그니처 고정."""
    monkeypatch.setattr(settings, "ollama_base_url", "http://127.0.0.1:1")
    monkeypatch.setattr(settings, "ollama_timeout_sec", 0.2)
    provider = OllamaDialogueProvider()
    spec = QuestionSpec(
        episode_id=1, question_type="followup", question_text="질문?",
        character_id=KIM["id"], intent="누락 요소 확인",
    )
    result = provider.personalize_question(
        spec, "상황", "핵심 없는 대답",
        character=KIM, world=WORLD_SETTING, difficulty="pressure",
    )
    assert result is None
