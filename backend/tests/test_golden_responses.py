"""골든 응답 셋 러너 — 모든 판정 변경의 합격선 (마스터리 플랜 ⓪).

response_cases.json의 기대 판정을 실제 파이프라인(리액션 케이스·커버리지·
위험 표현·격식·담화 구조·점수)과 대조한다.

- stage=current: 지금 통과해야 한다. 실패 = 회귀.
- stage=semantic: 키워드 매칭의 알려진 한계. 커버리지가 낮게 나오는 것이 현재의
  '정상'이며, 의미 매칭(마스터리 ②)이 랜딩되면 게이트 테스트가 깨져 승격을 알린다.
"""
import json
from pathlib import Path

import pytest

from app.ai.discourse import analyze_discourse
from app.ai.response_fit import analyze_response, score_response
from app.seed.seed_data import EPISODES
from app.services.dialogue import reactions

GOLDEN = json.loads((Path(__file__).parent / "golden" / "response_cases.json").read_text())
CASES = GOLDEN["cases"]
CURRENT = [c for c in CASES if c.get("stage", "current") == "current"]
SEMANTIC = [c for c in CASES if c.get("stage") == "semantic"]
BY_ORDER = {ep["order"]: ep for ep in EPISODES}


def _run(case: dict) -> dict:
    ep = BY_ORDER[case["episode"]]
    checklist = ep["checklist"]
    # 키워드 계약 고정 — 의미 매칭 검증은 test_semantic_match(가짜 임베더/라이브)가 담당
    m = analyze_response(case["text"], checklist, use_semantic=False)
    m["discourse"] = analyze_discourse(case["text"], ep["initial_question"])
    m["_case"] = reactions.classify(case["text"], checklist)["case"]
    m["_score"] = score_response(m)
    return m


def _check(case: dict, m: dict) -> list[str]:
    e = case["expect"]
    d = m["discourse"]
    errors: list[str] = []

    def expect(cond: bool, label: str, actual):
        if not cond:
            errors.append(f"{label}: 실제={actual}")

    if "case" in e:
        expect(m["_case"] == e["case"], f"case={e['case']}", m["_case"])
    if "coverage_min" in e:
        expect(m["coverage"] >= e["coverage_min"], f"coverage>={e['coverage_min']}", m["coverage"])
    if "coverage_max" in e:
        expect(m["coverage"] <= e["coverage_max"], f"coverage<={e['coverage_max']}", m["coverage"])
    if "banned_min" in e:
        expect(len(m["banned_hits"]) >= e["banned_min"], f"banned>={e['banned_min']}", len(m["banned_hits"]))
    if "banned_max" in e:
        expect(len(m["banned_hits"]) <= e["banned_max"], f"banned<={e['banned_max']}", len(m["banned_hits"]))
    if "formal_min" in e:
        expect(m["politeness"]["formal_ratio"] >= e["formal_min"],
               f"formal>={e['formal_min']}", m["politeness"]["formal_ratio"])
    if "formal_max" in e:
        expect(m["politeness"]["formal_ratio"] <= e["formal_max"],
               f"formal<={e['formal_max']}", m["politeness"]["formal_ratio"])
    if "banmal_min" in e:
        expect(m["politeness"]["banmal_count"] >= e["banmal_min"],
               f"banmal>={e['banmal_min']}", m["politeness"]["banmal_count"])
    if "conclusion_first" in e:
        expect(d.get("conclusion_first") == e["conclusion_first"],
               f"conclusion_first={e['conclusion_first']}", d.get("conclusion_first"))
    if "time_min" in e:
        expect(d.get("time_commitment_count", 0) >= e["time_min"],
               f"time>={e['time_min']}", d.get("time_commitment_count"))
    if "time_max" in e:
        expect(d.get("time_commitment_count", 0) <= e["time_max"],
               f"time<={e['time_max']}", d.get("time_commitment_count"))
    if "ownership_min" in e:
        expect(d.get("ownership_count", 0) >= e["ownership_min"],
               f"ownership>={e['ownership_min']}", d.get("ownership_count"))
    if "reason_min" in e:
        expect(d.get("reason_marker_count", 0) >= e["reason_min"],
               f"reason>={e['reason_min']}", d.get("reason_marker_count"))
    if "hedge_min" in e:
        expect(d.get("hedge_per_100syl", 0) >= e["hedge_min"],
               f"hedge>={e['hedge_min']}", d.get("hedge_per_100syl"))
    if "hedge_max" in e:
        expect(d.get("hedge_per_100syl", 0) <= e["hedge_max"],
               f"hedge<={e['hedge_max']}", d.get("hedge_per_100syl"))
    if "clauses_min" in e:
        expect(d.get("max_clauses_per_sentence", 0) >= e["clauses_min"],
               f"clauses>={e['clauses_min']}", d.get("max_clauses_per_sentence"))
    if "score_min" in e:
        expect(m["_score"] >= e["score_min"], f"score>={e['score_min']}", m["_score"])
    if "score_max" in e:
        expect(m["_score"] <= e["score_max"], f"score<={e['score_max']}", m["_score"])
    return errors


