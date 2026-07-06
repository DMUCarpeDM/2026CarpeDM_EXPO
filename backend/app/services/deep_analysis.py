"""심층 교차 분석 — 단일 지표를 넘어 지표 사이의 관계를 읽는다.

전문 코치가 실제로 보는 세 가지 렌즈:
  delivery   담화 구조 — 말의 '조직력' (결론 선행·기한 약속·책임 문형·모호어)
  composure  압박 내성 — 압박 질문 턴과 평상 턴의 비언어·음성 지표 델타.
             "압박에서 무엇이 무너지는가"는 단일 턴 점수로는 보이지 않는다.
  adaptation 적응 곡선 — 세션 전/후반 종합 점수 추세. 첫 만남의 어색함을
             회복하는 속도는 채용 현장에서 실제로 관찰하는 자질이다.

모든 판정은 관찰·해석·처방 3단 구조로 리포트에 전달되고, 표본이 부족하면
해당 렌즈 자체를 생략한다(어설픈 단정 금지 — 오판 억제 원칙).
"""
from app.models import FitType, RoleplaySession
from app.services.moments import build_moments


def _mean(vals: list[float]) -> float | None:
    return sum(vals) / len(vals) if vals else None


def _confidence(n: int, solid: int, fair: int) -> dict:
    """표본 크기 기반 신뢰 라벨 — 전문가는 모르는 것을 모른다고 말한다."""
    level = "확실" if n >= solid else "참고" if n >= fair else "보류"
    return {"level": level, "n": n}


# ---------------------------------------------------------------------------
# delivery — 담화 구조 종합
# ---------------------------------------------------------------------------

def build_delivery(discourse_list: list[dict]) -> dict | None:
    """턴별 discourse 지표(analyze_discourse 결과)를 세션 관점으로 종합."""
    ds = [d for d in discourse_list if d]
    if not ds:
        return None

    conclusion_ratio = sum(1 for d in ds if d.get("conclusion_first")) / len(ds)
    time_commits = sum(d.get("time_commitment_count", 0) for d in ds)
    ownership = sum(d.get("ownership_count", 0) for d in ds)
    hedge = _mean([d["hedge_per_100syl"] for d in ds if "hedge_per_100syl" in d]) or 0.0
    aligns = [d["question_alignment"] for d in ds if d.get("question_alignment") is not None]
    alignment = _mean(aligns)
    max_clauses = max((d.get("max_clauses_per_sentence", 0) for d in ds), default=0)

    rows = [
        {"label": "결론 선행", "value": f"{len(ds)}번 중 {sum(1 for d in ds if d.get('conclusion_first'))}번"},
        {"label": "기한 있는 약속", "value": f"{time_commits}회"},
        {"label": "책임 문형(제가 ~하겠습니다)", "value": f"{ownership}회"},
        {"label": "모호어 밀도", "value": f"100음절당 {hedge:.1f}회"},
    ]
    if alignment is not None:
        rows.append({"label": "질문 정합성", "value": f"{round(alignment * 100)}%"})

    negatives = sum(d.get("negative_no_alternative", 0) for d in ds)
    if negatives:
        rows.append({"label": "대안 없는 불가 통보", "value": f"{negatives}회"})

    # 코치 코멘트 — 가장 큰 개선 지점 하나만 (과잉 지적 금지).
    # 정합성은 보수적 임계값(0.15) — 자기소개처럼 질문 명사 재사용이 원래 낮은
    # 턴이 섞이므로, 진짜 동문서답 수준일 때만 지적한다.
    if negatives >= 2:
        comment = ("'안 됩니다'가 대안 없이 반복됐어요. 불가 통보 자체는 문제가 아니에요 — "
                   "\"지금은 어렵지만, 내일 오전까지는 가능합니다\"처럼 문장 뒤에 다음 문을 "
                   "하나 열어두면 같은 거절도 협력으로 들려요.")
    elif alignment is not None and alignment < 0.15:
        comment = ("질문의 핵심 단어가 답변에 거의 이어지지 않았어요. 답을 시작하기 전에 "
                   "질문 속 단어 하나를 그대로 받아 말하면(\"로그인 장애는요—\") 동문서답 인상이 사라져요.")
    elif conclusion_ratio < 0.34:
        comment = ("결론이 문장 뒤쪽에 숨는 패턴이에요. 바쁜 상대는 첫 문장에서 상태부터 "
                   "듣고 싶어 해요 — \"결론부터 말씀드리면\"을 첫 마디 습관으로 만들어보세요.")
    elif hedge >= 4.0:
        comment = ("'좀·아마·~것 같아요' 같은 완충어가 자주 섞였어요. 내용이 맞아도 확신이 "
                   "없어 보이게 만들어요. 사실은 단정하고, 불확실한 부분만 콕 집어 유보하세요.")
    elif time_commits == 0:
        comment = ("'확인하겠습니다'는 있었지만 '언제까지'가 없었어요. 기한 없는 약속은 "
                   "듣는 사람에게 약속으로 남지 않아요 — \"10분 안에 회신드릴게요\"처럼 시점을 붙이세요.")
    elif max_clauses >= 5:
        comment = ("한 문장에 절이 다섯 개 이상 이어지는 만연체가 관찰됐어요. 마침표를 "
                   "두 배로 쓰면 같은 내용이 두 배로 정리되어 들려요.")
    else:
        comment = ("결론 선행, 기한 약속, 책임 표현이 고르게 갖춰진 보고 구조예요. "
                   "이제 내용이 아니라 전달의 완급(쉼과 강세)을 다듬을 단계입니다.")

    return {
        "title": "말의 구조", "rows": rows, "comment": comment,
        "confidence": _confidence(len(ds), solid=3, fair=2),
    }


