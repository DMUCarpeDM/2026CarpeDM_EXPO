"""4-Fit 리포트 생성 — 코치 톤 템플릿 피드백 (F-FHVXPD, S-JPGYZW).

모든 코멘트는 '관측(측정된 사실) → 해석(상대방이 받는 인상) → 처방(다음에 쓸 실제 문장)'
구조를 따른다 (R-LKTYCM 수용 기준). 톤 가이드:
- 격려 먼저, 지적은 짧게. 훈계·평가자 말투 금지 ("~해야 합니다" 대신 "~해보세요")
- 처방은 반드시 바로 따라 말할 수 있는 예시 문장을 포함
- 90점 이상에게는 칭찬 대신 다음 단계 도전 과제를 제시
"""
from sqlalchemy import select

from app.models import AnalysisResult, FitType, Report, RoleplaySession
from app.services.deep_analysis import build_deep_analysis
from app.services.dialogue.reactions import select_ending

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
        best_quote = (m.get("quotes") or {}).get("best")
        if best_quote:
            observed = (f"핵심 요소를 모두 담았어요. 가장 좋았던 문장: "
                        f"“{best_quote['text']}”")
            interp = "이 문장 하나에 필요한 구조가 다 들어 있어요 — 이 감각을 기억하세요."
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
    lead_in = m.get("lead_in_sec")
    long_pauses = m.get("long_pause_count", 0)
    f0_cv = m.get("f0_cv")
    drift = m.get("energy_drift_pct", 0)
    alignment = m.get("alignment") or {}
    spans = alignment.get("spans", [])

    # 문장 인용 코칭 — 정렬 분석이 있으면 '어느 문장에서' 무너졌는지 직접 짚는다
    if "quietest" in alignment and spans:
        q = spans[alignment["quietest"]]
        observed = (f"이 대목에서 성량이 평균보다 {abs(q['rms_rel_pct'])}% 낮았어요: "
                    f"“{q['text']}”")
        interp = "중요한 내용일수록 목소리가 작아지면, 듣는 사람은 확신이 없다고 느껴요."
        sugg = ("작아진 그 문장을 첫 문장과 같은 크기로 다시 말해보세요. "
                "특히 사과·요청일수록 또렷해야 진심으로 들립니다.")
    elif "fastest" in alignment and spans:
        f = spans[alignment["fastest"]]
        observed = (f"이 대목에서 말이 {f['rate_sps']}음절/초로 급해졌어요: "
                    f"“{f['text']}”")
        interp = "특정 대목에서만 빨라지는 건 그 내용을 빨리 지나가고 싶다는 신호로 들려요."
        sugg = "급해진 그 문장 앞에서 일부러 반 박자 쉬고, 또박또박 다시 말해보세요."
    elif lead_in is not None and lead_in > 3:
        observed = f"응답 개시까지 {lead_in}초 — 질문 후 침묵이 길었어요 (권장 2.5초 이내)"
        interp = "첫 마디가 늦어질수록 듣는 사람의 긴장이 올라가고, 답변 준비가 안 된 인상을 줘요."
        sugg = ("침묵 대신 소리 내어 시작해보세요: \"네, 그 부분은—\" "
                "첫 두 글자를 내뱉으면 나머지는 따라옵니다.")
    elif long_pauses >= 2:
        observed = f"발화 중 긴 침묵(1.2초 이상)이 {long_pauses}회, 평균 {m.get('mean_pause_sec', 0)}초"
        interp = "문장 중간의 긴 침묵이 반복되면 생각이 끊긴 것으로 들려요."
        sugg = ("문장을 짧게 끝내고 쉬세요. 쉼은 문장 '사이'에 오면 여유, "
                "문장 '중간'에 오면 막힘으로 들립니다.")
    elif rate and rate > 5.5:
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
    elif f0_cv is not None and f0_cv < 0.05:
        observed = f"억양 변동(F0 CV) {int(f0_cv * 1000) / 10}% — 톤이 거의 한 음으로 유지됐어요 (권장 8~35%)"
        interp = "단조로운 억양은 안정적이지만, 핵심이 어디인지 듣는 사람이 놓치게 만들어요."
        sugg = ("핵심 단어 하나만 반음 올려보세요: \"**15분 안에** 회신드리겠습니다.\" "
                "숫자와 결론에 억양을 실으면 전달력이 크게 올라갑니다.")
    elif drift < -35:
        observed = f"후반 성량이 전반 대비 {abs(drift)}% 감소 — 목소리가 점점 작아졌어요"
        interp = "끝으로 갈수록 잦아드는 목소리는 확신이 빠져나가는 것처럼 들려요."
        sugg = "마지막 문장을 첫 문장과 같은 크기로 말하는 걸 목표로 해보세요. 끝이 단단하면 전체가 단단해 보입니다."
    elif cv is not None and cv > 0.60:
        observed = f"성량 변동계수 {cv} — 목소리 크기가 출렁였어요 (권장 0.2~0.6)"
        interp = "문장 끝이 흐려지거나 커졌다 작아지면 자신 없는 인상을 줘요."
        sugg = ("문장 끝 세 글자를 또렷하게 맺는 연습을 해보세요: "
                "\"~하겠습니다.\"까지 같은 크기로.")
    else:
        f0_note = f", 억양 변동 {int(f0_cv * 100)}%" if f0_cv is not None else ""
        observed = f"말속도 {rate}음절/초, 무음 {int((pause or 0) * 100)}%{f0_note} — 안정 구간이에요"
        interp = "듣는 사람이 편안하게 따라올 수 있는 페이스였어요."
        sugg = ("다음 단계 도전: 가장 중요한 문장 앞에서 일부러 한 박자 멈춰보세요. "
                "잘 쓰는 침묵은 강조가 됩니다.")
    return _segment(worst, "voice", observed, interp, sugg)


