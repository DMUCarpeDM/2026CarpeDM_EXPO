"""의미 매칭 + 문장 인용 + 청자 배려 검증 (마스터리 ②).

임베딩은 가짜 임베더 주입으로 결정적으로 검증하고(코사인·임계·병합 로직),
실제 Ollama 임베딩 품질은 라이브 skipif 테스트로 분리한다.
"""
import json
from pathlib import Path

import pytest

from app.ai import semantic_match
from app.ai.discourse import analyze_discourse
from app.ai.response_fit import analyze_response

CHECKLIST = [
    {"id": "apology", "label": "상황 인정과 공감 표현",
     "keywords": ["죄송", "불편"], "followup": "?", "weight": 1.0},
    {"id": "timeline", "label": "확인 후 회신 시점 약속",
     "keywords": ["분 안에", "회신"], "followup": "?", "weight": 1.5},
]

# 가짜 임베딩 공간: 축0=사과, 축1=시점 약속, 축2=기타
FAKE_VECTORS = {
    "상황 인정과 공감 표현 (죄송 불편)": (1.0, 0.0, 0.0),
    "확인 후 회신 시점 약속 (분 안에 회신)": (0.0, 1.0, 0.0),
    "고객께 사과드립니다": (0.95, 0.05, 0.0),          # 사과 패러프레이즈
    "잠시 뒤에 결과를 드리겠습니다": (0.05, 0.9, 0.1),  # 시점 패러프레이즈
    "오늘 점심은 김치찌개였습니다": (0.0, 0.05, 1.0),   # 무관 문장
}


@pytest.fixture
def fake_embedder(monkeypatch):
    monkeypatch.setattr(semantic_match, "available", lambda: True)
    monkeypatch.setattr(semantic_match, "_embed", lambda t: FAKE_VECTORS.get(t))


def test_semantic_matches_paraphrase(fake_embedder):
    result = semantic_match.semantic_checklist_ids(
        "고객께 사과드립니다. 잠시 뒤에 결과를 드리겠습니다.", CHECKLIST,
        sentences=["고객께 사과드립니다", "잠시 뒤에 결과를 드리겠습니다"],
    )
    assert result is not None
    covered, hits = result
    assert covered == {"apology", "timeline"}
    assert hits["apology"] == [0] and hits["timeline"] == [1]


def test_semantic_rejects_unrelated(fake_embedder):
    covered, _ = semantic_match.semantic_checklist_ids(
        "오늘 점심은 김치찌개였습니다", CHECKLIST,
        sentences=["오늘 점심은 김치찌개였습니다"],
    )
    assert covered == set()


def test_semantic_none_when_unavailable(monkeypatch):
    monkeypatch.setattr(semantic_match, "available", lambda: False)
    assert semantic_match.semantic_checklist_ids("아무 답", CHECKLIST) is None


def test_analyze_response_merges_semantic(fake_embedder, monkeypatch):
    # 문장 분리를 가짜 공간에 맞게 고정
    import app.ai.discourse as discourse
    monkeypatch.setattr(
        discourse, "_sentences",
        lambda t: ["고객께 사과드립니다", "잠시 뒤에 결과를 드리겠습니다"],
    )
    m = analyze_response(
        "고객께 사과드립니다. 잠시 뒤에 결과를 드리겠습니다.", CHECKLIST,
        use_semantic=True,
    )
    assert m["coverage"] == 1.0
    assert set(m["semantic_hits"]) == {"apology", "timeline"}  # 키워드는 못 잡던 것


def test_analyze_response_keyword_only_when_disabled():
    m = analyze_response(
        "고객께 사과드립니다. 잠시 뒤에 결과를 드리겠습니다.", CHECKLIST,
        use_semantic=False,
    )
    assert m["coverage"] == 0.0
    assert m["semantic_hits"] == []


# ---- 문장 인용 근거 ----

def test_quotes_best_and_worst():
    text = ("불편을 드려 죄송합니다. 근데 저는 못 들었는데요. "
            "10분 안에 확인해서 회신드리겠습니다.")
    m = analyze_response(text, CHECKLIST, use_semantic=False)
    assert "10분 안에" in m["quotes"]["best"]["text"]   # 가중치 1.5 항목 커버 문장
    assert "못 들었" in m["quotes"]["worst"]["text"]     # 위험 표현 등장 문장


def test_quotes_empty_for_single_sentence():
    m = analyze_response("죄송합니다.", CHECKLIST, use_semantic=False)
    assert m["quotes"] == {}


# ---- 청자 배려: 대안 없는 불가 통보 ----

def test_negative_without_alternative_flagged():
    d = analyze_discourse("그건 안 됩니다. 규정이 그렇습니다.")
    assert d["negative_no_alternative"] == 1


def test_negative_with_next_sentence_alternative_ok():
    d = analyze_discourse("오늘은 어렵습니다. 대신 내일 아침에는 가능합니다.")
    assert d["negative_no_alternative"] == 0


def test_negative_same_sentence_alternative_ok():
    d = analyze_discourse("지금은 안 되지만 가능한 방법을 찾아보겠습니다.")
    assert d["negative_no_alternative"] == 0


# ---- 골든 semantic 게이트 승격 예고 (가짜 임베더로 로직만) ----

def test_semantic_gate_would_promote_with_embeddings(fake_embedder, monkeypatch):
    """의미 매칭이 켜지면 golden semantic 케이스가 승격 가능함을 로직 수준에서 증명."""
    import app.ai.discourse as discourse
    monkeypatch.setattr(
        discourse, "_sentences",
        lambda t: ["고객께 사과드립니다", "잠시 뒤에 결과를 드리겠습니다"],
    )
    keyword_only = analyze_response("고객께 사과드립니다. 잠시 뒤에 결과를 드리겠습니다.",
                                    CHECKLIST, use_semantic=False)
    with_semantic = analyze_response("고객께 사과드립니다. 잠시 뒤에 결과를 드리겠습니다.",
                                     CHECKLIST, use_semantic=True)
    assert keyword_only["coverage"] == 0.0
    assert with_semantic["coverage"] == 1.0


# ---- 라이브 Ollama 검증 (있을 때만 — 실제 한국어 임베딩 품질) ----

GOLDEN = json.loads(
    (Path(__file__).parent / "golden" / "response_cases.json").read_text(encoding="utf-8")
)
SEMANTIC_CASES = [c for c in GOLDEN["cases"] if c.get("stage") == "semantic"]


@pytest.mark.skipif(not semantic_match._probe(), reason="Ollama 임베딩 모델 없음")
@pytest.mark.parametrize("case", SEMANTIC_CASES, ids=lambda c: c["id"])
def test_live_ollama_promotes_golden_semantic(case, monkeypatch):
    """전시 PC(Ollama 가동)에서 실행: 골든 semantic 케이스가 실제로 승격되는지."""
    from app.seed.seed_data import EPISODES

    monkeypatch.setattr(semantic_match, "available", lambda: True)
    ep = {e["order"]: e for e in EPISODES}[case["episode"]]
    m = analyze_response(case["text"], ep["checklist"], use_semantic=True)
    assert m["coverage"] >= case["expect"]["future_coverage_min"], (
        f"[{case['id']}] 라이브 임베딩 커버리지 {m['coverage']} — "
        f"임계값(SEMANTIC_THRESHOLD) 보정이 필요할 수 있다"
    )
