"""게이밍 갭 측정 하네스 (S-B2B-JUDGE 검증 5단계) — 케이스 무결성과 측정 앵커 고정.

주의: 이 테스트는 "시스템이 게이밍을 막는다"를 단언하지 않는다 — 취약도는
사람 채점과의 갭으로 '측정'하는 대상이다. 여기서 고정하는 것은 (a) 케이스가
채점 파이프라인에 물리는지, (b) 방향이 확실한 앵커(성실 > 단답, 무례는 감점),
(c) 키워드 낭독이 실제로 높은 커버리지를 받는다는 '측정 전제'다 — 이 전제가
무너지면(예: 매처 개선) 갭 측정의 해석도 갱신해야 하므로 테스트로 감지한다.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from measure_gaming_gap import CASES_PATH, _score_cases


def test_cases_resolve_and_score():
    doc = json.loads(CASES_PATH.read_text(encoding="utf-8"))
    rows = _score_cases()
    assert len(rows) == len(doc["cases"]) >= 8
    by_id = {r["case_id"]: r for r in rows}
    assert all(0 <= r["system_score"] <= 100 for r in rows)

    # 방향이 확실한 앵커: 성실한 대조군 > 성의 없는 단답
    assert by_id["cafe-sincere-control"]["system_score"] > by_id["office-short-evasive"]["system_score"]
    assert by_id["cafe-sincere-control"]["coverage"] >= 0.7

    # 무례 케이스는 위험 표현 감점이 실제로 걸린다
    assert by_id["cafe-rude-with-keywords"]["banned_hits"] >= 1

    # 측정 전제: 키워드 낭독은 (현행 매처에서) 높은 커버리지를 받는다 —
    # 이 전제가 깨지면 갭 측정 해석을 갱신해야 하므로 여기서 감지한다
    assert by_id["cafe-keyword-stuff"]["coverage"] >= 0.7


def test_case_categories_include_control_group():
    """대조군 없이 적대 케이스만 있으면 갭의 기준선이 없다 — 설계 강제."""
    doc = json.loads(CASES_PATH.read_text(encoding="utf-8"))
    categories = {c["category"] for c in doc["cases"]}
    assert "control_good" in categories
    assert len(categories) >= 4  # 최소 4개 유형 (다양성 없이는 취약도 지도가 안 된다)