# ---------------------------------------------------------------------------
# Eye-Fit — 케이스: 심한 이탈 / 부족 / 순간 이탈 잦음 / 양호 / 우수
# ---------------------------------------------------------------------------

DIR_LABEL = {"down": "아래", "up": "위", "left": "옆", "right": "옆"}


def _eye_evidence(turn_results: list[AnalysisResult]) -> dict | None:
    worst = min(turn_results, key=lambda r: r.score, default=None)
    if worst is None:
        return None
    m = worst.raw_metrics
    ratio = m.get("front_gaze_ratio", 0)
    off_count = m.get("gaze_off_count", 0)
    longest = m.get("longest_off_sec", 0)
    blink = m.get("blink_per_min", 0)
    dir_label = DIR_LABEL.get(m.get("gaze_off_dir") or "")
    dir_note = f" (주로 {dir_label} 방향)" if dir_label else ""

    # 깜빡임 동역학(마스터리 ④): 안정 깜빡임 빈도는 사람마다 달라(분당 10~30회)
    # 절대 임계는 오판을 만든다. 기저선(브리핑)이 있으면 '본인 대비 급증'으로만
    # 판정하고(기저선 높은 사람 구제), 없으면 기존 절대 임계 32로 폴백한다.
    blink_base = m.get("blink_base_per_min")
    if blink_base is not None and blink_base >= 5:
        blink_flag = blink >= 20 and blink >= blink_base * 1.6
    else:
        blink_base = None  # 기저선 5 미만은 표본 잡음 — 절대 폴백으로
        blink_flag = blink > 32

    if ratio < 0.4:
        observed = f"정면 응시 {int(ratio * 100)}%{dir_note} — 발화의 절반 이상 시선이 밖에 있었어요 (권장 65% 이상)"
        interp = (
            "아래로 떨어지는 시선은 대본을 읽거나 자신 없는 인상을, 옆으로 새는 시선은 회피하는 인상을 줘요."
            if dir_label else "시선이 떠나 있으면 아무리 좋은 답도 '자신 없음'으로 포장돼요."
        )
        sugg = ("눈을 계속 맞추기 어렵다면 상대의 눈썹 사이를 보세요. "
                "듣는 사람에겐 아이컨택으로 보이고, 부담은 훨씬 적어요.")
    elif ratio < 0.65:
        observed = f"정면 응시 {int(ratio * 100)}%{dir_note} — 권장(65%)에 조금 못 미쳤어요"
        interp = "핵심 문장에서 시선이 빠지면 그 문장의 힘도 같이 빠져요."
        sugg = ("전부 볼 필요는 없어요. '결론 문장을 말할 때만 정면' — "
                "이 규칙 하나로 65%는 자연스럽게 넘어요.")
    elif longest > 3.5:
        observed = f"한 번에 최장 {longest}초 연속으로 시선이 이탈했어요{dir_note}"
        interp = "긴 이탈 한 번이 짧은 이탈 여러 번보다 강하게 기억돼요 — '딴 데 보고 있다'는 인상이에요."
        sugg = "생각이 필요할 땐 시선을 내리지 말고, 잠시 눈을 감았다 뜨는 편이 훨씬 안정적으로 보여요."
    elif off_count >= 5:
        observed = f"응시율은 {int(ratio * 100)}%로 좋은데, 시선 이탈이 {off_count}회로 잦았어요"
        interp = "짧게 자주 흔들리는 시선은 '불안한 눈빛'으로 기억돼요."
        sugg = ("시선을 옮길 땐 문장이 끝난 뒤에 천천히. "
                "'한 문장, 한 시선'을 의식해보세요.")
    elif blink_flag:
        observed = (
            f"브리핑 때 분당 {int(blink_base)}회였던 깜빡임이 답변 중 {int(blink)}회로 늘었어요"
            if blink_base is not None else
            f"정면 응시는 {int(ratio * 100)}%로 좋지만, 깜빡임이 분당 {int(blink)}회였어요 (평상시 15~20회)"
        )
        interp = "잦은 깜빡임은 본인도 모르는 긴장 신호로 전달될 수 있어요."
        sugg = "답변 시작 전에 한 번 길게 숨을 내쉬어 보세요. 호흡이 내려가면 깜빡임도 함께 줄어요."
    else:
        observed = f"정면 응시 {int(ratio * 100)}%, 이탈 {off_count}회, 최장 이탈 {longest}초 — 안정적이었어요"
        interp = "말의 신뢰도를 시선이 받쳐주고 있었어요."
        smile = m.get("smile_ratio", 0)
        sugg = (
            "다음 단계 도전: 인사와 감사 표현에서 가벼운 미소를 더해보세요. 시선이 안정된 사람의 미소는 여유로 읽혀요."
            if smile < 0.05 else
            "다음 단계 도전: 질문을 받는 동안에도 시선을 유지해보세요. 듣는 자세까지 좋아 보이는 사람은 드물어요."
        )
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
    tilt_drift = m.get("tilt_drift_deg", 0)

    if tilt_drift > 4:
        observed = f"후반부 어깨 기울기가 전반 대비 +{tilt_drift}° — 갈수록 자세가 무너졌어요"
        interp = "집중이 풀리면서 자세가 흘러내리는 전형적인 패턴이에요. 듣는 사람은 '끝나기를 기다리는구나'로 읽어요."
        sugg = ("답변 중간에 한 번, 문장이 끝나는 타이밍에 어깨를 다시 세팅해보세요. "
                "'재발 방지' 같은 핵심 단어를 말할 때가 좋은 리셋 포인트예요.")
    elif head_down > 0.2:
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
def _build_rebuild(session: RoleplaySession, response_results: list[AnalysisResult]) -> dict:
    """코치와 다시 쓰기 — 사용자 답변에서 잘 담은 요소는 인정하고,
    빠진 요소는 추천 문장으로 채워 '완성된 답변'을 재조립한다 (첨삭 경험의 핵심)."""
    worst = min(response_results, key=lambda r: r.score, default=None)
    if worst is None:
        return {}
    turn = next((t for t in session.turns if t.id == worst.turn_id), None)
    if turn is None or not turn.episode.checklist:
        return {}
    # 같은 에피소드의 모든 응답을 합산 — 어느 턴에서든 한 번 담았으면 인정
    episode_turn_ids = {t.id for t in session.turns if t.episode_id == turn.episode_id}
    covered: set[str] = set()
    for r in response_results:
        if r.turn_id in episode_turn_ids:
            covered.update(r.raw_metrics.get("covered_ids", []))
    items = [
        {
            "label": item["label"],
            "sentence": _prescription_for(item["label"]).strip('"'),
            "covered": item["id"] in covered,
        }
        for item in turn.episode.checklist
    ]
    quote = turn.response_text
    return {
        "turn_order": turn.order,
        "episode_title": turn.episode.title,
        "quote": quote[:120] + ("…" if len(quote) > 120 else ""),
        "items": items,
    }


