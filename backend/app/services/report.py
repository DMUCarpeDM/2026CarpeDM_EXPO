"""4-Fit 리포트 생성 — 코치 톤 템플릿 피드백 (F-FHVXPD, S-JPGYZW).

모든 코멘트는 '관측(측정된 사실) → 해석(상대방이 받는 인상) → 처방(다음에 쓸 실제 문장)'
구조를 따른다 (R-LKTYCM 수용 기준). 톤 가이드:
- 격려 먼저, 지적은 짧게. 훈계·평가자 말투 금지 ("~해야 합니다" 대신 "~해보세요")
- 처방은 반드시 바로 따라 말할 수 있는 예시 문장을 포함
- 90점 이상에게는 칭찬 대신 다음 단계 도전 과제를 제시
"""
from sqlalchemy import select

from app.models import AnalysisResult, FitType, Report, RoleplaySession

FIT_LABELS = {
    FitType.response: "Response-Fit (응답 적절성)",
    FitType.voice: "Voice-Fit (발화 안정성)",
    FitType.eye: "Eye-Fit (시선 유지)",
    FitType.posture: "Posture-Fit (자세 안정)",
}

NOT_MEASURED = {
    FitType.voice: "음성이 측정되지 않아 Voice-Fit은 이번 평가에서 제외했어요.",
    FitType.eye: "카메라를 사용하지 않아 Eye-Fit은 이번 평가에서 제외했어요.",
    FitType.posture: "카메라를 사용하지 않아 Posture-Fit은 이번 평가에서 제외했어요.",
}

# 체크리스트 라벨 → 따라 말할 수 있는 처방 문장 (missing 항목 기반 개인화)
PRESCRIPTIONS_BY_LABEL = [
    ("이름", "\"안녕하세요, 오늘 합류한 신입 ○○○입니다. 잘 부탁드립니다.\""),
    ("역할", "\"플랫폼팀에서 운영 지원을 맡게 됐습니다. 빠르게 익히겠습니다.\""),
    ("목표", "\"오늘은 개발 환경 셋업까지 끝내는 게 목표입니다.\""),
    ("협업", "\"모르는 게 생기면 바로 여쭤보면서 배우겠습니다.\""),
    ("공감", "\"불편을 드려 죄송합니다. 바로 확인하겠습니다.\""),
    ("사실", "\"접수된 증상은 파악했고, 정확한 원인은 지금 확인 중입니다.\""),
    ("에스컬레이션", "\"제가 판단하기 어려운 부분이라 바로 선임님께 공유하고 함께 보겠습니다.\""),
    ("시점", "\"확인해서 15분 안에 1차 결과를 회신드리겠습니다.\""),
    ("결론", "\"결론부터 말씀드리면, 서비스는 현재 정상입니다.\""),
    ("원인", "\"원인은 오전 배포에 포함된 인증 설정 오류였습니다.\""),
    ("조치", "\"선임님이 롤백으로 복구하셨고, 저는 상황 전파를 맡았습니다.\""),
    ("재발", "\"다음부터는 배포 직후 모니터링 알림을 제가 먼저 확인하겠습니다.\""),
    ("쿠션", "\"먼저 물어봐 주셔서 감사합니다.\""),
    ("가/불가", "\"죄송하지만 오늘은 선약이 있어 어렵습니다.\""),
    ("대안", "\"대신 배포 전 체크리스트는 제가 미리 준비해두겠습니다.\""),
    ("참석", "\"네, 좋습니다! 첫날인데 불러주셔서 감사해요.\""),
    ("호의", "\"챙겨주셔서 감사합니다. 다음에는 꼭 함께할게요.\""),
]

GENERIC_PRESCRIPTION = "\"결론부터 말씀드리면 ~입니다. 자세한 내용은 확인 후 공유드리겠습니다.\""


def _prescription_for(label: str) -> str:
    for key, sentence in PRESCRIPTIONS_BY_LABEL:
        if key in label:
            return sentence
    return GENERIC_PRESCRIPTION


def _segment(result: AnalysisResult, fit: str, observed: str, interpretation: str, suggestion: str) -> dict:
    return {
        "turn_id": result.turn_id,
        "fit_type": fit,
        "observed": observed,
        "interpretation": interpretation,
        "suggestion": suggestion,
    }


