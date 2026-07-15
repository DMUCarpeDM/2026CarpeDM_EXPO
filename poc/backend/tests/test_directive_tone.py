"""완곡 명령(상향 지시형) 감지 — 신입이 상사·선배에게 지시형 어미를 쓰는 실수.

마스터리 ②에 명시됐으나 미구현이던 항목. 관찰 코칭 전용(점수 미반영)이며,
오분류는 '놓침'(과소 감지) 쪽으로 좁게 설계 — 요청·질문·인사말은 면제한다.
"""
from app.ai.discourse import analyze_discourse
from app.services.deep_analysis import build_delivery


def _directives(text: str, seniority: str) -> int:
    return analyze_discourse(text, "", seniority).get("directive_to_senior", 0)


def test_directive_flagged_toward_superior_and_senior():
    # 상사·선배에게 명령/지시형 종결 — 지적 대상
    assert _directives("이 로그부터 지금 확인하세요.", "superior") >= 1
    assert _directives("그건 먼저 처리하십시오.", "senior") >= 1


def test_directive_not_flagged_toward_peer_or_other():
    # 동료·타부서·미상 지위에는 완곡 명령을 집계하지 않는다 (과잉 지적 방지)
    for who in ("peer", "other", ""):
        assert _directives("이 로그부터 지금 확인하세요.", who) == 0


def test_polite_request_endings_are_not_directive():
    # 요청·양해·질문형 어미가 붙으면 명령이 아니라 정중한 요청
    assert _directives("부탁 하나만 들어주세요.", "superior") == 0        # 부탁 + 주세요
    assert _directives("혹시 이것 좀 봐주세요.", "superior") == 0          # 혹시
    assert _directives("확인해 주시겠어요.", "superior") == 0              # 주시겠(+세요 아님)
    assert _directives("확인 부탁드립니다.", "superior") == 0             # 요청형


def test_greetings_are_not_directive():
    # 끝이 '세요'여도 인사말은 명령이 아니다
    assert _directives("안녕하세요. 신입 홍길동입니다.", "superior") == 0
    assert _directives("그럼 먼저 가보겠습니다. 수고하세요.", "superior") == 0


def test_self_action_statement_is_not_directive():
    # 1인칭 수행 문장(제가 ~하겠습니다)은 지시형 종결이 아니다
    assert _directives("제가 바로 확인하겠습니다.", "superior") == 0


def test_delivery_card_surfaces_directive_row_and_comment():
    d = analyze_discourse("이거 지금 확인하세요.", "", "superior")
    card = build_delivery([d, d])
    assert card is not None
    labels = [r["label"] for r in card["rows"]]
    assert any("상향 지시형" in lbl for lbl in labels)
    assert "지시형" in card["comment"] or "명령" in card["comment"]


def test_delivery_card_omits_row_when_no_directive():
    d = analyze_discourse("제가 바로 확인해서 10분 안에 회신드리겠습니다.", "", "superior")
    card = build_delivery([d, d])
    assert card is not None
    assert all("상향 지시형" not in r["label"] for r in card["rows"])
