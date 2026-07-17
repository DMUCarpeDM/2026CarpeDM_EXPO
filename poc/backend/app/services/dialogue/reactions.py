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
from app.services.dialogue.prompts import build_reaction_system_prompt, clean_generated_line

# 장문 생성 구제 — 완결된 첫 평서문(…다./…요. 등)만 살린다.
# 질문 경로(ollama_provider)의 '첫 질문 추출'과 동형: 소형 모델이 사족을 붙여도
# 앞문장이 온전하면 폴백 대신 채택한다 (하네스 실측: 90자 초과 탈락이 리액션
# 폴백의 주요 원인 중 하나).
_FIRST_SENTENCE = re.compile(r"(.{8,88}?(?:다|요|죠|네)[.!])")

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

def classify(response_text: str, checklist: list[dict]) -> dict:
    """답변을 리액션 케이스로 판정. 우선순위: risky > short > excellent > covered > missing."""
    metrics = analyze_response(response_text, checklist)
    high_risk = any(h["severity"] == "high" for h in metrics["banned_hits"])
    if high_risk or len(metrics["banned_hits"]) >= 2:
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


def pick_reaction(session: RoleplaySession, character_id: str, case: str) -> str:
    """캐릭터 톤 × 케이스로 리액션 선택. 같은 세션에서 같은 문장을 반복하지 않는다."""
    pool = REACTIONS.get(character_id, {}).get(case, [])
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
    reaction: str,
    character: dict,
    response_text: str,
    case: str = "",
    world: dict | None = None,
    difficulty: str = "basic",
) -> str:
    """로컬 LLM(Ollama)로 답변을 직접 언급하는 리액션으로 다듬는다. 실패 시 템플릿 유지.

    case/world/difficulty는 build_reaction_system_prompt의 캐릭터별 시스템 프롬프트
    재료 — 없으면 범용 프롬프트로 동작한다(평문 인자만 받아 스레드에서 안전).
    """
    if settings.dialogue_provider != "ollama":
        return reaction
    system_prompt = build_reaction_system_prompt(character, world, case=case, difficulty=difficulty)
    prompt = (
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
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt},
                ],
                "stream": False,
                "options": {"num_predict": 48, "temperature": 0.5},
            },
            timeout=settings.ollama_timeout_sec,
        )
        resp.raise_for_status()
        text = clean_generated_line(
            resp.json()["message"]["content"], (character.get("name", ""),),
        )
    except Exception:
        return reaction  # 연결 실패/타임아웃 → 템플릿 폴백
    if "\n" in text:
        text = text.split("\n", 1)[0].strip()  # 사족 줄바꿈 구제 — 첫 줄만
    if len(text) > 90 and (m := _FIRST_SENTENCE.match(text)):
        text = m.group(1).strip()
    # 형식 검증: 한 문장, 적정 길이, 질문 아님 — 어긋나면 폴백
    if not text or len(text) > 90 or text.endswith("?"):
        return reaction
    return text


def select_ending(session: RoleplaySession) -> dict:
    """하루의 결말 — 수행도 3단계 분기."""
    return dict(ENDINGS[rapport_level(session)])
