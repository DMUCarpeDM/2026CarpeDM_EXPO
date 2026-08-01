"""팩 세션 리포트 E2E — 등급·코칭 카드·감정 여정·루브릭 가중 총점·클레임 QR 링크.

카페 크루 팩으로 한 세션을 완주시키고, B2B 확장 필드가 리포트 계약대로
내려오는지 검증한다 (Ollama 없이 — judge는 폴백, 판정은 키워드 결정적).
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.seed.run import seed

pytestmark = pytest.mark.usefixtures("ready_ollama")

client = TestClient(app)

CONSENT = {"agreed": True, "storage_policy": "anonymous"}

# 턴별 답변: 1턴은 위험 표현 포함(코칭 카드 재료), 이후는 성실한 답변
ANSWERS = [
    "그건 제 잘못이 아닌데요. 주문은 다른 직원이 받았어요.",
    "죄송합니다. 오래 기다리셨는데 음료까지 잘못 나가서 정말 죄송합니다. 온도라떼 바로 다시 만들어 드리겠습니다.",
    "불편을 드려 온도 포인트로 보상해 드리고, 주문 확인 절차를 다시 점검하겠습니다.",
    "가장 오래 기다린 매장 주문부터 잡고, 제가 에스프레소 라인을 맡을 테니 픽업대를 봐주세요. 막히면 바로 여쭤보겠습니다.",
    "대기 손님들께는 예상 시간을 먼저 안내하겠습니다.",
    "쇼케이스 샌드위치 중 유통기한이 지난 제품 2개를 확인해서 바로 진열대에서 내려 분리해 뒀습니다. 폐기 절차는 점장님 확인을 받고 싶습니다.",
]


def test_cafe_crew_session_report_carries_b2b_fields():
    seed()
    created = client.post("/api/sessions", json={
        "mode": 5, "difficulty": "basic", "consent": CONSENT,
        "scenario_slug": "ondo-cafe-crew",
    })
    assert created.status_code == 200, created.text
    session = created.json()
    sid = session["id"]
    auth = {"X-Session-Token": session["access_token"]}
    assert session["scenario"]["slug"] == "ondo-cafe-crew"

    turn = session["current_turn"]
    for answer in ANSWERS:
        resp = client.post(
            f"/api/sessions/{sid}/turns/{turn['id']}/response",
            json={"text": answer, "stt_source": "text", "duration_ms": 8000},
            headers=auth,
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        if body["finished"]:
            break
        turn = body["next_turn"]

    client.post(f"/api/sessions/{sid}/finish", headers=auth)
    from app.services.analysis import run_analysis

    run_analysis(sid)

    rep = client.get(f"/api/sessions/{sid}/report", headers=auth)
    assert rep.status_code == 200, rep.text
    report = rep.json()

    # 등급 (S-B2B-SCORE) — 원점수와 등급 매핑 일치
    from app.services.score_policy import grade_of

    assert report["grade"] == grade_of(report["total_score"])

    # 루브릭 가중 총점 (S-B2B-PACK): 팩 가중치로 재계산한 값과 일치해야 한다
    weights = {"response": 0.35, "voice": 0.3, "expression": 0.2, "posture": 0.15}
    measured = {
        fit: data["score"] for fit, data in report["fit_scores"].items()
        if data.get("score") is not None
    }
    weight_sum = sum(weights[f] for f in measured)
    expected = round(sum(s * weights[f] for f, s in measured.items()) / weight_sum, 1)
    assert report["total_score"] == expected

    # 감정 여정 (S-B2B-EMOTION): 히스토리가 실제 턴 수만큼 쌓였다
    journey = report["emotion_journey"]
    assert journey.get("history"), "감정 여정이 리포트에 있어야 한다"
    assert journey["state"] in ("calm", "displeased", "agitated")

    # 코칭 카드 (S-B2B-COACH): 1턴의 위험 표현이 Before→After로 잡힌다
    assert report["coaching"], "위험 표현이 있었으므로 코칭 카드가 나와야 한다"
    first = report["coaching"][0]
    assert first["quote"] and first["suggestion"]

    # 영수증 QR (S-B2B-CLAIM): 미귀속 세션은 claim_url 제공
    assert "token=" in report["claim_url"]

    # 파라링귀스틱 요약이 말하기 데이터에 실린다 (텍스트 턴 — 실측 없음이 정직하게 표기)
    para = report["speech_stats"]["paralinguistics"]
    assert para["measured_turns"] == 0
    assert para["long_pause_total"] is None


def test_none_consent_purges_judge_reasoning(monkeypatch):
    """'미저장' 동의 — judge 채점 근거(발화 인용 가능)도 분석 직후 파기된다.

    수치 투명성(n·중앙값·혼합·표본 점수)은 남고 reasoning 텍스트만 사라진다.
    즉시 열람용 사본(report.deep_analysis.judge)은 보관 기간 정책이 지운다.
    """
    from app.services import analysis as analysis_module

    seed()
    monkeypatch.setattr(
        analysis_module.judge, "judge_response_session",
        lambda turns, brand="", world_hint="": {
            "n": 3,
            "samples": [{"score": 70, "reasoning": "사용자 발화 '죄송합니다'를 인용한 근거"}] * 3,
            "median": 70.0,
        },
    )
    created = client.post("/api/sessions", json={
        "mode": 5, "difficulty": "basic",
        "consent": {"agreed": True, "storage_policy": "none"},
        "scenario_slug": "ondo-cafe-crew",
    })
    session = created.json()
    auth = {"X-Session-Token": session["access_token"]}
    client.post(
        f"/api/sessions/{session['id']}/turns/{session['current_turn']['id']}/response",
        json={"text": "정말 죄송합니다. 온도라떼 바로 다시 만들어 드리겠습니다.",
              "stt_source": "text", "duration_ms": 6000},
        headers=auth,
    )
    client.post(f"/api/sessions/{session['id']}/finish", headers=auth)
    from app.services.analysis import run_analysis

    run_analysis(session["id"])

    from app.core.database import SessionLocal
    from app.models import AnalysisResult, FitType

    db = SessionLocal()
    try:
        row = db.query(AnalysisResult).filter(
            AnalysisResult.session_id == session["id"],
            AnalysisResult.turn_id.is_(None),
            AnalysisResult.fit_type == FitType.response,
        ).first()
        judge_meta = (row.raw_metrics or {}).get("judge") or {}
        assert judge_meta.get("median") == 70.0, "수치 투명성은 유지"
        assert all("reasoning" not in s for s in judge_meta.get("samples", [])), \
            "미저장 동의 세션에 judge 근거 텍스트가 남으면 안 된다"
    finally:
        db.close()
