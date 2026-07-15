"""Voice 전문가 패스 — 쉼 위치 관용·재시작 감지·머뭇거림 인용/순간·압박 음성.

핵심 원칙 검증: 같은 1.2초 침묵도 위치가 다르면 정반대로 판정된다.
문장 사이(종결어미 뒤 1.2~2.5s) 쉼은 관용, 문장 중간 끊김·데드에어만 감점.
오분류 방향은 '머뭇거림을 완급으로 봐주는' 쪽(과소 감점)이어야 한다.
"""
from types import SimpleNamespace

from app.ai.voice_align import classify_long_pauses, detect_restarts
from app.ai.voice_fit import score_voice
from app.services.deep_analysis import build_composure
from app.services.moments import build_turn_moments
from app.services.report import _voice_evidence


def _words(*items):
    """(word, start, end) 튜플 → Vosk 단어 스트림."""
    return [{"word": w, "start": s, "end": e} for w, s, e in items]


# ---- 쉼 위치 분류 ----

def test_boundary_pause_is_deliberate():
    # 종결어미("~니다") 뒤 1.5초 — 의도적 완급으로 관용
    r = classify_long_pauses(_words(("확인했습니다", 0.0, 1.0), ("원인은", 2.5, 3.0)))
    assert len(r["deliberate"]) == 1 and not r["hesitations"]


def test_mid_sentence_pause_is_hesitation():
    # 조사("~은") 뒤 1.5초 — 문장 중간 끊김 = 머뭇거림
    r = classify_long_pauses(_words(("원인은", 0.0, 0.5), ("세션", 2.0, 2.5)))
    assert len(r["hesitations"]) == 1
    assert r["hesitations"][0]["after"] == "원인은"
    assert r["hesitations"][0]["dur"] == 1.5


def test_dead_air_at_boundary_still_hesitation():
    # 문장 사이라도 2.5초를 넘으면 데드에어 — 청자가 끊김으로 인지
    r = classify_long_pauses(_words(("확인했습니다", 0.0, 1.0), ("원인은", 3.8, 4.2)))
    assert len(r["hesitations"]) == 1 and not r["deliberate"]


def test_short_gap_ignored():
    r = classify_long_pauses(_words(("원인은", 0.0, 0.5), ("세션", 1.5, 2.0)))  # 1.0s
    assert not r["hesitations"] and not r["deliberate"]


# ---- 재시작(단어 반복) ----

def test_restart_detected_with_example():
    r = detect_restarts(_words(("그", 0, 0.2), ("그", 0.3, 0.5), ("문제는", 0.6, 1.0)))
    assert r["count"] == 1 and r["examples"] == ["그 그"]


def test_triple_repeat_counts_once_and_fillers_excluded():
    r = detect_restarts(_words(
        ("저는", 0, 0.3), ("저는", 0.4, 0.7), ("저는", 0.8, 1.1),
        ("어", 1.2, 1.4), ("어", 1.5, 1.7),  # 간투어는 별도 집계 — 재시작 아님
    ))
    assert r["count"] == 1


# ---- score_voice: 위치 인지 페널티 ----

def _voice_metrics(**kw):
    base = {
        "speech_rate_sps": 4.5, "pause_ratio": 0.2, "energy_cv": 0.4,
        "lead_in_sec": 1.0, "f0_cv": 0.2, "long_pause_count": 2,
    }
    base.update(kw)
    return base


def test_deliberate_pauses_forgiven_with_alignment():
    blind = score_voice(_voice_metrics())  # 정렬 없음 → 위치 무차별 감점 (폴백)
    forgiven = score_voice(_voice_metrics(alignment={
        "pause_quality": {"deliberate_count": 2, "hesitation_count": 0},
    }))
    penalized = score_voice(_voice_metrics(alignment={
        "pause_quality": {"deliberate_count": 0, "hesitation_count": 2},
    }))
    assert forgiven > blind      # 문장 사이 쉼은 관용 — 같은 침묵이 완급이 된다
    assert penalized == blind    # 문장 중간 끊김은 기존과 동일하게 감점


# ---- moments: 머뭇거림이 결정적 순간이 된다 ----

def test_hesitation_becomes_moment_with_quote():
    align = {
        "spans": [{"text": "재발 방지는", "start": 9.0, "end": 12.0}],
        "hesitations": [{"at": 10.0, "dur": 1.8}],
    }
    moments = build_turn_moments(2, "initial", [], align)
    assert moments and "긴 머뭇거림" in moments[0]["description"]
    assert moments[0]["quote"] == "재발 방지는"


# ---- 리포트: 머뭇거림·재시작 인용 분기 ----

def _result(m):
    return [SimpleNamespace(turn_id=1, score=60.0, raw_metrics=m)]


def test_voice_evidence_quotes_hesitation():
    seg = _voice_evidence(_result(_voice_metrics(alignment={
        "spans": [],
        "pause_quality": {"deliberate_count": 0, "hesitation_count": 2},
        "worst_hesitation": {"at": 10.0, "dur": 1.8, "after": "원인은", "context": "장애 원인은"},
    })))
    assert "1.8초 멈칫" in seg["observed"] and "장애 원인은" in seg["observed"]


def test_voice_evidence_flags_restarts():
    seg = _voice_evidence(_result(_voice_metrics(alignment={
        "spans": [],
        "pause_quality": {"deliberate_count": 0, "hesitation_count": 0},
        "restarts": {"count": 3, "examples": ["그 그"]},
    })))
    assert "다시 시작한" in seg["observed"]


# ---- composure: 압박 음성 반응 (피치 상승) ----

def test_composure_detects_pitch_rise_under_pressure():
    def pair(f0):
        return ({"front_gaze_ratio": 0.9}, {"f0_mean_hz": f0})
    c = build_composure([pair(165)], [pair(140), pair(142)])
    assert c["level"] == "회복형"
    assert "목소리 높이" in c["comment"]
