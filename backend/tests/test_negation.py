"""부정 인지 게이트 — "보고드리지 않겠습니다"의 '보고' 커버 오판 방지.

보수 원칙 검증: 오판의 방향이 '부정을 놓침'(기존과 동일한 안전측)이지,
'긍정을 부정으로 오판'(새 위험)이 되지 않아야 한다. 목적 부정("~지 않도록")은
다짐이므로 면제.
"""
from app.ai.text_match import contains_keyword, matched_checklist_ids


# ---- 장형 부정 (-지 않 / -지 못) ----

def test_long_negation_blocks_match():
    assert not contains_keyword("오늘은 보고드리지 않겠습니다", "보고")
    assert not contains_keyword("아직 확인하지 못했습니다", "확인")
    assert not contains_keyword("보고드리진 않을 겁니다", "보고")


def test_affirmative_still_matches():
    assert contains_keyword("바로 보고드리겠습니다", "보고")
    assert contains_keyword("지금 확인 중입니다", "확인")


def test_purpose_negation_is_commitment_not_negation():
    # "재발하지 않도록" = 재발 방지 다짐 — 부정 게이트 면제 (핵심 예외)
    assert contains_keyword("같은 장애가 재발하지 않도록 하겠습니다", "재발")
    assert contains_keyword("놓치지 않게 체크리스트를 만들겠습니다", "놓치")


def test_negation_in_other_clause_does_not_kill_keyword():
    # 절 경계(쉼표) 너머의 부정은 앞 절의 키워드를 죽이지 않는다
    assert contains_keyword("바로 보고드리고, 같은 실수는 반복하지 않겠습니다", "보고")


def test_one_affirmative_occurrence_wins():
    # 부정 출현과 긍정 출현이 섞이면 긍정이 이긴다
    assert contains_keyword("어제는 보고하지 않았지만 오늘은 보고드립니다", "보고")


# ---- 단형 부정 (안/못 + 어절) ----

def test_short_negation_blocks_match():
    assert not contains_keyword("오늘 안 보고했습니다", "보고")


def test_short_negation_requires_word_boundary():
    # '방안'의 '안'은 단어 일부 — 부정으로 오판하면 안 된다
    assert contains_keyword("개선 방안 보고드리겠습니다", "보고")
    assert contains_keyword("안내 문서를 확인하겠습니다", "확인")


# ---- 체크리스트 통합 (전 소비처가 이 경로를 지난다) ----

def test_checklist_coverage_respects_negation():
    checklist = [
        {"id": "esc", "label": "에스컬레이션", "keywords": ["보고", "공유"], "followup": "?", "weight": 1.0},
    ]
    assert matched_checklist_ids("선임님께 바로 보고드리겠습니다", checklist) == {"esc"}
    assert matched_checklist_ids("혼자 처리하고 보고드리지 않겠습니다", checklist) == set()