def _mean_metric(results: list[AnalysisResult], key: str) -> float | None:
    vals = [r.raw_metrics[key] for r in results if r.raw_metrics.get(key) is not None]
    return sum(vals) / len(vals) if vals else None


def _fit_detail_metrics(fit: FitType, results: list[AnalysisResult]) -> list[dict]:
    """지표 카드에 노출할 세부 실측값 행 — '계기판' 역할."""
    if not results:
        return []
    rows: list[dict] = []

    def add(label: str, value: str | None):
        if value is not None:
            rows.append({"label": label, "value": value})

    if fit == FitType.response:
        cov = _mean_metric(results, "coverage")
        add("핵심 요소 커버리지", f"{round(cov * 100)}%" if cov is not None else None)
        semantic = sum(len(r.raw_metrics.get("semantic_hits", [])) for r in results)
        if semantic:
            add("의미 인식 보완", f"{semantic}건 (키워드 없이 뜻으로 인정)")
        banned = sum(len(r.raw_metrics.get("banned_hits", [])) for r in results)
        add("위험 표현", f"{banned}회")
        formals = [
            r.raw_metrics["politeness"]["formal_ratio"]
            for r in results if r.raw_metrics.get("politeness")
        ]
        if formals:
            add("존댓말 유지", f"{round(sum(formals) / len(formals) * 100)}%")
    elif fit == FitType.voice:
        rate = _mean_metric(results, "speech_rate_sps")
        add("말속도", f"{rate:.1f}음절/초" if rate else None)
        pause = _mean_metric(results, "pause_ratio")
        add("무음 비율", f"{round(pause * 100)}%" if pause is not None else None)
        lead = _mean_metric(results, "lead_in_sec")
        add("응답 개시", f"{lead:.1f}초" if lead is not None else None)
        jitter = _mean_metric(results, "f0_jitter_pct")
        if jitter is not None and jitter > 8:
            add("피치 흔들림", f"{jitter:.0f}%")
        fillers = [
            r.raw_metrics["alignment"]["fillers"]
            for r in results if r.raw_metrics.get("alignment")
        ]
        if fillers:
            per_min = sum(f["per_min"] for f in fillers) / len(fillers)
            if per_min >= 2:
                add("간투어(음·어)", f"분당 {per_min:.0f}회")
            designed = [
                r.raw_metrics["alignment"].get("emphasis", {}).get("designed")
                for r in results if r.raw_metrics.get("alignment")
            ]
            if any(d is True for d in designed):
                add("강조 설계", "문장 간 대비 있음")
        f0cv = _mean_metric(results, "f0_cv")
        add("억양 변동(F0)", f"{round(f0cv * 100)}%" if f0cv is not None else None)
    elif fit == FitType.eye:
        speak_ratio = _mean_metric(results, "answering_front_ratio")
        listen_ratio = _mean_metric(results, "listening_front_ratio")
        if speak_ratio is not None or listen_ratio is not None:
            # v2 — 듣기/말하기 분리 응시 (전문 코칭의 실제 관찰 단위)
            if speak_ratio is not None:
                add("말할 때 응시", f"{round(speak_ratio * 100)}%")
            if listen_ratio is not None:
                add("들을 때 응시", f"{round(listen_ratio * 100)}%")
        else:
            ratio = _mean_metric(results, "front_gaze_ratio")
            add("정면 응시", f"{round(ratio * 100)}%" if ratio is not None else None)
        bout = _mean_metric(results, "contact_bout_mean_sec")
        if bout:
            add("응시 리듬", f"평균 {bout:.1f}초 유지")
        longest = max((r.raw_metrics.get("longest_off_sec", 0) for r in results), default=0)
        if longest:
            add("최장 이탈", f"{longest}초")
        blink = _mean_metric(results, "blink_per_min")
        if blink:
            add("깜빡임", f"분당 {round(blink)}회")
    elif fit == FitType.posture:
        tilt = _mean_metric(results, "avg_shoulder_tilt_deg")
        add("어깨 기울기", f"{tilt:.1f}°" if tilt is not None else None)
        head = _mean_metric(results, "head_down_ratio")
        add("고개 숙임", f"{round(head * 100)}%" if head is not None else None)
        hand = sum(r.raw_metrics.get("hand_face_sec", 0) for r in results)
        if hand >= 3:
            add("손-얼굴 터치", f"누적 {hand:.0f}초")
        roll = _mean_metric(results, "head_roll_deg")
        if roll is not None and roll > 0.5:
            add("고개 갸웃", f"{roll:.1f}°")
        drift = max((r.raw_metrics.get("tilt_drift_deg", 0) for r in results), default=0)
        if drift > 1:
            add("후반 변화", f"+{drift}°")
    return rows[:4]


