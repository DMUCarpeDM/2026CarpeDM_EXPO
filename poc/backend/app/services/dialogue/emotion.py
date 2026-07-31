"""감정 상태 머신 (S-B2B-EMOTION) — 상대 캐릭터의 감정을 명시적 상태로 관리한다.

"프롬프트 페르소나"에서 "상태 기반 페르소나"로의 승격:
매 턴 사용자의 대응 품질(reactions.classify 케이스 — 규칙 기반, 결정적)이
감정 온도를 올리고 내리며, 온도 밴드가 상태를 결정한다. 다음 응답 생성 시
상태가 페르소나 지시문에 주입되어 말투가 실제로 변한다 (규칙 전이 + LLM 표현).

상태 다이어그램 (docs/plan/b2b/ai-architecture.md):
    평온(calm) ←→ 불만(displeased) ←→ 격앙(agitated)
    온도가 한 턴에 크게(EASED_DROP 이상) 떨어지면 "완화(eased)" 플래그 —
    "당신의 대응이 상대의 화를 실제로 풀었다"는 가시적 신호다.

설계 노트:
- 전이 판정은 규칙(케이스 델타)만 사용한다 — 결정적이라 테스트로 고정되고,
  Ollama가 죽어도 상태 머신은 계속 돈다 (폴백 계층 원칙). LLM은 상태의
  '표현'(질문·리액션 말투)만 담당한다.
- 온도는 0(평온)~100(격앙). 시나리오 팩의 emotion_profile이 초기 온도·델타·
  대상 캐릭터를 정의한다. 프로파일이 없으면(기존 전시 시나리오) 비활성 —
  기존 rapport 분기 동작은 그대로 유지된다.
"""
from app.models import RoleplaySession

# 상태 밴드: 온도 < CALM_MAX → calm, < AGITATED_MIN → displeased, 이상 → agitated
CALM_MAX = 35.0
AGITATED_MIN = 65.0
# 한 턴에 이만큼 온도가 떨어지면 "완화" — 리액션·게이지 연출의 트리거
EASED_DROP = 12.0

STATE_LABELS = {
    "calm": "평온",
    "displeased": "불만",
    "agitated": "격앙",
}

# 기본 델타 — 케이스가 좋을수록 온도가 내려간다(화가 풀린다).
# excellent가 missing보다 절대값이 큰 이유: "잘한 대응이 화를 푸는" 체감이
# 데모의 핵심이라 하강을 상승보다 후하게 설계했다 (풀리는 게 보여야 한다).
DEFAULT_DELTAS = {
    "excellent": -18.0,
    "covered": -8.0,
    "missing": 6.0,
    "short": 10.0,
    "risky": 22.0,
}

# 상태별 페르소나 주입 지시문 — LLM이 상태를 '연기'하게 하는 문장
STATE_DIRECTIVES = {
    "calm": "지금 감정은 평온합니다. 정중하고 협조적인 말투로, 여유 있게 말하세요.",
    "displeased": "지금 감정은 불만입니다. 겉으로는 예의를 지키지만 짧고 딱딱한 말투로, 요구를 분명히 하세요.",
    "agitated": "지금 감정은 격앙입니다. 언성이 높아진 상태로 조급하게 몰아붙이되, 욕설·인신공격은 하지 마세요.",
}
EASED_DIRECTIVE = "직전 답변 덕분에 감정이 눈에 띄게 누그러졌습니다. 누그러진 기색을 한마디에 담으세요."


def profile_of(session: RoleplaySession) -> dict:
    """세션 시나리오의 감정 프로파일 — 비활성이면 빈 dict."""
    scenario = session.scenario
    profile = (getattr(scenario, "emotion_profile", None) or {}) if scenario else {}
    return profile if profile.get("enabled") else {}


def state_of_temperature(temperature: float) -> str:
    if temperature < CALM_MAX:
        return "calm"
    if temperature < AGITATED_MIN:
        return "displeased"
    return "agitated"


def ensure_state(session: RoleplaySession) -> dict:
    """세션의 감정 상태를 초기화(최초 1회)해 돌려준다. 비활성이면 빈 dict."""
    profile = profile_of(session)
    if not profile:
        return {}
    state = dict(session.emotion or {})
    if "temperature" not in state:
        temperature = float(profile.get("initial", 70.0))
        state = {
            "character_id": profile.get("character_id", ""),
            "temperature": temperature,
            "state": state_of_temperature(temperature),
            "eased": False,
            "history": [],
        }
        session.emotion = state
    return state


def update(session: RoleplaySession, case: str, turn_order: int) -> dict:
    """답변 케이스로 온도·상태를 전이시킨다 (호출자가 커밋). 비활성이면 빈 dict."""
    profile = profile_of(session)
    if not profile:
        return {}
    state = ensure_state(session)
    deltas = {**DEFAULT_DELTAS, **(profile.get("deltas") or {})}
    delta = float(deltas.get(case, 0.0))
    before = float(state["temperature"])
    after = max(0.0, min(100.0, before + delta))
    history = list(state.get("history", []))
    history.append({
        "turn_order": turn_order,
        "case": case,
        "from": state["state"],
        "to": state_of_temperature(after),
        "temperature": round(after, 1),
    })
    new_state = {
        **state,
        "temperature": round(after, 1),
        "state": state_of_temperature(after),
        "eased": (before - after) >= EASED_DROP,
        "history": history[-40:],  # 폭주 방지 상한 (10분 모드 턴 수 대비 관대)
    }
    session.emotion = new_state
    return new_state


def directive_for(session: RoleplaySession, character_id: str) -> str:
    """응답 생성 시 주입할 상태 지시문 — 감정 대상 캐릭터가 아니면 빈 문자열."""
    profile = profile_of(session)
    state = session.emotion or {}
    if not profile or not state:
        return ""
    if profile.get("character_id") and profile["character_id"] != character_id:
        return ""
    directive = STATE_DIRECTIVES.get(state.get("state", ""), "")
    if state.get("eased"):
        directive = f"{directive} {EASED_DIRECTIVE}".strip()
    return directive


def signals_payload(session: RoleplaySession) -> dict:
    """턴 제출 응답에 실을 감정 신호 — 프론트 온도 게이지·표정 연출용."""
    state = session.emotion or {}
    if not state:
        return {}
    return {
        "state": state.get("state", ""),
        "label": STATE_LABELS.get(state.get("state", ""), ""),
        "temperature": state.get("temperature", 0.0),
        "eased": bool(state.get("eased")),
    }