# ---------------------------------------------------------------------------
# Response-Fit — 케이스: 반말 혼입 / 위험 표현 / 구조 붕괴 / 일부 누락 / 단답 / 장황 / 우수
# ---------------------------------------------------------------------------

def _response_evidence(turn_results: list[AnalysisResult]) -> dict | None:
    worst = min(turn_results, key=lambda r: r.score, default=None)
    if worst is None:
        return None
    m = worst.raw_metrics
    missing_labels = [i["label"] for i in m.get("missing", [])]
    banned = m.get("banned_hits", [])
    banmal_quotes = m.get("politeness", {}).get("banmal_quotes", [])
    syllables = m.get("syllables", 0)
    coverage = m.get("coverage", 0)

    if banmal_quotes:
        observed = f"반말로 끝난 문장이 감지됐어요: \"{banmal_quotes[0]}\""
        interp = "내용이 좋아도 존대가 무너지는 순간, 듣는 사람의 집중은 말투로 옮겨가요."
        sugg = ("문장 끝만 바꿔도 충분해요. 다음에는 이렇게 말해보세요: "
                "\"확인했습니다. 바로 진행하겠습니다.\"")
    elif any(h["severity"] == "high" for h in banned):
        hit = next(h for h in banned if h["severity"] == "high")
        observed = f"위험 표현 사용: \"{hit['phrase']}\""
        interp = hit["reason"]
        sugg = ("같은 상황에서 이렇게 바꿔 말해보세요: "
                "\"지금은 확실하지 않아서, 확인 후 15분 안에 말씀드리겠습니다.\"")
    elif coverage < 0.5 and missing_labels:
        observed = f"핵심 요소 {len(missing_labels)}가지가 빠졌어요: {', '.join(missing_labels[:3])}"
        interp = "구조가 없으면 듣는 사람이 되물어야 하고, 그만큼 신뢰가 깎여요."
        sugg = f"빠진 것 중 하나만 먼저 연습해보세요. 다음에는 이렇게: {_prescription_for(missing_labels[0])}"
    elif missing_labels:
        observed = f"딱 하나가 아쉬웠어요 — 누락: {missing_labels[0]}"
        interp = "나머지 구조는 좋았어요. 이 한 조각이 들어가면 완성도가 확 올라가요."
        sugg = f"다음에는 이 문장을 끼워 넣어보세요: {_prescription_for(missing_labels[0])}"
    elif banned:
        hit = banned[0]
        observed = f"습관성 표현 감지: \"{hit['phrase']}\""
        interp = hit["reason"]
        sugg = "같은 말도 근거 한 조각을 붙이면 달라져요: \"~해서, 이렇게 했습니다.\""
    elif syllables < 25:
        observed = f"응답 길이 {syllables}음절 — 한 호흡짜리 단답이었어요"
        interp = "짧은 답은 자신감보다는 '준비 안 됨'으로 읽히기 쉬워요."
        sugg = ("두 문장 공식을 써보세요: \"결론은 ~입니다. 왜냐하면 ~이기 때문입니다.\"")
    elif syllables > 300:
        observed = f"응답 길이 {syllables}음절 — 요점이 뒤로 밀렸어요"
        interp = "길어질수록 듣는 사람은 '그래서 결론이 뭐지?'를 기다리게 돼요."
        sugg = "첫 문장을 이렇게 시작해보세요: \"결론부터 말씀드리면 ~입니다.\""
    else:
        observed = f"핵심 요소를 모두 담았어요 (커버리지 {int(coverage * 100)}%)"
        interp = "필요한 정보가 순서대로 들어간, 되묻지 않아도 되는 응답이었어요."
        sugg = ("다음 단계 도전: 숫자를 하나 넣어보세요. "
                "\"문의 5건, 고객사 3곳\"처럼 수치가 들어가면 보고의 급이 달라져요.")
    return _segment(worst, "response", observed, interp, sugg)


# ---------------------------------------------------------------------------
# Voice-Fit — 케이스: 빠름 / 느림 / 침묵 많음 / 톤 흔들림 / 단조로움 / 우수(75+/90+)
# ---------------------------------------------------------------------------

