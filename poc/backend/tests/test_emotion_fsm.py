"""감정 상태 머신 (S-B2B-EMOTION) — 전이 규칙·상태 주입·턴 신호 계약."""
import pytest
from fastapi.testclient import TestClient

from app.core.database import SessionLocal
from app.main import app
from app.models import RoleplaySession, Scenario
from app.seed.run import seed
from app.services.dialogue import emotion

pytestmark = pytest.mark.usefixtures("ready_ollama")

client = TestClient(app)

CONSENT = {"agreed": True, "storage_policy": "none"}


def _session_with_profile(db, enabled=True, initial=72.0):
    scenario = db.query(Scenario).filter_by(slug="ondo-cafe-crew").first()
    assert scenario is not None, "카페 크루 팩이 시드되어야 한다"
    if not enabled:
        scenario = db.query(Scenario).filter_by(slug="release-schedule-alignment").first()
    session = RoleplaySession(scenario_id=scenario.id)
    db.add(session)
    db.flush()
    return session


def test_temperature_bands_and_transitions():
    assert emotion.state_of_temperature(10) == "calm"
    assert emotion.state_of_temperature(50) == "displeased"
    assert emotion.state_of_temperature(80) == "agitated"


def test_update_moves_temperature_by_case():
    seed()
    db = SessionLocal()
    try:
        session = _session_with_profile(db)
        state = emotion.ensure_state(session)
        assert state["state"] == "agitated"  # 초기 72
        # 좋은 대응 → 온도 하강 + 완화 플래그 (72 → 54, displeased)
        state = emotion.update(session, "excellent", turn_order=1)
        assert state["temperature"] == 54.0
        assert state["state"] == "displeased"
        assert state["eased"] is True
        # 나쁜 대응 → 온도 급등 (54 → 76, agitated)
        state = emotion.update(session, "risky", turn_order=2)
        assert state["temperature"] == 76.0
        assert state["state"] == "agitated"
        assert state["eased"] is False
        # 이력이 남는다 (리포트 감정 여정)
        assert [h["case"] for h in state["history"]] == ["excellent", "risky"]
        # 경계 클램프
        for _ in range(5):
            state = emotion.update(session, "risky", turn_order=3)
        assert state["temperature"] == 100.0
    finally:
        db.rollback()
        db.close()


def test_inactive_without_profile():
    """감정 프로파일이 없는 기존 전시 시나리오는 상태 머신이 비활성 — 동작 무변화."""
    seed()
    db = SessionLocal()
    try:
        session = _session_with_profile(db, enabled=False)
        assert emotion.ensure_state(session) == {}
        assert emotion.update(session, "excellent", 1) == {}
        assert emotion.directive_for(session, "kim_teamlead") == ""
        assert emotion.signals_payload(session) == {}
    finally:
        db.rollback()
        db.close()


def test_directive_only_for_target_character():
    """상태 지시문은 감정 대상 캐릭터(진상 고객)에게만 주입된다."""
    seed()
    db = SessionLocal()
    try:
        session = _session_with_profile(db)
        emotion.ensure_state(session)
        assert "격앙" in emotion.directive_for(session, "angry_customer")
        assert emotion.directive_for(session, "jang_manager") == ""
        # 완화 시 지시문에 완화 문구가 붙는다
        emotion.update(session, "excellent", 1)
        directive = emotion.directive_for(session, "angry_customer")
        assert "누그러" in directive
    finally:
        db.rollback()
        db.close()


