"""시드 콘텐츠 품질 규격 + 실제 시드 기반 대화 엔진 동작 검증."""
from app.models import Episode, RoleplaySession, Turn
from app.seed.seed_data import BANNED_PHRASES, EPISODES, RECOMMENDED_PHRASES_BY_CONTEXT
from app.services.dialogue.template_provider import TemplateDialogueProvider

provider = TemplateDialogueProvider()


def seed_episodes() -> list[Episode]:
    return [Episode(id=i + 1, scenario_id=1, **ep) for i, ep in enumerate(EPISODES)]


def make_turn(id: int, episode_id: int, order: int, response: str, qtype: str = "initial") -> Turn:
    return Turn(
        id=id, session_id=1, episode_id=episode_id, order=order,
        question_type=qtype, question_text="q", character_id="c", response_text=response,
    )


# ---- 콘텐츠 규격 (프롬프트 수용 기준) ----

def test_every_checklist_item_has_enough_keywords_and_followup():
    for ep in EPISODES:
        for item in ep["checklist"]:
            assert len(item["keywords"]) >= 5, f"{ep['title']}/{item['id']}: 키워드 5개 미만"
            assert item["followup"].strip(), f"{ep['title']}/{item['id']}: 후속 질문 없음"
            assert item["label"].strip()


def test_banned_phrases_meet_spec():
    assert len(BANNED_PHRASES) >= 20
    for b in BANNED_PHRASES:
        assert b["severity"] in ("high", "medium")
        assert len(b["reason"]) >= 10, f"{b['phrase']}: reason이 실무 관점 설명으로 부족"


def test_recommended_phrases_grouped_by_context():
    assert set(RECOMMENDED_PHRASES_BY_CONTEXT) >= {"보고", "사과", "거절/조율", "감사/관계"}
    assert all(len(v) >= 3 for v in RECOMMENDED_PHRASES_BY_CONTEXT.values())


def test_every_episode_has_intent_and_pressure():
    for ep in EPISODES:
        assert len(ep["question_intent"]) >= 30, f"{ep['title']}: 질문 의도에 근거 부족"
        assert ep["pressure_questions"], f"{ep['title']}: 압박 질문 없음"


def test_keywords_match_common_conjugations():
    """'~드립니다' 활용형이 키워드에 걸리는지 — '드리'로 끝나는 키워드는 substring 미스가 난다."""
    from app.ai.text_match import matched_checklist_ids

    ep1 = next(e for e in EPISODES if e["order"] == 1)
    covered = matched_checklist_ids(
        "안녕하세요, 신입 김지연입니다. 플랫폼팀 업무를 맡았고 오늘 목표는 온보딩 파악입니다. 잘 부탁드립니다.",
        ep1["checklist"],
    )
    assert "intro_attitude" in covered, "'부탁드립니다'가 협업 의지로 매칭돼야 함"

    ep2 = next(e for e in EPISODES if e["order"] == 2)
    covered2 = matched_checklist_ids("바로 선임님께 말씀드립니다. 15분 안에 공유드립니다.", ep2["checklist"])
    assert "incident_escalate" in covered2
    assert "incident_timeline" in covered2


# ---- 실제 시드로 대화 엔진 E2E (검증 조건 2) ----

def test_evasive_answer_triggers_specific_followup():
    """회피성 답변 → 가중치 최상(에스컬레이션/시점) 누락 항목을 정확히 찌르는 후속 질문."""
    eps = seed_episodes()
    session = RoleplaySession(id=1, scenario_id=1, mode=5, difficulty="basic")
    ep2 = next(e for e in eps if e.order == 2)
    turns = [
        make_turn(1, eps[0].id, 1, "안녕하세요, 신입 김지연입니다. 플랫폼팀 업무를 익히는 게 목표입니다. 잘 부탁드립니다."),
        make_turn(2, ep2.id, 2, "어... 저는 잘 몰라요. 오늘 처음 와서요."),
    ]
    spec = provider.next_question(session, eps, turns)
    assert spec is not None
    assert spec.question_type == "followup"
    assert spec.episode_id == ep2.id
    # 최고 가중치(1.5) 항목인 에스컬레이션 또는 시점 약속을 찔러야 함
    top_followups = {
        item["followup"]
        for item in ep2.checklist if item["weight"] >= 1.5
    }
    assert spec.question_text in top_followups


def test_model_answer_ep1_gets_deepening():
    """모범 자기소개(EP1은 basic 압박 없음) → 교정이 아니라 심화로 장면이 이어진다."""
    eps = seed_episodes()
    session = RoleplaySession(id=1, scenario_id=1, mode=5, difficulty="basic")
    turns = [
        make_turn(1, eps[0].id, 1,
                  "안녕하세요, 신입 김지연입니다. 플랫폼팀 백엔드 운영 지원을 맡았고, "
                  "오늘은 온보딩 문서 파악을 마치는 게 목표입니다. 모르는 건 여쭤보며 배우겠습니다."),
    ]
    spec = provider.next_question(session, eps, turns)
    assert spec is not None
    assert spec.question_type == "deepening"  # 잘한 답 → 장면 전개
    assert spec.episode_id == eps[0].id


def test_model_answer_ep2_gets_basic_pressure_then_advances():
    """모범 장애 대응(EP2는 basic 압박 보유) → 세션 첫 압박이 나가고(composure 재료),
    압박까지 답하면 다음 에피소드로 넘어간다 — '상황당 1답변 증발' 방지 + 압박 내성 성립."""
    eps = seed_episodes()
    session = RoleplaySession(id=1, scenario_id=1, mode=5, difficulty="basic")
    ep2 = next(e for e in eps if e.order == 2)
    ep3 = next(e for e in eps if e.order == 3)
    model_answer = (
        "불편을 드려 죄송합니다. 접수된 증상은 파악했고 정확한 원인은 확인 중입니다. "
        "바로 박서연 선임님께 보고드리고, 15분 안에 1차 결과를 회신드리겠습니다."
    )
    turns = [
        make_turn(1, eps[0].id, 1, "안녕하세요, 신입 김지연입니다. 플랫폼팀 업무 파악이 오늘 목표입니다. 잘 부탁드립니다."),
        make_turn(2, ep2.id, 2, model_answer),
    ]
    spec = provider.next_question(session, eps, turns)
    assert spec is not None
    assert spec.question_type == "pressure"  # basic 난이도에도 세션당 1회 압박
    assert spec.episode_id == ep2.id

    turns.append(make_turn(3, ep2.id, 3, "10분 안에 1차 원인만이라도 정리해 보고드리겠습니다.", qtype="pressure"))
    spec2 = provider.next_question(session, eps, turns)
    assert spec2 is not None
    assert spec2.episode_id == ep3.id and spec2.question_type == "initial"


def test_every_episode_has_deepening_pool():
    """모든 에피소드에 심화 질문 2개 이상 — 장면당 2턴 기본화의 콘텐츠 규격."""
    for ep in EPISODES:
        pool = ep.get("deepening_questions", [])
        assert len(pool) >= 2, f"{ep['title']}: 심화 질문 부족"
        for dq in pool:
            assert dq["text"].strip().endswith(("요?", "요.", "봐요.", "죠?", "까요?", "래요?", "예요?", "어요?")) or "?" in dq["text"], \
                f"{ep['title']}: 심화 질문이 질문형이 아님"
            assert dq.get("intent", "").strip(), f"{ep['title']}: 심화 의도 없음"
