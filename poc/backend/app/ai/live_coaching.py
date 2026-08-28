"""실시간 코칭용 측정값 해석.

점수는 MediaPipe·음성 분석이 만든 수치로만 계산한다. 이 모듈은 그 수치가
반복적으로 나쁠 때에만 상대가 말할 짧은 지적의 근거를 만든다. 따라서 LLM은
판정기가 아니라, 이미 확인된 측정값을 자연스러운 말로 바꾸는 역할만 맡는다.
"""
import re

from app.ai.paralinguistics import analyze_fillers

# 같은 짧은 음절을 세 번 이상 반복한 경우만 머뭇거림으로 본다. "아마" 같은
# 정상 단어를 오인하지 않도록 2회 반복은 지표에 넣지 않는다.
_STUTTER_COMPACT = re.compile(r"([가-힣]{1,2})\1{2,}")
_STUTTER_SPACED = re.compile(r"(?:^|\s)([가-힣]{1,3})(?:\s+\1){2,}(?=\s|$)")

POSTURE_MIN_FRAMES = 15  # 80ms 샘플 기준 약 1.2초
SHOULDER_TILT_ALERT_DEG = 12.0
POSTURE_SWAY_ALERT = 0.12
HEAD_DOWN_ALERT_RATIO = 0.45
HUNCHED_ALERT_RATIO = 0.45
LEAN_BACK_ALERT_RATIO = 0.45
HAND_FACE_ALERT_SEC = 3.0
TILT_DRIFT_ALERT_DEG = 7.0
FILLER_ALERT_COUNT = 3
FILLER_ALERT_PER_100 = 6.0
STUTTER_ALERT_COUNT = 2


def count_stutters(text: str) -> int:
    """전사 텍스트에서 과도한 음절 반복만 보수적으로 센다."""
    if not text:
        return 0
    return len(_STUTTER_COMPACT.findall(text)) + len(_STUTTER_SPACED.findall(text))


def analyze_live_coaching(
    nonverbal: dict | None, response_text: str, duration_ms: int = 0,
) -> dict:
    """측정된 숫자만으로 즉시 개입이 필요한 신호를 반환한다.

    반환값은 API·LLM 양쪽에서 쓰이는 투명한 계약이다. 관찰값이 부족하면 빈
    issues를 돌려, 카메라 미가동이나 짧은 답변을 나쁜 습관으로 오해하지 않는다.
    """
    metrics = nonverbal or {}
    issues: list[dict] = []
    values: dict[str, float | int] = {}

    if metrics.get("calibrated") and int(metrics.get("frames") or 0) >= POSTURE_MIN_FRAMES:
        tilt = round(float(metrics.get("avg_shoulder_tilt_deg") or 0.0), 1)
        sway = round(float(metrics.get("posture_sway") or 0.0), 3)
        head_down = round(float(metrics.get("head_down_ratio") or 0.0), 2)
        hunched = round(float(metrics.get("hunched_ratio") or 0.0), 2)
        lean_back = round(float(metrics.get("lean_back_ratio") or 0.0), 2)
        hand_face_sec = round(float(metrics.get("hand_face_sec") or 0.0), 1)
        drift = round(max(0.0, float(metrics.get("tilt_drift_deg") or 0.0)), 1)
        values.update({
            "avg_shoulder_tilt_deg": tilt,
            "posture_sway": sway,
            "head_down_ratio": head_down,
            "hunched_ratio": hunched,
            "lean_back_ratio": lean_back,
            "hand_face_sec": hand_face_sec,
            "tilt_drift_deg": drift,
        })
        posture_reasons = []
        if tilt >= SHOULDER_TILT_ALERT_DEG:
            posture_reasons.append(f"어깨 기울기 {tilt}도")
        if sway >= POSTURE_SWAY_ALERT:
            posture_reasons.append(f"상체 흔들림 {sway}")
        if head_down >= HEAD_DOWN_ALERT_RATIO:
            posture_reasons.append(f"고개 숙임 {round(head_down * 100)}%")
        if hunched >= HUNCHED_ALERT_RATIO:
            posture_reasons.append(f"앞으로 숙인 자세 {round(hunched * 100)}%")
        if lean_back >= LEAN_BACK_ALERT_RATIO:
            posture_reasons.append(f"등받이에 기댄 자세 {round(lean_back * 100)}%")
        if hand_face_sec >= HAND_FACE_ALERT_SEC:
            posture_reasons.append(f"손이 얼굴 근처에 머문 시간 {hand_face_sec}초")
        if drift >= TILT_DRIFT_ALERT_DEG:
            posture_reasons.append(f"자세 무너짐 {drift}도")
        if posture_reasons:
            issues.append({"kind": "posture", "reasons": posture_reasons})

    fillers = analyze_fillers(response_text)
    filler_count = int(fillers.get("filler_count") or 0)
    filler_rate = float(fillers.get("filler_per_100_syllables") or 0.0)
    stutter_count = count_stutters(response_text)
    values.update({
        "filler_count": filler_count,
        "filler_per_100_syllables": filler_rate,
        "stutter_count": stutter_count,
        "duration_ms": max(0, int(duration_ms or 0)),
    })
    voice_reasons = []
    if filler_count >= FILLER_ALERT_COUNT or (
        filler_count >= 2 and filler_rate >= FILLER_ALERT_PER_100
    ):
        voice_reasons.append(f"간투어 {filler_count}회")
    if stutter_count >= STUTTER_ALERT_COUNT:
        voice_reasons.append(f"반복 발화 {stutter_count}회")
    if voice_reasons:
        issues.append({"kind": "voice", "reasons": voice_reasons})

    return {"issues": issues, "values": values}


def fallback_reaction(observation: dict) -> str:
    """Ollama가 응답하지 않을 때도 수치에 맞는 한 문장을 보장한다."""
    kinds = {issue.get("kind") for issue in observation.get("issues", [])}
    values = observation.get("values", {})
    if {"posture", "voice"} <= kinds:
        return "잠깐만요. 자세를 바로잡고, 숨을 고른 뒤 한 문장씩 다시 말씀해 주세요."
    if "posture" in kinds:
        if values.get("hand_face_sec", 0) >= HAND_FACE_ALERT_SEC:
            return "잠깐만요. 손은 얼굴에서 내리고, 상대를 보며 다시 말씀해 주세요."
        if values.get("lean_back_ratio", 0) >= LEAN_BACK_ALERT_RATIO:
            return "잠깐만요. 등을 살짝 세우고, 상대를 향해 다시 말씀해 주세요."
        if values.get("hunched_ratio", 0) >= HUNCHED_ALERT_RATIO:
            return "잠깐만요. 상체를 세우고, 어깨 힘을 뺀 뒤 다시 말씀해 주세요."
        return "잠깐만요. 지금 자세가 많이 흔들려 보여요. 어깨를 편하게 맞추고 다시 말씀해 주세요."
    if "voice" in kinds:
        return "잠깐만요. 말이 조금 끊겨 들려요. 숨을 고르고 한 문장씩 말씀해 주세요."
    return ""