def _voice_evidence(turn_results: list[AnalysisResult]) -> dict | None:
    worst = min(turn_results, key=lambda r: r.score, default=None)
    if worst is None:
        return None
    m = worst.raw_metrics
    rate = m.get("speech_rate_sps", 0)
    pause = m.get("pause_ratio")
    cv = m.get("energy_cv")

    if rate and rate > 5.5:
        observed = f"말속도 {rate}음절/초 — 뉴스 낭독(5.5~6.5)보다 빠른 구간이 있었어요 (권장 3.5~5.5)"
        interp = "빨라지는 구간은 대개 긴장 신호로 들리고, 정보가 흘러가 버려요."
        sugg = ("문장 사이에 반 박자 쉼을 넣어보세요. 시작 문장을 정해두면 쉬워져요: "
                "\"결론부터 말씀드리면, (쉼) ~입니다.\"")
    elif rate and rate < 3.5:
        observed = f"말속도 {rate}음절/초 — 권장(3.5~5.5)보다 느렸어요"
        interp = "너무 느리면 확신이 없어 보이거나, 듣는 사람이 먼저 끼어들게 돼요."
        sugg = ("답변 첫 문장을 미리 정해두고 바로 내뱉는 연습을 해보세요: "
                "\"네, 그 부분은 ~입니다.\" 첫 문장이 나오면 속도는 따라와요.")
    elif pause is not None and pause > 0.35:
        observed = f"무음 구간 {int(pause * 100)}% — 권장(35% 이하)을 넘었어요"
        interp = "긴 침묵이 반복되면 '답을 못 찾고 있다'는 인상을 줘요."
        sugg = ("생각할 시간이 필요할 땐 침묵 대신 이렇게 말해보세요: "
                "\"잠시 정리해서 말씀드리겠습니다.\" 3초를 벌면서도 준비된 사람으로 보여요.")
    elif cv is not None and cv > 0.60:
        observed = f"성량 변동계수 {cv} — 목소리 크기가 출렁였어요 (권장 0.2~0.6)"
        interp = "문장 끝이 흐려지거나 커졌다 작아지면 자신 없는 인상을 줘요."
        sugg = ("문장 끝 세 글자를 또렷하게 맺는 연습을 해보세요: "
                "\"~하겠습니다.\"까지 같은 크기로.")
    elif cv is not None and cv < 0.20:
        observed = f"성량 변동계수 {cv} — 톤 변화가 거의 없었어요 (권장 0.2~0.6)"
        interp = "일정한 톤은 안정적이지만, 길어지면 핵심이 어디인지 놓치게 만들어요."
        sugg = ("핵심 단어 하나만 살짝 힘줘보세요: \"**15분 안에** 회신드리겠습니다.\"")
    else:
        observed = f"말속도 {rate}음절/초, 무음 {int((pause or 0) * 100)}% — 안정 구간이에요"
        interp = "듣는 사람이 편안하게 따라올 수 있는 페이스였어요."
        sugg = ("다음 단계 도전: 가장 중요한 문장 앞에서 일부러 한 박자 멈춰보세요. "
                "잘 쓰는 침묵은 강조가 됩니다.")
    return _segment(worst, "voice", observed, interp, sugg)


# ---------------------------------------------------------------------------
# Eye-Fit — 케이스: 심한 이탈 / 부족 / 순간 이탈 잦음 / 양호 / 우수
# ---------------------------------------------------------------------------

