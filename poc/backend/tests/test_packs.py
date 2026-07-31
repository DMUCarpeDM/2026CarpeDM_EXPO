"""시나리오 팩 로더 (S-B2B-PACK) — 검증·멱등 적재·직무 콘텐츠 계약."""
import pytest

from app.core.database import SessionLocal
from app.models import Episode, Scenario
from app.seed.packs import PackError, _validate, load_pack_files, seed_packs
from app.seed.run import seed


def test_pack_files_load_and_validate():
    packs = load_pack_files()
    slugs = {p["slug"] for p in packs}
    assert {"ondo-cafe-crew", "ondo-cs-agent"} <= slugs
    for pack in packs:
        # 직무·도메인 태그 (C-10/C-11)
        assert pack["domain"] in ("office", "service")
        assert pack["job_role"]
        # 루브릭 가중치 합 1.0
        assert abs(sum(pack["rubric_weights"].values()) - 1.0) < 0.01
        # 에피소드 체크리스트에 followup·키워드·모범 문장(paraphrases)이 있다
        for ep in pack["episodes"]:
            for item in ep.get("checklist", []):
                assert item["keywords"], f"{pack['slug']}/{item['id']}: keywords 필요"
                assert item["followup"], f"{pack['slug']}/{item['id']}: followup 필요"
                assert item.get("paraphrases"), f"{pack['slug']}/{item['id']}: paraphrases 필요"


def test_validate_rejects_broken_packs():
    base = {
        "slug": "x", "title": "t",
        "characters": [{"id": "a"}],
        "episodes": [{"order": 1, "title": "e", "character_id": "a", "initial_question": "q"}],
    }
    _validate(base, "ok.json")  # 통과해야 한다
    with pytest.raises(PackError):
        _validate({**base, "rubric_weights": {"response": 0.9}}, "sum.json")
    with pytest.raises(PackError):
        _validate({**base, "rubric_weights": {"unknown": 1.0}}, "axis.json")
    with pytest.raises(PackError):
        _validate({
            **base,
            "episodes": [{"order": 1, "title": "e", "character_id": "ghost", "initial_question": "q"}],
        }, "char.json")
    with pytest.raises(PackError):
        _validate({
            **base,
            "emotion_profile": {"enabled": True, "character_id": "ghost"},
        }, "emo.json")


def test_seed_packs_idempotent_and_active():
    """seed()가 팩을 적재하고, 재실행해도 중복 없이 갱신된다."""
    seed()
    seed()  # 멱등
    db = SessionLocal()
    try:
        crew = db.query(Scenario).filter_by(slug="ondo-cafe-crew").all()
        assert len(crew) == 1
        scenario = crew[0]
        assert scenario.is_active is True
        assert scenario.domain == "service"
        assert scenario.job_role == "cafe_crew"
        assert scenario.brand == "cafe-ondo"
        assert scenario.emotion_profile.get("enabled") is True
        assert scenario.world_setting.get("endings"), "팩 자체 결말 분기가 있어야 한다"
        # 각본 고정 정책 — 질문은 팩 문장 그대로, LLM은 리액션만 다듬는다
        assert scenario.dialogue_policy.get("personalize_questions") is False
        episodes = db.query(Episode).filter_by(scenario_id=scenario.id).order_by(Episode.order).all()
        assert len(episodes) == 3
        # 기존 전시 시나리오도 여전히 활성 + 직무 태그
        legacy = db.query(Scenario).filter_by(slug="release-schedule-alignment").first()
        assert legacy.is_active is True
        assert legacy.job_role == "office_admin"
        # 기존 시나리오는 가중치가 비어(균등 가중) 골든 점수 호환을 유지한다
        assert not legacy.rubric_weights
    finally:
        db.close()


def test_generic_keywords_rejected_by_loader():
    """범용 기능어 키워드('확인'·'까지'·'다음' 등)는 허위 커버를 일으키므로 거부."""
    base = {
        "slug": "x", "title": "t",
        "characters": [{"id": "a"}],
        "episodes": [{
            "order": 1, "title": "e", "character_id": "a", "initial_question": "q",
            "checklist": [{"id": "c1", "label": "l", "keywords": ["확인"], "followup": "f"}],
        }],
    }
    with pytest.raises(PackError):
        _validate(base, "generic.json")


def test_rubric_weights_require_all_axes():
    """부분 지정 가중치는 미지정 축이 암묵적 0.25를 받아 팩 의도와 어긋난다 — 거부."""
    base = {
        "slug": "x", "title": "t",
        "characters": [{"id": "a"}],
        "episodes": [{"order": 1, "title": "e", "character_id": "a", "initial_question": "q"}],
        "rubric_weights": {"response": 0.5, "voice": 0.5},
    }
    with pytest.raises(PackError):
        _validate(base, "axes.json")


def test_pure_apology_does_not_falsely_cover_other_items():
    """허위 커버 회귀 고정 — 순수 사과문이 보상·시점 약속 항목을 커버하면 안 된다.

    리뷰에서 잡힌 결함: '다음'·'까지'·'확인' 류 범용 키워드가 부분 문자열 매칭에
    걸려, 보상 언급이 전혀 없는 답이 coverage 1.0 → excellent → 감정 급락 →
    후속 질문 미발화까지 연쇄 오염을 일으켰다.
    """
    from app.ai.text_match import matched_checklist_ids

    packs = {p["slug"]: p for p in load_pack_files()}

    cafe_ep1 = packs["ondo-cafe-crew"]["episodes"][0]["checklist"]
    covered = matched_checklist_ids("죄송합니다. 다음 음료 바로 새로 만들어 드릴게요.", cafe_ep1)
    assert "apology_compensation" not in covered, "보상 언급 없는 답이 보상 항목을 커버하면 안 된다"

    cs_ep1 = packs["ondo-cs-agent"]["episodes"][0]["checklist"]
    covered = matched_checklist_ids("음료까지 다 늦어서 불편을 드려 죄송합니다.", cs_ep1)
    assert "call_promise" not in covered, "순수 사과가 회신 시점 약속을 커버하면 안 된다"

    cafe_ep3 = packs["ondo-cafe-crew"]["episodes"][2]["checklist"]
    covered = matched_checklist_ids("확인해 보니 유통기한이 지난 샌드위치가 2개 있었습니다.", cafe_ep3)
    assert "report_escalate" not in covered, "사실 진술이 확인 요청·재발 방지를 커버하면 안 된다"

    # 의도된 모범 문장은 여전히 인식된다 (조이기만 하고 죽이지 않았는지)
    covered = matched_checklist_ids(
        "정말 죄송합니다. 온도라떼 바로 다시 만들어 드리고, 온도 포인트로 보상해 드리겠습니다.",
        cafe_ep1,
    )
    assert {"apology_empathy", "apology_action", "apology_compensation"} <= covered


def test_pack_scenarios_visible_in_listing():
    seed()
    from fastapi.testclient import TestClient

    from app.main import app

    slugs = {s["slug"] for s in TestClient(app).get("/api/scenarios").json()}
    assert {"ondo-cafe-crew", "ondo-cs-agent", "release-schedule-alignment"} <= slugs
