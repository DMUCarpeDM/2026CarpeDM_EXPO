"""리액션 비트 + 수행도(rapport) 분기 엔진.

"질문→답→질문"의 챗봇 감각을 "질문→답→반응→(수행도에 따라 달라지는) 다음 장면"으로
바꾼다. 전부 로컬 신호 기반 — 외부 API 없음.

- 케이스 판정: 기존 response_fit.analyze_response의 신호(커버리지·위험 표현·음절)를
  재사용한다. 별도 NLP를 새로 만들지 않는다.
- 수행도(rapport): 턴마다 케이스 델타를 누적, 3단계(high/mid/low)로 양자화.
  에피소드 도입 변주(intro_variants)와 하루의 결말(ENDINGS) 선택에 쓰인다.
- 리액션 선택: 시드의 캐릭터별 라이브러리(REACTIONS)에서 미사용 문장을 고른다.
  선택적으로 로컬 LLM(Ollama)이 답변을 직접 언급하는 문장으로 다듬는다(실패 시 폴백).
"""
import random
import re

import httpx

from app.ai.response_fit import analyze_response
from app.core.config import settings
from app.models import RoleplaySession
from app.seed.seed_data import ENDINGS, REACTIONS

# 케이스별 수행도 델타. covered를 0.5로 눌러 "무난한 답만으로는 high가 안 되게" 설계 —
# high 결말은 excellent가 섞여야 나온다 (분기가 체감되도록).
CASE_DELTA = {"excellent": 1.5, "covered": 0.5, "missing": -0.5, "short": -0.75, "risky": -1.5}

# 양자화 임계 (답변당 평균 델타 기준)
HIGH_THRESHOLD = 0.75
LOW_THRESHOLD = -0.25

# 케이스 판정 경계
EXCELLENT_COVERAGE = 0.75
MISSING_COVERAGE = 0.4
SHORT_SYLLABLES = 12
CASUAL_OR_RUDE_REPLY = re.compile(
    r"(?:^|[\s,.!?])(?:ㅇㅇ|ㄴㄴ|응|어|싫어|닥쳐|꺼져|알아서(?:\s+해)?)(?=$|[\s,.!?])"
)

REACTION_SYSTEM_PROMPT = """당신은 직장 역할극의 등장인물입니다. 신입의 직전 답변에 대한
짧은 반응 한 문장을 만듭니다.
규칙:
- 한국어 한 문장, 60자 이내. 질문 금지(물음표로 끝내지 않음).
- 신입의 답변 내용 중 한 단어/구절을 직접 언급하면 좋습니다.
- 지시된 캐릭터 말투를 그대로 유지한 자연스러운 구어체로 말합니다.
  안내문·상담원 격식체 금지 ("~소요됩니다", "~처리해 드리겠습니다" 같은 문어체 X).
- 훈계 장문 금지, 인사말 금지. 반응 문장 외에 아무것도 출력하지 않습니다."""


def classify(response_text: str, checklist: list[dict]) -> dict:
    """답변을 리액션 케이스로 판정. 우선순위: risky > short > excellent > covered > missing."""
    metrics = analyze_response(response_text, checklist)
    high_risk = any(h["severity"] == "high" for h in metrics["banned_hits"])
    # 존댓말 문장 안의 "해야죠"처럼 형태소 분석기가 반말로 오인할 수 있는 경우는
    # 제외한다. 명확한 채팅 축약어·무례 표현 또는 반말 비중이 높은 답변만 risky다.
    mostly_banmal = (
        metrics["politeness"]["banmal_count"] > 0
        and metrics["politeness"]["formal_ratio"] < 0.5
    )
    disrespectful = bool(CASUAL_OR_RUDE_REPLY.search(response_text)) or mostly_banmal
    if high_risk or len(metrics["banned_hits"]) >= 2 or disrespectful:
        case = "risky"
    elif metrics["syllables"] < SHORT_SYLLABLES:
        case = "short"
    elif metrics["coverage"] >= EXCELLENT_COVERAGE and not metrics["banned_hits"]:
        case = "excellent"
    elif metrics["coverage"] >= MISSING_COVERAGE:
        case = "covered"
    else:
        case = "missing"
    return {
        "case": case,
        "coverage": metrics["coverage"],
        "risk_hits": len(metrics["banned_hits"]),
        "syllables": metrics["syllables"],
    }