def _eye_evidence(turn_results: list[AnalysisResult]) -> dict | None:
    worst = min(turn_results, key=lambda r: r.score, default=None)
    if worst is None:
        return None
    m = worst.raw_metrics
    ratio = m.get("front_gaze_ratio", 0)
    off_count = m.get("gaze_off_count", 0)

    if ratio < 0.4:
        observed = f"정면 응시 {int(ratio * 100)}% — 발화의 절반 이상 시선이 밖에 있었어요 (권장 65% 이상)"
        interp = "시선이 떠나 있으면 아무리 좋은 답도 '자신 없음'으로 포장돼요."
        sugg = ("눈을 계속 맞추기 어렵다면 상대의 눈썹 사이를 보세요. "
                "듣는 사람에겐 아이컨택으로 보이고, 부담은 훨씬 적어요.")
    elif ratio < 0.65:
        observed = f"정면 응시 {int(ratio * 100)}% — 권장(65%)에 조금 못 미쳤어요"
        interp = "핵심 문장에서 시선이 빠지면 그 문장의 힘도 같이 빠져요."
        sugg = ("전부 볼 필요는 없어요. '결론 문장을 말할 때만 정면' — "
                "이 규칙 하나로 65%는 자연스럽게 넘어요.")
    elif off_count >= 5:
        observed = f"응시율은 {int(ratio * 100)}%로 좋은데, 시선 이탈이 {off_count}회로 잦았어요"
        interp = "짧게 자주 흔들리는 시선은 '불안한 눈빛'으로 기억돼요."
        sugg = ("시선을 옮길 땐 문장이 끝난 뒤에 천천히. "
                "'한 문장, 한 시선'을 의식해보세요.")
    else:
        observed = f"정면 응시 {int(ratio * 100)}%, 이탈 {off_count}회 — 안정적이었어요"
        interp = "말의 신뢰도를 시선이 받쳐주고 있었어요."
        sugg = ("다음 단계 도전: 질문을 받는 동안에도 시선을 유지해보세요. "
                "듣는 자세까지 좋아 보이는 사람은 드물어요.")
    return _segment(worst, "eye", observed, interp, sugg)


# ---------------------------------------------------------------------------
# Posture-Fit — 케이스: 고개 숙임 / 어깨 기울기 / 흔들림 / 양호 / 우수
# ---------------------------------------------------------------------------

def _posture_evidence(turn_results: list[AnalysisResult]) -> dict | None:
    worst = min(turn_results, key=lambda r: r.score, default=None)
    if worst is None:
        return None
    m = worst.raw_metrics
    tilt = m.get("avg_shoulder_tilt_deg", 0)
    head_down = m.get("head_down_ratio", 0)
    sway = m.get("posture_sway", 0)

    if head_down > 0.2:
        observed = f"고개 숙임 {int(head_down * 100)}% — 답변 중 자주 시선이 아래로 갔어요 (권장 20% 이내)"
        interp = "고개가 내려가면 목소리도 같이 작아지고, 위축된 인상이 굳어져요."
        sugg = ("답변 시작 전에 1초 루틴을 만들어보세요: 턱 살짝 들고, 어깨 펴고, 그다음 첫 문장. "
                "\"네, 말씀드리겠습니다.\"와 함께 자세를 세우면 목소리도 올라와요.")
    elif tilt > 6:
        observed = f"평균 어깨 기울기 {tilt:.1f}° — 권장(6° 이내)을 넘었어요"
        interp = "한쪽으로 기운 자세는 긴장하거나 방어적인 상태로 읽혀요."
        sugg = ("의자 등받이에 등을 붙이고 양손을 책상 위에 올려보세요. "
                "어깨는 손 위치를 따라 자연스럽게 수평이 됩니다.")
    elif sway > 0.05:
        observed = f"상체 흔들림 지수 {sway:.3f} — 몸이 좌우로 흔들렸어요 (권장 0.05 이내)"
        interp = "흔들리는 상체는 듣는 사람의 시선을 내용 밖으로 끌고 가요."
        sugg = ("발바닥 전체를 바닥에 붙이고 앉아보세요. "
                "하체가 고정되면 상체 흔들림은 저절로 줄어요.")
    else:
        observed = f"어깨 기울기 {tilt:.1f}°, 고개 숙임 {int(head_down * 100)}% — 반듯했어요"
        interp = "자세가 흔들리지 않아 발화에 무게가 실렸어요."
        sugg = ("다음 단계 도전: 핵심 문장에서 손동작을 하나만 써보세요. "
                "펼친 손바닥 하나면 충분합니다.")
    return _segment(worst, "posture", observed, interp, sugg)


EVIDENCE_BUILDERS = {
    FitType.response: _response_evidence,
    FitType.voice: _voice_evidence,
    FitType.eye: _eye_evidence,
    FitType.posture: _posture_evidence,
}

