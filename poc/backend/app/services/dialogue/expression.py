"""표정 인지 리액션 (S-EXPR-ACK) — 관람객의 턴 표정이 상대의 반응에 실린다.

브라우저가 턴마다 보내는 표정 집계(NonverbalIn: smile_ratio·mouth_press_ratio·
brow_down_ratio — MediaPipe blendshape, 개인 무표정 기저 대비)는 지금까지 리포트
관찰 레이어에만 쓰였다. 이 모듈은 그 값을 대화 시점에 한 번 더 읽어, 상대가
"당신 얼굴을 보고 있다"는 신호를 리액션 한마디로 되돌려준다 — 화상 미팅에서
상대가 내 표정에 반응하는 그 감각.

설계 원칙:
- 판정은 보수적으로 — 표정 측정은 관찰 지표(감점 없음)라 정밀도가 우선이다.
  캘리브레이션(개인 기저) 안 된 턴·표본 부족 턴은 판정하지 않는다.
- 세션당 최대 2회, 같은 상태 연속 인지 금지 — 매 턴 "표정이 밝네요"를 반복하면
  관찰이 아니라 감시로 느껴진다.
- 인지 문장은 캐릭터 정의(expression_reactions)에 있을 때만 — 데이터 주도라
  현재는 김서윤 팀장만 갖고, 팩 캐릭터의 각본 리액션은 건드리지 않는다.
- risky 답변에는 침묵 — 단호한 경계 리액션을 표정 언급으로 희석하지 않는다.
"""
import random

from app.models import RoleplaySession

# 판정 게이트: 얼굴이 잡힌 표본 2초(80ms×25) 미만이거나 개인 기저 미보정이면 보류
MIN_FRAMES = 25
# 밝음: 턴의 30% 이상 미소 (리포트의 '길게 유지' 0.35와 '자주' 0.15 사이 —
# 한마디 건넬 만큼 뚜렷하되, 스친 미소에는 반응하지 않는 지점)
BRIGHT_SMILE = 0.30
# 긴장: 입술 압박 또는 찡그림이 턴의 30% 이상이면서 미소가 거의 없음
TENSE_SIGNAL = 0.30
TENSE_SMILE_CEIL = 0.10
# 세션당 인지 상한 — 한 번의 체험에서 "봤다"는 신호는 두 번이면 충분하다
MAX_ACKS = 2

STATE_LABELS = {"bright": "밝은 표정", "tense": "긴장한 표정"}

# Ollama 리액션 다듬기에 주입할 표정 지시문 — LLM이 표정을 '본 것처럼' 말하게 한다
DIRECTIVES = {
    "bright": "신입이 밝은 표정으로 답했습니다. 반응에 그 표정을 알아챈 한마디를 자연스럽게 담으세요.",
    "tense": "신입이 긴장한 표정으로 답했습니다. 반응에 긴장을 알아챘다는 짧은 한마디를 담으세요.",
}


def classify(nonverbal: dict | None) -> str:
    """턴 표정 집계 → "bright" | "tense" | ""(판정 보류/중립).

    bright와 tense는 임계 구성상 상호 배타다(bright는 미소 ≥ 0.30,
    tense는 미소 ≤ 0.10을 요구).
    """
    if not isinstance(nonverbal, dict):
        return ""
    if not nonverbal.get("calibrated") or (nonverbal.get("frames") or 0) < MIN_FRAMES:
        return ""
    smile = float(nonverbal.get("smile_ratio") or 0.0)
    press = float(nonverbal.get("mouth_press_ratio") or 0.0)
    brow = float(nonverbal.get("brow_down_ratio") or 0.0)
    if smile >= BRIGHT_SMILE:
        return "bright"
    if smile <= TENSE_SMILE_CEIL and max(press, brow) >= TENSE_SIGNAL:
        return "tense"
    return ""


def _pool(character: dict, state: str) -> list[str]:
    return list(((character or {}).get("expression_reactions") or {}).get(state) or [])


def apply(
    session: RoleplaySession, character: dict, reaction: str, state: str, case: str,
) -> tuple[str, str]:
    """조건 충족 시 리액션에 표정 인지 한마디를 합성. (리액션, 인지된 상태) 반환.

    합성 순서 — tense는 앞(내용 반응 전에 사람부터 살피는 순서),
    bright는 뒤(답변 평가 후 덧붙이는 한마디)가 자연스럽다.
    """
    if not state or case == "risky":
        return reaction, ""
    # 밝은 표정 언급은 답변이 좋았을 때만 — 부족한 답변에 표정 칭찬을 얹으면
    # "내용은 안 듣는다"는 신호가 된다. 긴장 다독임은 어떤 답변에도 어울린다.
    if state == "bright" and case not in ("excellent", "covered"):
        return reaction, ""
    pool = _pool(character, state)
    if not pool:
        return reaction, ""
    rapport = dict(session.rapport or {})
    acks = dict(rapport.get("expr") or {})
    if acks.get("count", 0) >= MAX_ACKS or acks.get("last") == state:
        return reaction, ""
    ack = random.choice(pool)
    combined = f"{ack} {reaction}".strip() if state == "tense" else f"{reaction} {ack}".strip()
    rapport["expr"] = {"count": acks.get("count", 0) + 1, "last": state}
    session.rapport = rapport
    return combined, state


def directive_for(state: str) -> str:
    return DIRECTIVES.get(state, "")


def signals_payload(state: str) -> dict:
    """턴 제출 응답에 실을 표정 인지 신호 — 인지가 실제 발화에 실렸을 때만."""
    if not state:
        return {}
    return {"state": state, "label": STATE_LABELS[state]}