def update_rapport(session: RoleplaySession, case: str) -> dict:
    """세션 수행도 상태를 갱신해 돌려준다 (호출자가 커밋)."""
    state = dict(session.rapport or {})
    state["points"] = round(state.get("points", 0.0) + CASE_DELTA.get(case, 0.0), 3)
    state["answered"] = state.get("answered", 0) + 1
    session.rapport = state
    return state


def rapport_level(session: RoleplaySession) -> str:
    state = session.rapport or {}
    answered = state.get("answered", 0)
    if not answered:
        return "mid"
    avg = state.get("points", 0.0) / answered
    if avg >= HIGH_THRESHOLD:
        return "high"
    if avg <= LOW_THRESHOLD:
        return "low"
    return "mid"


def _reaction_pool(session: RoleplaySession, character_id: str, case: str) -> list[str]:
    """리액션 문장 풀 — 시나리오 팩에 내장된 캐릭터별 풀 우선, 없으면 시드 라이브러리.

    팩(S-B2B-PACK) 캐릭터는 characters[].reactions = {case: [문장...]}을 갖는다 —
    새 직무 시나리오가 seed_data의 REACTIONS를 수정하지 않고 자체 리액션을 가진다.
    """
    characters = (session.scenario.characters if session.scenario else None) or []
    for character in characters:
        if character.get("id") == character_id:
            embedded = (character.get("reactions") or {}).get(case)
            if embedded:
                return list(embedded)
            break
    return list(REACTIONS.get(character_id, {}).get(case, []))


def pick_reaction(session: RoleplaySession, character_id: str, case: str) -> str:
    """캐릭터 톤 × 케이스로 리액션 선택. 같은 세션에서 같은 문장을 반복하지 않는다."""
    pool = _reaction_pool(session, character_id, case)
    if not pool:
        return ""
    state = dict(session.rapport or {})
    used = list(state.get("used_reactions", []))
    fresh = [r for r in pool if r not in used] or pool  # 전부 소진되면 재사용 허용
    reaction = random.choice(fresh)
    state["used_reactions"] = used + [reaction]
    session.rapport = state
    return reaction


def personalize_reaction(
    reaction: str, character: dict, response_text: str, emotion_directive: str = "",
) -> str:
    """로컬 LLM(Ollama)로 답변을 직접 언급하는 리액션으로 다듬는다. 실패 시 템플릿 유지."""
    if settings.dialogue_provider != "ollama":
        return reaction
    # 감정 상태 주입 (S-B2B-EMOTION) — 리액션 문장에도 현재 감정이 실린다
    emotion_line = f"[현재 감정 상태] {emotion_directive}\n" if emotion_directive else ""
    prompt = (
        f"[캐릭터] {character.get('name', '')} — {character.get('speech_style', '')}\n"
        f"{emotion_line}"
        f"[신입의 직전 답변] {response_text[:300]}\n"
        f"[참고용 기본 반응] {reaction}\n"
        "위 답변에 대한 이 캐릭터의 반응 한 문장을 만드세요."
    )
    try:
        resp = httpx.post(
            f"{settings.ollama_base_url}/api/chat",
            json={
                "model": settings.ollama_model,
                "messages": [
                    {"role": "system", "content": REACTION_SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                "stream": False,
                "options": {"num_predict": 60, "temperature": 0.5},
            },
            timeout=settings.ollama_timeout_sec,
        )
        resp.raise_for_status()
        text = resp.json()["message"]["content"].strip().strip('"')
    except Exception:
        return reaction  # 연결 실패/타임아웃 → 템플릿 폴백
    # 형식 검증: 한 문장, 적정 길이, 질문 아님 — 어긋나면 폴백
    if not text or len(text) > 90 or "\n" in text or text.endswith("?"):
        return reaction
    return text


def select_ending(session: RoleplaySession) -> dict:
    """하루의 결말 — 수행도 3단계 분기. 팩 시나리오는 자체 결말을 가진다."""
    level = rapport_level(session)
    world = (session.scenario.world_setting if session.scenario else None) or {}
    pack_endings = world.get("endings") or {}
    if level in pack_endings:
        return dict(pack_endings[level])
    return dict(ENDINGS[level])
