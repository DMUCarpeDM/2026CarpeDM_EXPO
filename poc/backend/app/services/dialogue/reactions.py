"""응답 분석 결과를 리포트용 수행도와 결말 상태로 누적한다.

상대의 실제 발화는 OpenAI 역할극 제공자가 담당한다. 이 모듈은 점수 신호를 계산하고
세션의 수행도만 기록하므로 템플릿 대사를 생성하거나 선택하지 않는다.
"""
import re

from app.ai.response_fit import analyze_response
from app.models import RoleplaySession
from app.seed.seed_data import ENDINGS

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


def select_ending(session: RoleplaySession) -> dict:
    """하루의 결말 — 수행도 3단계 분기. 팩 시나리오는 자체 결말을 가진다."""
    level = rapport_level(session)
    world = (session.scenario.world_setting if session.scenario else None) or {}
    pack_endings = world.get("endings") or {}
    if level in pack_endings:
        return dict(pack_endings[level])
    return dict(ENDINGS[level])
