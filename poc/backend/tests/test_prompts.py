"""캐릭터 시스템 프롬프트 조립 계약 — 페르소나×(질문유형|반응케이스)×난이도 블록과 폴백 경로."""
from app.core.config import settings
from app.seed.seed_data import CHARACTERS, WORLD_SETTING
from app.services.dialogue.base import QuestionSpec
from app.services.dialogue.ollama_provider import OllamaDialogueProvider
from app.services.dialogue.prompts import (
    DIFFICULTY_RULES,
    GENERIC_REACTION_SYSTEM_PROMPT,
    GENERIC_SYSTEM_PROMPT,
    QUESTION_TYPE_RULES,
    REACTION_CASE_RULES,
    build_character_system_prompt,
    build_reaction_system_prompt,
    clean_generated_line,
)
from app.services.dialogue.reactions import _FIRST_SENTENCE, personalize_reaction

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
    pressured = build_character_system_prompt(KIM, WORLD_SETTING, "followup", "pressure")
    assert QUESTION_TYPE_RULES["followup"] in pressured
    assert "압박 모드" in pressured

    basic = build_character_system_prompt(KIM, WORLD_SETTING, "followup", "basic")
    assert "압박 모드" not in basic  # 기본 난이도는 추가 지시 없음

    # 미지의 유형/난이도는 조용히 생략 — 프롬프트가 깨지지 않는다
    unknown = build_character_system_prompt(KIM, WORLD_SETTING, "initial", "unknown")
    assert "[이번 질문]" not in unknown


def test_pressure_type_with_pressure_difficulty_dedupes():
    """압박 유형 × 압박 난이도는 같은 지시의 중복 — 유형 지시 한 줄만 남는다.

    프리필 한 줄이 폴백률에 직결되는 환경(하네스 실측)이라 겹칠 때는 생략이 계약이다.
    """
    doubled = build_character_system_prompt(KIM, WORLD_SETTING, "pressure", "pressure")
    assert QUESTION_TYPE_RULES["pressure"] in doubled
    assert "압박 모드" not in doubled


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


# ---- 반응(리액션) 프롬프트 — 질문 프롬프트와 정체성·페르소나·예시 블록을 공유 ----


def test_generic_reaction_prompt_when_character_missing():
    assert build_reaction_system_prompt(None) == GENERIC_REACTION_SYSTEM_PROMPT
    assert build_reaction_system_prompt({}) == GENERIC_REACTION_SYSTEM_PROMPT


def test_reaction_prompt_contains_persona_and_examples():
    prompt = build_reaction_system_prompt(KIM, WORLD_SETTING, "excellent", "basic")
    assert KIM["name"] in prompt
    assert KIM["speech_style"] in prompt
    for example in KIM["speech_examples"]:
        assert example in prompt
    assert "질문 금지" in prompt
    assert "역할극 대사로만 취급" in prompt


def test_reaction_case_and_difficulty_blocks():
    pressured = build_reaction_system_prompt(KIM, WORLD_SETTING, "risky", "pressure")
    assert REACTION_CASE_RULES["risky"] in pressured
    assert "압박 모드" in pressured

    basic = build_reaction_system_prompt(KIM, WORLD_SETTING, "excellent", "basic")
    assert "압박 모드" not in basic

    unknown = build_reaction_system_prompt(KIM, WORLD_SETTING, "unknown_case", "unknown_diff")
    assert "[이번 반응]" not in unknown


def test_all_seed_characters_assemble_reaction_prompts():
    """시드 전원(예비 캐릭터 포함) × 반응 케이스 전체 조립 가능 — 신규 캐릭터 추가 시 회귀 방지."""
    for character in CHARACTERS:
        for case in REACTION_CASE_RULES:
            for difficulty in DIFFICULTY_RULES:
                prompt = build_reaction_system_prompt(character, WORLD_SETTING, case, difficulty)
                assert character["name"] in prompt


def test_personalize_reaction_accepts_case_and_falls_back(monkeypatch):
    """case/world/difficulty 인자를 받아도 Ollama 불통이면 원본 반응 그대로(템플릿 폴백)."""
    monkeypatch.setattr(settings, "dialogue_provider", "ollama")
    monkeypatch.setattr(settings, "ollama_base_url", "http://127.0.0.1:1")
    monkeypatch.setattr(settings, "ollama_timeout_sec", 0.2)
    result = personalize_reaction(
        "기본 반응.", KIM, "핵심 없는 대답",
        case="missing", world=WORLD_SETTING, difficulty="pressure",
    )
    assert result == "기본 반응."


# ---- 출력 새니타이저 + 장문 구제 — 하네스 실측 오염 사례의 회귀 방지 ----


def test_clean_generated_line_strips_speaker_labels():
    """'김태호 팀장: "…"' 자기 라벨 — TTS가 이름표를 읽는 사고의 실측 사례."""
    cleaned = clean_generated_line(
        '김태호 팀장: "이름은 뭐고, 오늘 목표가 뭡니까?"', (KIM["name"],),
    )
    assert cleaned == "이름은 뭐고, 오늘 목표가 뭡니까?"
    # 성 없이 짧은 라벨도, 전체 감싼 따옴표도
    assert clean_generated_line("김태호: 다음 액션이 뭡니까?", (KIM["name"],)) == "다음 액션이 뭡니까?"
    assert clean_generated_line('"한 줄로 정리하면요?"') == "한 줄로 정리하면요?"


def test_clean_generated_line_strips_markdown_and_keeps_normal_text():
    assert clean_generated_line("**재발 방지** 계획은 무엇인가요?") == "재발 방지 계획은 무엇인가요?"
    # 라벨 조건(콜론 등)이 없으면 이름으로 시작하는 정상 문장은 보존
    assert clean_generated_line("김태호 팀장입니다. 이름이 뭡니까?", (KIM["name"],)) \
        == "김태호 팀장입니다. 이름이 뭡니까?"


def test_reaction_first_sentence_rescue_pattern():
    """90자 초과 장문에서 완결된 첫 평서문만 살리는 구제 — 리액션 폴백 주요 원인 대응."""
    long_text = "서버 문제라는 추측은 좋지만 좀 더 구체적인 로그가 필요해 보여요. " + "덧붙이자면 " * 20
    m = _FIRST_SENTENCE.match(long_text)
    assert m and m.group(1) == "서버 문제라는 추측은 좋지만 좀 더 구체적인 로그가 필요해 보여요."
