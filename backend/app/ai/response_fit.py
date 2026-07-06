"""Response-Fit: 체크리스트 커버리지·위험 표현·격식·발화 길이 평가 (S-PLPIQH, S-AHAFOT).

점수 구성 (총 100):
- 핵심 요소 커버리지  최대 58  — 상황별 화법 프레임워크(PREP/4단계 사과/DESC) 체크리스트
- 발화 길이 적정성    최대 22  — 너무 짧으면 정보 부족, 너무 길면 요점 실종
- 격식(존댓말) 유지   최대 12  — 종결어미 형태소 분석 기반 격식 비율
- 권장 표현 사용      최대  8  — 실무 권장 화법 가점
- 위험 표현/반말      감점     — high -15, medium -8, 반말 문장 -8(최대 -16)
"""
from app.ai import semantic_match
from app.ai.scoring import band_score, clamp
from app.ai.text_match import (
    contains_keyword,
    count_hangul_syllables,
    match_any,
    matched_checklist_ids,
    politeness_profile,
)
from app.core.config import settings
from app.seed.seed_data import BANNED_PHRASES, RECOMMENDED_PHRASES

# 발화 길이(음절): 25음절(두 문장 초입)~200음절(약 40초 발화)을 적정으로 봄.
# 5음절 미만은 단답, 450음절 초과(약 1분 30초)는 장황으로 감점.
LENGTH_BANDS = (25.0, 200.0, 3.0, 450.0)

PENALTY = {"high": 15.0, "medium": 8.0}
BANMAL_PENALTY = 8.0
BANMAL_PENALTY_CAP = 16.0


def analyze_response(
    text: str, checklist: list[dict], use_semantic: bool | None = None,
) -> dict:
    """응답 분석. use_semantic: None=설정 따름, False=키워드만(골든 셋 고정용)."""
    covered = matched_checklist_ids(text, checklist)

    # 의미 매칭 (마스터리 ②): 키워드가 놓친 패러프레이즈를 임베딩으로 보완.
    # Ollama 부재 시 None → 키워드 결과 그대로 (완전 폴백).
    semantic_hits: list[str] = []
    semantic_sentence_hits: dict[str, list[int]] = {}
    if use_semantic is None:
        use_semantic = settings.semantic_match_enabled
    if use_semantic:
        sem = semantic_match.semantic_checklist_ids(text, checklist)
        if sem is not None:
            sem_ids, semantic_sentence_hits = sem
            semantic_hits = sorted(sem_ids - covered)
            covered |= sem_ids

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
        "semantic_hits": semantic_hits,  # 키워드는 놓쳤지만 의미로 인식한 항목
        "missing": [
            {"id": i["id"], "label": i["label"]}
            for i in checklist if i["id"] not in covered
        ],
        "banned_hits": banned_hits,
        "recommended_hits": recommended_hits,
        "politeness": politeness,
        "formal": politeness["formal_ratio"] >= 0.5,  # 하위 호환
        "syllables": syllables,
        # 문장 단위 인용 근거 — 리포트가 '어느 문장이 좋았는지' 직접 인용한다
        "quotes": _pick_quotes(text, checklist, banned_hits, semantic_sentence_hits),
    }


def _pick_quotes(
    text: str,
    checklist: list[dict],
    banned_hits: list[dict],
    semantic_sentence_hits: dict[str, list[int]],
) -> dict:
    """최고/최악 문장 선택 — 문장별 체크리스트 기여(가중치 합)와 위험 표현 기준.

    best: 커버 기여가 가장 큰 문장 (위험 표현 없는 문장 중)
    worst: 가장 심한 위험 표현이 실제로 등장한 문장
    """
    from app.ai.discourse import _sentences

    sentences = _sentences(text)
    if len(sentences) < 2:
        return {}

    best: dict | None = None
    best_weight = 0.0
    worst: dict | None = None
    for i, sent in enumerate(sentences):
        sent_banned = [b for b in banned_hits if contains_keyword(sent, b["phrase"])]
        weight = sum(
            item.get("weight", 1.0)
            for item in checklist
            if match_any(sent, item.get("keywords", []))
            or i in semantic_sentence_hits.get(item["id"], [])
        )
        if not sent_banned and weight > best_weight:
            best_weight = weight
            best = {"text": sent[:70], "weight": round(weight, 2)}
        if sent_banned and (worst is None or any(b["severity"] == "high" for b in sent_banned)):
            worst = {"text": sent[:70], "phrase": sent_banned[0]["phrase"]}

    result: dict = {}
    if best and best_weight >= 1.0:  # 유의미한 기여가 있는 문장만 인용
        result["best"] = best
    if worst:
        result["worst"] = worst
    return result


def score_response(metrics: dict) -> float:
    score = 58.0 * metrics["coverage"]
    score += band_score(metrics["syllables"], *LENGTH_BANDS) * 0.22
    score += 12.0 * metrics["politeness"]["formal_ratio"]
    score += min(8.0, 4.0 * len(metrics["recommended_hits"]))
    for hit in metrics["banned_hits"]:
        score -= PENALTY.get(hit["severity"], 8.0)
    score -= min(BANMAL_PENALTY_CAP, BANMAL_PENALTY * metrics["politeness"]["banmal_count"])
    return clamp(score)