@pytest.mark.parametrize("case", CURRENT, ids=lambda c: c["id"])
def test_golden_current(case):
    errors = _check(case, _run(case))
    assert not errors, f"[{case['id']}] {case['note']}\n" + "\n".join(errors)


@pytest.mark.parametrize("case", SEMANTIC, ids=lambda c: c["id"])
def test_semantic_gap_still_open(case):
    """의미 매칭(②) 도입 전 게이트 — 이 테스트가 깨지면 케이스를 current로 승격하라."""
    m = _run(case)
    target = case["expect"]["future_coverage_min"]
    assert m["coverage"] < target, (
        f"[{case['id']}] 커버리지 {m['coverage']}가 목표 {target}에 이미 도달 — "
        "의미 매칭이 랜딩됐다면 이 케이스를 stage=current로 승격하세요."
    )


# ---- 쌍대 순위: 같은 에피소드에서 좋은 답 > 나쁜 답 (절대 점수보다 강건한 계약) ----

RANK_PAIRS = [
    ("ep1_excellent_full", "ep1_risky_dismissive"),
    ("ep1_excellent_full", "ep1_formal_but_empty"),
    ("ep2_excellent_crisis", "ep2_missing_deflect"),
    ("ep2_excellent_crisis", "ep2_risky_blame"),
    ("ep3_excellent_prep", "ep3_hedge_uncertain"),
    ("ep3_excellent_prep", "ep3_risky_defensive"),
    ("ep3_excellent_prep", "ep3_banmal_report"),
    ("ep4_excellent_desc", "ep4_risky_annoyed"),
    ("ep5_excellent_join", "ep5_risky_irritated"),
]
_BY_ID = {c["id"]: c for c in CASES}


@pytest.mark.parametrize("good_id,bad_id", RANK_PAIRS)
def test_golden_ranking(good_id, bad_id):
    good, bad = _run(_BY_ID[good_id]), _run(_BY_ID[bad_id])
    assert good["_score"] > bad["_score"] + 10, (
        f"{good_id}({good['_score']}) 가 {bad_id}({bad['_score']}) 보다 "
        "확실히(>10점) 높아야 한다"
    )


# ---- 판정 일관성: 같은 입력 → 같은 판정 (분석 경로에 비결정성 금지) ----

def test_determinism():
    case = _BY_ID["ep2_excellent_crisis"]
    runs = [_run(case) for _ in range(3)]
    for later in runs[1:]:
        assert later == runs[0]


# ---- 수행도 → 하루의 결말 시나리오 ----

SESSIONS = json.loads((Path(__file__).parent / "golden" / "session_cases.json").read_text())


@pytest.mark.parametrize("scenario", SESSIONS["scenarios"], ids=lambda s: s["id"])
def test_golden_session_endings(scenario):
    from app.models import RoleplaySession

    session = RoleplaySession(id=1, scenario_id=1, mode=5, difficulty="basic")
    for case_name in scenario["cases"]:
        reactions.update_rapport(session, case_name)
    ending = reactions.select_ending(session)
    assert ending["level"] == scenario["ending"], (
        f"[{scenario['id']}] {scenario['note']} — "
        f"기대 {scenario['ending']}, 실제 {ending['level']} (rapport={session.rapport})"
    )