# 점수 구간별 강점 문구 — 90+는 도전 과제형, 75+는 인정형
STRENGTH_BY_BAND = {
    FitType.response: {
        90: "상황에 필요한 요소를 빠짐없이, 순서대로 담았어요. 이젠 수치를 넣는 연습만 남았어요.",
        75: "응답의 뼈대가 잘 잡혀 있어요. 듣는 사람이 되묻지 않아도 되는 수준이에요.",
    },
    FitType.voice: {
        90: "발화 페이스가 프로 수준으로 안정적이에요. 이젠 '전략적 침묵'을 도구로 써보세요.",
        75: "말속도와 흐름이 안정적이라 내용이 잘 전달됐어요.",
    },
    FitType.eye: {
        90: "시선 처리가 훌륭해요. 듣는 동안의 시선까지 잡으면 완성이에요.",
        75: "정면 응시가 잘 유지돼서 말에 신뢰가 실렸어요.",
    },
    FitType.posture: {
        90: "자세가 발화 내내 반듯했어요. 손동작 하나를 더하면 무대가 됩니다.",
        75: "상체가 안정적이라 위축돼 보이지 않았어요.",
    },
}


def build_report(
    db,
    session: RoleplaySession,
    session_scores: dict[FitType, float | None],
    analysis_ms: int,
) -> Report:
    turn_results = db.scalars(
        select(AnalysisResult).where(
            AnalysisResult.session_id == session.id,
            AnalysisResult.turn_id.is_not(None),
        )
    ).all()
    by_fit: dict[FitType, list[AnalysisResult]] = {}
    for r in turn_results:
        by_fit.setdefault(r.fit_type, []).append(r)

    turn_order = {t.id: t.order for t in session.turns}
    turn_quote = {t.id: t.response_text for t in session.turns}

    fit_scores: dict[str, dict] = {}
    strengths: list[str] = []
    improvements: list[str] = []
    evidence_segments: list[dict] = []
    segments_by_fit: dict[FitType, dict] = {}

    for fit in FitType:
        score = session_scores.get(fit)
        if score is None:
            fit_scores[fit.value] = {
                "score": None,
                "label": FIT_LABELS[fit],
                "summary": NOT_MEASURED.get(fit, "측정되지 않았어요."),
            }
            continue

        segment = EVIDENCE_BUILDERS[fit](by_fit.get(fit, []))
        summary = segment["interpretation"] if segment else ""
        fit_scores[fit.value] = {
            "score": round(score, 1),
            "label": FIT_LABELS[fit],
            "summary": summary,
        }
        if segment:
            segment["turn_order"] = turn_order.get(segment["turn_id"], 0)
            quote = turn_quote.get(segment["turn_id"], "")
            segment["quote"] = quote[:80] + ("…" if len(quote) > 80 else "")
            evidence_segments.append(segment)
            segments_by_fit[fit] = segment

        if score >= 75:
            band = 90 if score >= 90 else 75
            strengths.append(f"{FIT_LABELS[fit]} — {STRENGTH_BY_BAND[fit][band]}")
        else:
            sugg = segment["suggestion"] if segment else ""
            improvements.append(f"{FIT_LABELS[fit]} — {sugg}")

    # 오늘의 한 문장: 가장 낮은 측정 항목의 처방을 헤드라인으로
    headline: dict = {}
    measured = [(fit, s) for fit, s in session_scores.items() if s is not None]
    if measured:
        worst_fit, worst_score = min(measured, key=lambda x: x[1])
        seg = segments_by_fit.get(worst_fit)
        if seg and worst_score < 90:
            headline = {
                "fit_type": worst_fit.value,
                "sentence": seg["suggestion"],
                "context": f"{FIT_LABELS[worst_fit]}에서 가장 큰 개선 여지가 보였어요. 이것 하나만 바꿔서 바로 재도전해보세요.",
            }
        else:
            headline = {
                "fit_type": worst_fit.value,
                "sentence": "지금 페이스를 그대로 유지하면서, 핵심 문장 앞에 한 박자 쉼을 넣어보세요.",
                "context": "모든 항목이 안정권이에요. 이제 디테일 싸움입니다.",
            }

    available = [s for s in session_scores.values() if s is not None]
    total = round(sum(available) / len(available), 1) if available else 0.0

    report = Report(
        session_id=session.id,
        total_score=total,
        fit_scores=fit_scores,
        strengths=strengths,
        improvements=improvements,
        evidence_segments=sorted(evidence_segments, key=lambda s: s["turn_order"]),
        headline=headline,
        analysis_ms=analysis_ms,
    )
    db.add(report)
    db.commit()
    return report