def test_emotion_scenario_first_line_stays_scripted(monkeypatch):
    """감정 시나리오의 도입 대사는 개인화하지 않는다 — 역할 반전 사고 방지 (리허설 실측).

    격앙한 고객의 첫마디를 소형 LLM이 다듬으면 직원처럼 사과하는 문장으로
    뒤집힐 수 있다. 기존(감정 비활성) 시나리오의 첫 질문 개인화는 유지된다.
    """
    from app.services.dialogue import reactions as reactions_module
    from app.services.dialogue.ollama_provider import OllamaDialogueProvider

    seed()
    calls = []
    reaction_calls = []
    monkeypatch.setattr(
        OllamaDialogueProvider, "personalize_question",
        lambda _self, spec, *a, **k: calls.append(spec.question_type) or spec.question_text,
    )
    monkeypatch.setattr(
        reactions_module, "personalize_reaction",
        lambda reaction, *a, **k: reaction_calls.append(reaction) or reaction,
    )

    crew = client.post("/api/sessions", json={
        "mode": 5, "consent": CONSENT, "scenario_slug": "ondo-cafe-crew",
    }).json()
    assert calls == [], "감정 시나리오 첫 턴은 개인화 호출 자체가 없어야 한다"
    # 각본 원문 그대로 — 격앙한 고객의 컴플레인
    assert "온도라떼" in crew["current_turn"]["question_text"]
    assert "10분" in crew["current_turn"]["question_text"]

    # 팩 정책(personalize_questions=false): 이후 턴의 질문도 각본 그대로 —
    # 소형 LLM 재작성이 캐릭터 말맛을 안내문 격식체로 뭉개는 문제의 구조적 차단.
    # '개인화 체감'은 리액션(personalize_reaction)과 감정 게이지가 담당한다.
    headers = {"X-Session-Token": crew["access_token"]}
    resp = client.post(
        f"/api/sessions/{crew['id']}/turns/{crew['current_turn']['id']}/response",
        headers=headers,
        json={"text": "정말 죄송합니다. 온도라떼 바로 다시 만들어 드리겠습니다.",
              "stt_source": "text", "duration_ms": 6000},
    )
    assert resp.status_code == 200, resp.text
    assert calls == [], "팩 시나리오는 이후 턴 질문도 개인화하지 않는다 (각본 고정)"
    # 리액션도 각본 풀 그대로 — LLM 재작성이 역할을 흐리는 문제(고객이 직원
    # 말투로 "신경 써 볼게요" — 실측)의 차단. 풀 문장 중 하나가 그대로 나온다.
    assert reaction_calls == [], "팩 시나리오는 리액션도 LLM 재작성하지 않는다"
    reaction_text = resp.json()["next_turn"]["reaction_text"] if resp.json()["next_turn"] else ""
    if reaction_text:
        from app.seed.packs import load_pack_files

        crew_pack = next(p for p in load_pack_files() if p["slug"] == "ondo-cafe-crew")
        customer = next(c for c in crew_pack["characters"] if c["id"] == "angry_customer")
        pool = [line for lines in customer["reactions"].values() for line in lines]
        assert reaction_text in pool, "리액션은 팩 풀 원문이어야 한다"
    next_turn = resp.json()["next_turn"]
    if next_turn:  # 다음 질문은 팩 각본 문장 그대로다
        from app.seed.packs import load_pack_files

        pack = next(p for p in load_pack_files() if p["slug"] == "ondo-cafe-crew")
        scripted = {ep["initial_question"] for ep in pack["episodes"]}
        for ep in pack["episodes"]:
            scripted |= {item["followup"] for item in ep.get("checklist", [])}
            scripted |= {q["text"] for q in ep.get("deepening_questions", [])}
            scripted |= {q["text"] for q in ep.get("pressure_questions", [])}
            scripted |= set((ep.get("intro_variants") or {}).values())
        assert next_turn["question_text"] in scripted, "팩 질문은 각본 문장 중 하나여야 한다"

    client.post("/api/sessions", json={
        "mode": 5, "consent": CONSENT, "scenario_slug": "release-schedule-alignment",
    })
    assert calls == ["initial"], "기존(감정 비활성) 시나리오의 첫 질문 개인화는 유지"


def test_turn_signals_carry_emotion_via_api():
    """관통: 팩 세션의 턴 제출 응답에 감정 게이지가 실린다."""
    seed()
    created = client.post("/api/sessions", json={
        "mode": 5, "difficulty": "basic", "consent": CONSENT,
        "scenario_slug": "ondo-cafe-crew",
    })
    assert created.status_code == 200, created.text
    session = created.json()
    headers = {"X-Session-Token": session["access_token"]}
    turn = session["current_turn"]
    resp = client.post(
        f"/api/sessions/{session['id']}/turns/{turn['id']}/response",
        headers=headers,
        json={
            "text": "오래 기다리셨는데 음료까지 잘못 나가서 정말 죄송합니다. 온도라떼 바로 다시 만들어 드리고, 온도 포인트로 보상도 도와드리겠습니다.",
            "stt_source": "text", "duration_ms": 9000,
        },
    )
    assert resp.status_code == 200, resp.text
    signals = resp.json()["turn_signals"]
    assert signals["emotion"], "팩 세션은 감정 신호가 있어야 한다"
    assert signals["emotion"]["state"] in ("calm", "displeased", "agitated")
    assert 0 <= signals["emotion"]["temperature"] <= 100
    # 좋은 응대였다면 초기(72)보다 내려갔어야 한다
    assert signals["emotion"]["temperature"] < 72


def test_existing_scenario_has_no_emotion_signal():
    """기존 전시 시나리오 세션은 emotion이 빈 dict — 하위 호환."""
    seed()
    created = client.post("/api/sessions", json={
        "mode": 5, "difficulty": "basic", "consent": CONSENT,
        "scenario_slug": "release-schedule-alignment",
    })
    session = created.json()
    headers = {"X-Session-Token": session["access_token"]}
    turn = session["current_turn"]
    resp = client.post(
        f"/api/sessions/{session['id']}/turns/{turn['id']}/response",
        headers=headers,
        json={"text": "안녕하세요, 오늘 합류한 신입입니다. 잘 부탁드립니다.", "stt_source": "text", "duration_ms": 4000},
    )
    assert resp.json()["turn_signals"]["emotion"] == {}
