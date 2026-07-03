"""Response-Fit: 체크리스트 커버리지·위험 표현·격식·발화 길이 평가 (S-PLPIQH, S-AHAFOT)."""
from app.ai.scoring import band_score, clamp
from app.ai.text_match import contains_keyword, count_hangul_syllables, matched_checklist_ids
from app.seed.seed_data import BANNED_PHRASES, RECOMMENDED_PHRASES

LENGTH_BANDS = (25.0, 200.0, 3.0, 450.0)  # 음절 수
FORMAL_MARKERS = ["습니다", "니다", "세요", "드리", "겠습", "입니다", "요."]

PENALTY = {"high": 15.0, "medium": 8.0}


def analyze_response(text: str, checklist: list[dict]) -> dict:
    covered = matched_checklist_ids(text, checklist)
    total_weight = sum(i.get("weight", 1.0) for i in checklist) or 1.0
    covered_weight = sum(i.get("weight", 1.0) for i in checklist if i["id"] in covered)

    banned_hits = [
        {"phrase": b["phrase"], "severity": b["severity"], "reason": b["reason"]}
        for b in BANNED_PHRASES
        if contains_keyword(text, b["phrase"])
    ]
    recommended_hits = [p for p in RECOMMENDED_PHRASES if contains_keyword(text, p)]

    stripped = text.strip()
    formal = any(m in stripped for m in FORMAL_MARKERS) or stripped.endswith("요")
    syllables = count_hangul_syllables(text)

    return {
        "coverage": round(covered_weight / total_weight, 3),
        "covered_ids": sorted(covered),
        "missing": [
            {"id": i["id"], "label": i["label"]}
            for i in checklist if i["id"] not in covered
        ],
        "banned_hits": banned_hits,
        "recommended_hits": recommended_hits,
        "formal": formal,
        "syllables": syllables,
    }


def score_response(metrics: dict) -> float:
    score = 58.0 * metrics["coverage"]
    score += band_score(metrics["syllables"], *LENGTH_BANDS) * 0.22
    score += 12.0 if metrics["formal"] else 0.0
    score += min(8.0, 4.0 * len(metrics["recommended_hits"]))
    for hit in metrics["banned_hits"]:
        score -= PENALTY.get(hit["severity"], 8.0)
    return clamp(score)