def _build_speech_stats(turn_results: list[AnalysisResult], session: RoleplaySession) -> dict:
    """이번 세션의 말하기 데이터 요약 — 리포트 상단 통계 스트립용."""
    response = [r for r in turn_results if r.fit_type == FitType.response]
    voice = [r for r in turn_results if r.fit_type == FitType.voice]
    if not response:
        return {}
    total_syllables = sum(r.raw_metrics.get("syllables", 0) for r in response)
    banned = [h["phrase"] for r in response for h in r.raw_metrics.get("banned_hits", [])]
    recommended = sum(len(r.raw_metrics.get("recommended_hits", [])) for r in response)
    formal_ratios = [
        r.raw_metrics.get("politeness", {}).get("formal_ratio")
        for r in response
        if r.raw_metrics.get("politeness")
    ]
    rates = [
        r.raw_metrics.get("speech_rate_sps")
        for r in voice
        if r.raw_metrics.get("speech_rate_sps")
    ]
    # 측정 신뢰도: 비언어 프레임 수 + 실측 오디오 길이 기반
    frames = sum((t.nonverbal_metrics or {}).get("frames", 0) for t in session.turns)
    audio_sec = sum(
        r.raw_metrics.get("duration_sec", 0)
        for r in voice if not r.raw_metrics.get("estimated")
    )
    if frames >= 60 and audio_sec >= 8:
        level = "높음"
    elif frames >= 20 or audio_sec >= 4:
        level = "보통"
    else:
        level = "제한적"

    return {
        "turns": len(response),
        "total_syllables": total_syllables,
        "banned_count": len(banned),
        "banned_phrases": sorted(set(banned))[:4],
        "recommended_count": recommended,
        "formal_pct": round(sum(formal_ratios) / len(formal_ratios) * 100) if formal_ratios else None,
        "avg_speech_rate": round(sum(rates) / len(rates), 1) if rates else None,
        "measurement": {"frames": frames, "audio_sec": round(audio_sec, 1), "level": level},
    }


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


