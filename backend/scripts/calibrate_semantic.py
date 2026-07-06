"""의미 매칭 임계값 보정 — 골든 셋 기반 (전시 PC에서 Ollama 가동 후 실행).

사용:
    ollama pull nomic-embed-text
    ./.venv/bin/python scripts/calibrate_semantic.py

무엇을 하나:
- semantic 골든 케이스(패러프레이즈 — 잡아야 함)와 missing 골든 케이스
  (동문서답 — 잡으면 안 됨)를 임계값 0.50~0.80 스윕으로 평가해,
  두 집합을 가장 잘 가르는 임계값을 제안한다.
- 제안값이 현재 SEMANTIC_THRESHOLD와 다르면 semantic_match.py를 수정하라.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.ai import semantic_match  # noqa: E402
from app.seed.seed_data import EPISODES  # noqa: E402

GOLDEN = json.loads(
    (Path(__file__).parent.parent / "tests" / "golden" / "response_cases.json").read_text()
)
BY_ORDER = {e["order"]: e for e in EPISODES}


def max_similarities(case: dict) -> list[float]:
    """케이스 문장들 × 체크리스트 앵커의 항목별 최대 코사인 목록."""
    from app.ai.discourse import _sentences

    ep = BY_ORDER[case["episode"]]
    sents = _sentences(case["text"])
    sims = []
    for item in ep["checklist"]:
        anchor = semantic_match._embed(semantic_match._anchor(item))
        if anchor is None:
            continue
        best = 0.0
        for s in sents:
            v = semantic_match._embed(s)
            if v is not None:
                best = max(best, semantic_match._cosine(anchor, v))
        sims.append(best)
    return sims


def main() -> None:
    if not semantic_match._probe():
        print("Ollama 임베딩 모델이 없습니다: ollama pull nomic-embed-text")
        sys.exit(1)

    positives = [c for c in GOLDEN["cases"] if c.get("stage") == "semantic"]
    negatives = [c for c in GOLDEN["cases"]
                 if c.get("stage", "current") == "current"
                 and c["expect"].get("coverage_max", 1) <= 0.25]

    pos_sims = [max(max_similarities(c)) for c in positives]
    neg_sims = [max(max_similarities(c)) for c in negatives]
    print(f"패러프레이즈(잡아야 함) 최대 유사도: {[round(s, 3) for s in pos_sims]}")
    print(f"동문서답(잡으면 안 됨) 최대 유사도: {[round(s, 3) for s in neg_sims]}")

    print("\n임계값 스윕:")
    best_thr, best_gap = None, -1
    for thr10 in range(50, 81, 2):
        thr = thr10 / 100
        tp = sum(1 for s in pos_sims if s >= thr)
        fp = sum(1 for s in neg_sims if s >= thr)
        score = tp - fp * 2  # 오탐(FP)은 오판 억제 원칙상 2배 가중 감점
        print(f"  {thr:.2f}: 패러프레이즈 인식 {tp}/{len(pos_sims)}, 오탐 {fp}/{len(neg_sims)}")
        if score > best_gap:
            best_gap, best_thr = score, thr
    print(f"\n제안 임계값: {best_thr:.2f} "
          f"(현재 {semantic_match.SEMANTIC_THRESHOLD}) — 다르면 semantic_match.py 수정")


if __name__ == "__main__":
    main()
