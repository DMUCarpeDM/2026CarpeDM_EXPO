"""표정 인지 리액션 (S-EXPR-ACK) — 관람객 표정이 상대 리액션에 실리는 경로 검증.

판정(classify)은 보수 게이트(캘리브레이션·표본·임계)를, 합성(apply)은
케이스 게이트·세션 상한·문장 순서를, API 테스트는 턴 제출 → 리액션 합성 →
turn_signals 노출의 전 구간을 고정한다.
"""
from fastapi.testclient import TestClient

from app.main import app
from app.core.config import settings
from app.models import RoleplaySession
from app.seed.run import seed
from app.seed.seed_data import CHARACTERS
from app.services.dialogue import expression

client = TestClient(app)
CONSENT = {"agreed": True, "storage_policy": "none"}

TEAM_LEAD = next(c for c in CHARACTERS if c["id"] == "kim_teamlead")
BRIGHT_POOL = TEAM_LEAD["expression_reactions"]["bright"]
TENSE_POOL = TEAM_LEAD["expression_reactions"]["tense"]


def nv(**kw) -> dict:
    """판정 가능한 기본 페이로드 (캘리브레이션 완료 + 표본 충분)."""
    base = {"calibrated": True, "frames": 60, "smile_ratio": 0.0,
            "mouth_press_ratio": 0.0, "brow_down_ratio": 0.0}
    base.update(kw)
    return base


def session(**kw) -> RoleplaySession:
    return RoleplaySession(id=1, scenario_id=1, mode=5, difficulty="basic", **kw)


# ---- 판정 (classify) ----

def test_classify_requires_payload_and_calibration():
    assert expression.classify(None) == ""
    assert expression.classify({}) == ""
    assert expression.classify(nv(calibrated=False, smile_ratio=0.9)) == ""
    assert expression.classify(nv(frames=10, smile_ratio=0.9)) == ""


def test_classify_bright_on_sustained_smile():
    assert expression.classify(nv(smile_ratio=0.35)) == "bright"


def test_classify_tense_on_press_or_brow_without_smile():
    assert expression.classify(nv(mouth_press_ratio=0.4)) == "tense"
    assert expression.classify(nv(brow_down_ratio=0.35, smile_ratio=0.05)) == "tense"


def test_classify_neutral_between_thresholds():
    # 스친 미소·가벼운 긴장은 판정하지 않는다 — 인지 한마디는 뚜렷할 때만
    assert expression.classify(nv(smile_ratio=0.2, mouth_press_ratio=0.2)) == ""


def test_classify_smile_blocks_tense():
    # 미소가 섞인 긴장 신호(긴장성 미소)는 밝음으로 본다 — 다독임보다 오판이 덜 위험
    assert expression.classify(nv(smile_ratio=0.35, mouth_press_ratio=0.5)) == "bright"


# ---- 합성 (apply) ----

def test_apply_tense_prepends_before_case_reaction():
    s = session()
    combined, acked = expression.apply(s, TEAM_LEAD, "네, 방향은 맞아요.", "tense", "covered")
    assert acked == "tense"
    assert combined.endswith("네, 방향은 맞아요.")
    assert any(combined.startswith(line) for line in TENSE_POOL)
    assert s.rapport["expr"] == {"count": 1, "last": "tense"}


def test_apply_bright_appends_after_case_reaction():
    s = session()
    combined, acked = expression.apply(s, TEAM_LEAD, "좋아요. 결론이 먼저 나왔네요.", "bright", "excellent")
    assert acked == "bright"
    assert combined.startswith("좋아요. 결론이 먼저 나왔네요.")
    assert any(combined.endswith(line) for line in BRIGHT_POOL)


def test_apply_bright_needs_good_case():
    # 부족한 답변에 표정 칭찬을 얹으면 "내용은 안 듣는다"는 신호가 된다
    s = session()
    combined, acked = expression.apply(s, TEAM_LEAD, "결론부터 다시요.", "bright", "missing")
    assert (combined, acked) == ("결론부터 다시요.", "")


