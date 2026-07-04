"""Response-Fit: 체크리스트 커버리지·위험 표현·격식·발화 길이 평가 (S-PLPIQH, S-AHAFOT).

점수 구성 (총 100):
- 핵심 요소 커버리지  최대 58  — 상황별 화법 프레임워크(PREP/4단계 사과/DESC) 체크리스트
- 발화 길이 적정성    최대 22  — 너무 짧으면 정보 부족, 너무 길면 요점 실종
- 격식(존댓말) 유지   최대 12  — 종결어미 형태소 분석 기반 격식 비율
- 권장 표현 사용      최대  8  — 실무 권장 화법 가점
- 위험 표현/반말      감점     — high -15, medium -8, 반말 문장 -8(최대 -16)
"""
from app.ai.scoring import band_score, clamp
from app.ai.text_match import (
    contains_keyword,
    count_hangul_syllables,
    matched_checklist_ids,
    politeness_profile,
)
from app.seed.seed_data import BANNED_PHRASES, RECOMMENDED_PHRASES

# 발화 길이(음절): 25음절(두 문장 초입)~200음절(약 40초 발화)을 적정으로 봄.
# 5음절 미만은 단답, 450음절 초과(약 1분 30초)는 장황으로 감점.
LENGTH_BANDS = (25.0, 200.0, 3.0, 450.0)

PENALTY = {"high": 15.0, "medium": 8.0}
BANMAL_PENALTY = 8.0
BANMAL_PENALTY_CAP = 16.0


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

    politeness = politeness_profile(text)
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
        "politeness": politeness,
        "formal": politeness["formal_ratio"] >= 0.5,  # 하위 호환
        "syllables": syllables,
    }


def score_response(metrics: dict) -> float:
    score = 58.0 * metrics["coverage"]
    score += band_score(metrics["syllables"], *LENGTH_BANDS) * 0.22
    score += 12.0 * metrics["politeness"]["formal_ratio"]
    score += min(8.0, 4.0 * len(metrics["recommended_hits"]))
    for hit in metrics["banned_hits"]:
        score -= PENALTY.get(hit["severity"], 8.0)
    score -= min(BANMAL_PENALTY_CAP, BANMAL_PENALTY * metrics["politeness"]["banmal_count"])
    return clamp(score)