GAZE_MAP_MIN_FRAMES = 50  # 200ms 샘플 × 50 = 10초 — 이보다 적으면 지도 생략


def _gaze_map(session: RoleplaySession) -> dict | None:
    """시선 존 히트맵 — 턴별 3×3 분포(위/중/아래 × 좌/중/우)를 세션 합산한 비율 지도.

    관찰 지표(감점 없음). 표본 10초 미만이면 지도 자체를 생략한다(판정 보류 원칙).
    코멘트는 부호가 안정적인 축(상하)과 중앙 집중도만 단정하고, 좌우는 실기기
    부호 검증 전이므로 '옆'으로 중화한다 — DIR_LABEL과 같은 관례.
    """
    zones = [0] * 9
    for t in session.turns:
        zs = (t.nonverbal_metrics or {}).get("gaze_zones") or []
        if len(zs) == 9:
            zones = [a + b for a, b in zip(zones, zs)]
    total = sum(zones)
    if total < GAZE_MAP_MIN_FRAMES:
        return None
    ratios = [round(z / total, 3) for z in zones]
    center = ratios[4]
    down = sum(ratios[6:9])
    up = sum(ratios[0:3])
    side = ratios[0] + ratios[3] + ratios[6] + ratios[2] + ratios[5] + ratios[8]
    if center >= 0.7:
        comment = "시선이 대부분 상대(중앙)에 머물렀어요 — 시선 분포로는 더 바랄 게 없어요."
    elif down >= 0.25:
        comment = ("시선이 아래쪽에 자주 머물렀어요. 생각을 정리할 때 눈이 내려가는 습관이에요 — "
                   "듣는 사람에게는 자신 없음이나 대본 읽기로 보일 수 있어요.")
    elif up >= 0.2:
        comment = ("답을 떠올릴 때 시선이 위로 향하는 습관이 보여요. 기억을 더듬는 자연스러운 "
                   "행동이지만, 길어지면 말문이 막힌 것처럼 보여요.")
    elif side >= 0.3:
        comment = ("시선이 옆으로 자주 흘렀어요. 화면 밖에 참고물이 있는 듯한 인상을 "
                   "줄 수 있어요 — 시선을 옮기더라도 문장이 끝난 뒤에 옮겨보세요.")
    else:
        comment = "시선이 중앙을 기준으로 자연스럽게 분포했어요."
    return {"zones": ratios, "frames": total, "comment": comment}