def test_apply_never_on_risky():
    s = session()
    combined, acked = expression.apply(s, TEAM_LEAD, "말투부터 정리해 주세요.", "tense", "risky")
    assert (combined, acked) == ("말투부터 정리해 주세요.", "")


def test_apply_skips_characters_without_pool():
    s = session()
    senior = next(c for c in CHARACTERS if c["id"] == "park_senior")
    combined, acked = expression.apply(s, senior, "네, 방향은 맞아요.", "tense", "covered")
    assert (combined, acked) == ("네, 방향은 맞아요.", "")


def test_apply_blocks_same_state_repeat_and_caps_per_session():
    s = session()
    _, first = expression.apply(s, TEAM_LEAD, "A.", "tense", "covered")
    assert first == "tense"
    # 같은 상태 연속 인지 금지 — 매 턴 "긴장했네요"는 관찰이 아니라 감시다
    _, repeat = expression.apply(s, TEAM_LEAD, "B.", "tense", "covered")
    assert repeat == ""
    _, second = expression.apply(s, TEAM_LEAD, "C.", "bright", "excellent")
    assert second == "bright"
    # 세션 상한 2회 — 상태가 바뀌어도 더는 언급하지 않는다
    _, third = expression.apply(s, TEAM_LEAD, "D.", "tense", "covered")
    assert third == ""
    assert s.rapport["expr"]["count"] == 2


def test_apply_ack_alone_when_no_base_reaction():
    s = session()
    combined, acked = expression.apply(s, TEAM_LEAD, "", "tense", "covered")
    assert acked == "tense"
    assert combined in TENSE_POOL


def test_signals_payload_shape():
    assert expression.signals_payload("") == {}
    assert expression.signals_payload("tense") == {"state": "tense", "label": "긴장한 표정"}


# ---- API 통합: 턴 제출 → 리액션 합성 → turn_signals ----

def test_submit_response_carries_expression_ack(monkeypatch):
    # Given: 팀장 장면으로 시작한 세션 (템플릿 제공자 — 외부 의존 없이 결정적).
    # 전시 PC .env가 시작 게이트를 켜 두었어도 이 테스트는 영향받지 않게 명시로 끈다.
    seed()
    monkeypatch.setattr(settings, "dialogue_provider", "template")
    monkeypatch.setattr(settings, "dialogue_require_ollama", False)
    scenario = client.get("/api/scenarios").json()[0]
    episode = next(
        item for item in scenario["episodes"]
        if item["character_id"] == "kim_teamlead" and 5 in item["modes"]
    )
    started = client.post("/api/sessions", json={
        "scenario_slug": scenario["slug"], "selected_episode_id": episode["id"],
        "mode": 5, "difficulty": "basic", "consent": CONSENT,
    })
    assert started.status_code == 200
    body = started.json()
    turn = body["current_turn"]

    # When: 긴장 표정 집계와 함께 정중한 답변을 제출하면
    submitted = client.post(
        f"/api/sessions/{body['id']}/turns/{turn['id']}/response",
        headers={"X-Session-Token": body["access_token"]},
        json={
            "text": "네, 제가 상황을 먼저 확인하고 정리해서 바로 말씀드리겠습니다.",
            "stt_source": "webspeech", "duration_ms": 4000,
            "nonverbal": nv(mouth_press_ratio=0.5),
        },
    )

    # Then: 팀장 리액션 앞에 긴장 인지 한마디가 붙고, turn_signals에도 노출된다.
    assert submitted.status_code == 200
    result = submitted.json()
    assert result["turn_signals"]["expression"] == {"state": "tense", "label": "긴장한 표정"}
    reaction = result["next_turn"]["reaction_text"]
    assert any(reaction.startswith(line) for line in TENSE_POOL)
    assert result["next_turn"]["reaction_character_id"] == "kim_teamlead"