# ---------------------------------------------------------------------------
# composure — 압박 내성 프로파일
# ---------------------------------------------------------------------------

# (라벨, 압박 시 악화로 판정하는 방향과 최소 변화폭, 값 추출 함수)
_COMPOSURE_PROBES = [
    ("정면 응시", -0.10, lambda nv, vm: nv.get("front_gaze_ratio")),
    ("깜빡임", +8.0, lambda nv, vm: nv.get("blink_per_min")),
    ("긴장 표정(입술 압축)", +0.15, lambda nv, vm: nv.get("mouth_press_ratio")),
    ("목소리 떨림", +4.0, lambda nv, vm: vm.get("f0_jitter_pct")),
    ("침묵 비율", +0.15, lambda nv, vm: vm.get("pause_ratio")),
]


def build_composure(
    pressure_pairs: list[tuple[dict, dict]],
    normal_pairs: list[tuple[dict, dict]],
) -> dict | None:
    """압박 턴 vs 평상 턴의 (nonverbal, voice) 지표 델타 → 압박 반응 프로파일.

    pairs: 턴별 (nonverbal_metrics, voice_raw_metrics). 압박·평상 각 1턴 이상 필요.
    """
    if not pressure_pairs or not normal_pairs:
        return None

    shaken: list[str] = []
    held: list[str] = []
    rows: list[dict] = []
    for label, threshold, probe in _COMPOSURE_PROBES:
        p_vals = [v for nv, vm in pressure_pairs if (v := probe(nv, vm)) is not None]
        n_vals = [v for nv, vm in normal_pairs if (v := probe(nv, vm)) is not None]
        if not p_vals or not n_vals:
            continue
        delta = _mean(p_vals) - _mean(n_vals)
        worsened = delta <= threshold if threshold < 0 else delta >= threshold
        (shaken if worsened else held).append(label)
        direction = "▲" if delta > 0 else "▼"
        rows.append({"label": label, "value": f"압박 시 {direction}{abs(delta):.2f}".rstrip("0").rstrip(".")})

    if not rows:
        return None

    if not shaken:
        level, comment = "침착형", (
            "압박 질문에서도 시선·표정·목소리가 평상시와 다르지 않았어요. 지적 앞에서 "
            "흔들리지 않는 건 훈련으로도 얻기 어려운 강점입니다 — 면접에서 그대로 쓰세요."
        )
    elif len(shaken) <= 2:
        level, comment = "회복형", (
            f"압박이 들어오면 {', '.join(shaken)}에 먼저 반응이 나타나요. 다만 다른 지표는 "
            "유지됐어요 — 압박 질문을 받으면 한 박자 쉬고 시선을 고정한 뒤 답을 시작해보세요."
        )
    else:
        level, comment = "동요형", (
            f"압박 구간에서 {', '.join(shaken[:3])}이 함께 흔들렸어요. 내용보다 먼저 몸이 "
            "반응하는 패턴이에요 — '지적은 나에 대한 공격이 아니라 정보 요청'이라고 "
            "재해석하는 연습이 이 프로파일에 가장 효과적입니다."
        )

    return {
        "title": "압박 내성", "level": level, "rows": rows[:4], "comment": comment,
        "confidence": _confidence(min(len(pressure_pairs), len(normal_pairs)), solid=2, fair=1),
    }