def _habit_segments(session: RoleplaySession) -> list[dict]:
    """무의식 습관 카드 — 지각 확장 지표(손-얼굴·팔짱·제스처 경직/과다·체중 이동·
    긴장 표정·미소 타이밍·진정성 미소).

    체험자가 가장 놀라는 종류의 피드백. 보수적 임계값으로 확실할 때만 말하고,
    감점이 아니라 관찰로 전달한다. 데이터 없으면 카드도 없다.
    """
    turns = [t for t in session.turns if t.nonverbal_metrics and t.answered_at]
    if not turns:
        return []
    segs: list[dict] = []
    last = turns[-1]

    def seg(observed: str, interpretation: str, suggestion: str) -> dict:
        return {
            "turn_id": last.id, "turn_order": last.order, "fit_type": "habit",
            "quote": "", "observed": observed,
            "interpretation": interpretation, "suggestion": suggestion,
        }

    hand_face = sum(t.nonverbal_metrics.get("hand_face_sec", 0) for t in turns)
    if hand_face >= 4:
        segs.append(seg(
            f"답변 중 손이 얼굴 근처에 누적 {hand_face:.0f}초 머물렀어요.",
            "무의식적인 손-얼굴 터치는 듣는 사람에게 긴장·불확신의 신호로 읽힐 수 있어요.",
            "손을 책상 위나 무릎에 살짝 얹어두면 같은 말도 더 안정적으로 들려요.",
        ))

    arm = [t.nonverbal_metrics.get("arm_cross_ratio", 0) for t in turns]
    if arm and sum(arm) / len(arm) >= 0.25:
        segs.append(seg(
            f"발화 시간의 약 {round(sum(arm) / len(arm) * 100)}%에서 팔짱 자세가 관찰됐어요.",
            "팔짱은 본인은 편해도 상대에게는 방어적·평가적 태도로 보일 수 있어요.",
            "손을 풀어 가볍게 모으면 개방적인 인상으로 바뀌어요.",
        ))

    # ---- Posture 마스터 ③: 제스처·전신 관찰 (표본 부족 턴은 프론트가 null 보류) ----
    # 경직: 손이 화면에 있는데(가시 게이트) 거의 움직이지 않음 — 아무도 안 잡는 축.
    # 임계값은 실기기 보정 전 보수치 (demo-checklist §2.5)
    gest_active = [
        v for t in turns
        if (v := t.nonverbal_metrics.get("gesture_active_ratio")) is not None
    ]
    hands_vis = [t.nonverbal_metrics.get("hands_visible_ratio", 0) for t in turns]
    total_frames = sum(t.nonverbal_metrics.get("frames", 0) for t in turns)
    if gest_active and total_frames >= 150 and sum(hands_vis) / len(hands_vis) >= 0.5:
        active = sum(gest_active) / len(gest_active)
        energies = [
            v for t in turns
            if (v := t.nonverbal_metrics.get("gesture_energy")) is not None
        ]
        energy = sum(energies) / len(energies) if energies else 0.0
        if active <= 0.05:
            segs.append(seg(
                "답변 내내 손이 화면에 있었지만 거의 움직이지 않았어요.",
                "긴장하면 말보다 몸이 먼저 얼어요 — 지나친 부동자세는 경직된 인상을 줄 수 있어요.",
                "핵심 문장 하나에서만 손바닥을 펴 보이는 제스처를 써보세요. 하나면 충분합니다.",
            ))
        elif energy >= 0.5 and active >= 0.7:
            segs.append(seg(
                "말하는 동안 손동작이 거의 쉬지 않고 이어졌어요.",
                "제스처는 강조를 돕지만, 계속되면 듣는 사람의 시선이 손으로 분산돼요.",
                "숫자나 순서를 말할 때만 손을 쓰고, 나머지 구간에는 손을 내려두세요.",
            ))

    # 체중 이동: 서 있는 동안 골반 중심이 좌우로 오감 (하체가 보일 때만 판정)
    sways = [
        v for t in turns
        if (v := t.nonverbal_metrics.get("hip_sway")) is not None
        and t.nonverbal_metrics.get("lower_visible_ratio", 0) >= 0.5
    ]
    if sways and sum(sways) / len(sways) >= 0.1:
        segs.append(seg(
            "서 있는 동안 무게중심이 좌우로 자주 이동했어요.",
            "본인은 느끼지 못해도, 흔들리는 하체는 듣는 사람에게 불안한 인상으로 이어질 수 있어요.",
            "양발을 어깨너비로 두고 체중을 고르게 실어보세요. 하체가 고정되면 목소리도 안정돼요.",
        ))

    press = [t.nonverbal_metrics.get("mouth_press_ratio", 0) for t in turns]
    if press and sum(press) / len(press) >= 0.2:
        segs.append(seg(
            "입술을 꾹 누르는 긴장 표정이 반복적으로 관찰됐어요.",
            "긴장 자체는 자연스러워요 — 다만 말 사이 침묵과 겹치면 위축돼 보일 수 있어요.",
            "답하기 전에 숨을 한 번 내쉬고 시작하면 표정이 함께 풀려요.",
        ))

    # 미소 타이밍: 압박 질문 중의 미소는 당황·비웃음으로 오해될 수 있다
    pressure_turns = [t for t in turns if t.question_type == "pressure"]
    if pressure_turns:
        smile = sum(t.nonverbal_metrics.get("smile_ratio", 0) for t in pressure_turns) / len(pressure_turns)
        if smile >= 0.35:
            segs.append(seg(
                "압박 질문을 받는 동안 미소 표정이 길게 유지됐어요.",
                "긴장을 풀려는 자연스러운 반응이지만, 심각한 상황에서는 가볍게 넘긴다는 오해를 살 수 있어요.",
                "지적을 들을 때는 표정을 잠시 중립으로 두고, 답변을 시작할 때 옅은 미소로 돌아오세요.",
            ))
        elif smile <= 0.05 and all(
            t.nonverbal_metrics.get("mouth_press_ratio", 0) < 0.2 for t in pressure_turns
        ):
            segs.append(seg(
                "압박 질문에서도 표정이 흔들리지 않고 안정적이었어요.",
                "지적 앞에서 표정이 유지되는 건 신뢰를 주는 강점이에요.",
                "이 안정감을 유지하면서, 답변 첫 문장에 인정 표현을 얹으면 완성이에요.",
            ))

    # 진정성 미소 근사(Duchenne proxy, 마스터리 ⑤): 미소 중 눈둘레근 동시 활성 비율.
    # 미소 표본이 부족한 턴은 프론트가 null로 보류하므로 값이 있는 턴만 평균한다.
    # 표정 자체가 아니라 '어떻게 전달되는지'만 말한다 — 외모 지적으로 읽히지 않게.
    duchenne_vals = [
        v for t in turns
        if (v := t.nonverbal_metrics.get("smile_duchenne_ratio")) is not None
    ]
    if duchenne_vals:
        duchenne = sum(duchenne_vals) / len(duchenne_vals)
        smile_avg = sum(t.nonverbal_metrics.get("smile_ratio", 0) for t in turns) / len(turns)
        if smile_avg >= 0.15 and duchenne <= 0.15:
            segs.append(seg(
                "미소를 자주 지었는데, 눈 주변 근육은 거의 함께 움직이지 않았어요.",
                "입꼬리만 올라가는 미소는 상대에게 의례적인 표정으로 읽히기 쉬워요 — 표정이 아니라 전달의 문제예요.",
                "웃음을 억지로 늘릴 필요는 없어요. 진짜 반가운 지점(인사·감사)에서만 웃으면 눈은 저절로 따라옵니다.",
            ))
        elif duchenne >= 0.6:
            segs.append(seg(
                "미소를 지을 때 눈까지 함께 웃는 표정이 관찰됐어요.",
                "눈이 함께 움직이는 미소는 듣는 사람에게 진심으로 전달돼요 — 훈련으로 만들기 어려운 강점이에요.",
                "이 표정은 그대로 두세요. 첫인사와 마무리 감사에서 특히 힘을 발휘합니다.",
            ))

    return segs[:2]  # 과잉 지적 방지 — 가장 중요한 것만


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

    # 실시간 코칭 발생 구간 (S-JKEYHS): 어느 턴에서 어떤 안내가 나갔는지 리포트에 재노출
    live_segments: list[dict] = []
    for t in session.turns:
        for tip in (t.nonverbal_metrics or {}).get("tips", [])[:2]:
            live_segments.append({
                "turn_id": t.id,
                "turn_order": t.order,
                "fit_type": "live",
                "quote": "",
                "observed": f"역할극 중 실시간 코칭이 표시됐어요: \"{tip}\"",
                "interpretation": "안내가 나간 순간이 비언어 습관이 드러난 지점이에요.",
                "suggestion": "다음 도전에서는 이 구간에서 자세와 시선을 의식적으로 잡아보세요.",
            })

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
            "metrics": _fit_detail_metrics(fit, by_fit.get(fit, [])),
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

    # 시선 존 히트맵 — Eye 카드에 3×3 분포 지도 (표본 충분 + Eye 측정됨일 때만)
    if fit_scores.get(FitType.eye.value, {}).get("score") is not None \
            and (gaze_map := _gaze_map(session)) is not None:
        fit_scores[FitType.eye.value]["gaze_map"] = gaze_map

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
        evidence_segments=sorted(
            evidence_segments + live_segments + _habit_segments(session),
            key=lambda s: s["turn_order"],
        ),
        headline=headline,
        rebuild=_build_rebuild(session, by_fit.get(FitType.response, [])),
        speech_stats=_build_speech_stats(turn_results, session),
        # 하루의 결말 — 수행도(rapport) 분기. "내 대답이 하루를 바꿨다"는 정서적 마침표
        day_ending=select_ending(session),
        # 심층 교차 분석 — 담화 구조·압박 내성·적응 곡선 (표본 부족 렌즈는 생략)
        deep_analysis=build_deep_analysis(session, turn_results),
        analysis_ms=analysis_ms,
    )
    db.add(report)
    db.commit()
    return report