# ---------------------------------------------------------------------------
# adaptation — 적응 곡선
# ---------------------------------------------------------------------------

def build_adaptation(turn_scores: list[tuple[int, float]]) -> dict | None:
    """(turn_order, 종합 점수) 시계열 → 전/후반 추세. 3턴 이상일 때만."""
    if len(turn_scores) < 3:
        return None
    ordered = [s for _, s in sorted(turn_scores)]
    h = len(ordered) // 2
    front, back = _mean(ordered[:h]), _mean(ordered[h:])
    delta = back - front

    if delta >= 7:
        trend, comment = "up", (
            f"후반 점수가 전반보다 {delta:.0f}점 올랐어요. 낯선 상황에 빠르게 적응하는 "
            "곡선이에요 — 실전에서도 첫 질문은 워밍업이라 생각하고 들어가면 됩니다."
        )
    elif delta <= -7:
        trend, comment = "down", (
            f"후반으로 갈수록 점수가 {abs(delta):.0f}점 내려갔어요. 집중력보다는 긴장 누적의 "
            "패턴이에요 — 긴 대화에서는 답변 사이에 물 한 모금, 호흡 한 번이 곡선을 바꿉니다."
        )
    else:
        trend, comment = "flat", (
            "처음부터 끝까지 기복 없이 유지됐어요. 안정적인 페이스는 신뢰의 기본기입니다."
        )

    return {
        "title": "적응 곡선",
        "trend": trend,
        "points": [{"turn_order": o, "score": round(s, 1)} for o, s in sorted(turn_scores)],
        "comment": comment,
        "confidence": _confidence(len(turn_scores), solid=5, fair=3),
    }


# ---------------------------------------------------------------------------
# 오케스트레이션 — build_report에서 호출
# ---------------------------------------------------------------------------

def build_deep_analysis(session: RoleplaySession, turn_results: list) -> dict:
    """AnalysisResult 목록(턴 레벨)에서 세 렌즈를 조립. 표본 부족 렌즈는 생략."""
    by_turn: dict[int, dict] = {}
    for r in turn_results:
        if r.turn_id is None:
            continue
        by_turn.setdefault(r.turn_id, {})[r.fit_type] = r

    turns = {t.id: t for t in session.turns}

    # delivery — response 결과의 discourse
    discourse_list = [
        entry[FitType.response].raw_metrics.get("discourse", {})
        for entry in by_turn.values() if FitType.response in entry
    ]

    # composure — 압박/평상 턴의 (nonverbal, voice) 페어
    pressure_pairs: list[tuple[dict, dict]] = []
    normal_pairs: list[tuple[dict, dict]] = []
    for turn_id, entry in by_turn.items():
        turn = turns.get(turn_id)
        if turn is None:
            continue
        nv = turn.nonverbal_metrics or {}
        vm = entry[FitType.voice].raw_metrics if FitType.voice in entry else {}
        if not nv and not vm:
            continue
        (pressure_pairs if turn.question_type == "pressure" else normal_pairs).append((nv, vm))

    # adaptation — 턴별 측정 Fit 평균
    turn_scores: list[tuple[int, float]] = []
    for turn_id, entry in by_turn.items():
        turn = turns.get(turn_id)
        scores = [r.score for r in entry.values() if r.score is not None]
        if turn is not None and scores:
            turn_scores.append((turn.order, sum(scores) / len(scores)))

    # moments — 시간 정렬 이벤트 스트림: 비언어 타임라인 × 음성 스팬 × 턴 맥락
    turns_data = []
    for turn_id, entry in by_turn.items():
        turn = turns.get(turn_id)
        if turn is None:
            continue
        nv = turn.nonverbal_metrics or {}
        voice = entry[FitType.voice].raw_metrics if FitType.voice in entry else {}
        turns_data.append({
            "turn_order": turn.order,
            "question_type": turn.question_type,
            "timeline": nv.get("timeline") or [],
            "alignment": voice.get("alignment"),
        })

    deep: dict = {}
    if (delivery := build_delivery(discourse_list)) is not None:
        deep["delivery"] = delivery
    if (composure := build_composure(pressure_pairs, normal_pairs)) is not None:
        deep["composure"] = composure
    if (adaptation := build_adaptation(turn_scores)) is not None:
        deep["adaptation"] = adaptation
    if (moments := build_moments(turns_data)):
        deep["moments"] = moments
    return deep
