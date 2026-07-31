"""키넥트 뎁스 통합(S6) — 스키마·채점 게이트·리포트 관찰 카드 (docs/kinect/04).

핵심 계약:
  - 채점 밴드는 그대로: 프론트가 뎁스 실측을 기존 필드 단위로 넣고 출처만 표시한다.
  - head_down_ratio는 교체 금지(단위 다름) — 웹캠이 죽은 턴에서 기본값 0.0이
    만점으로 새지 않아야 한다.
  - 폴백 양방향: 키넥트 없음 → 기존 경로 그대로 / 웹캠 없음 → 키넥트 프레임 게이트.
"""
from types import SimpleNamespace

from app.ai import nonverbal
from app.schemas.schemas import KinectObsIn, NonverbalIn
from app.services.report import _kinect_segments


def _mp_payload(**over):
    base = {
        "frames": 100, "front_gaze_ratio": 0.8, "gaze_off_count": 2,
        "avg_shoulder_tilt_deg": 4.0, "head_down_ratio": 0.1, "posture_sway": 0.03,
        "tilt_drift_deg": 1.0,
    }
    base.update(over)
    return base


# ---------------------------------------------------------------------------
# 스키마 살균
# ---------------------------------------------------------------------------

def test_kinect_schema_clamps_physical_ranges():
    obs = KinectObsIn(
        frames=2_000_000, fps=999.0, tilt_deg=180.0, sway_norm=99.0,
        torso_yaw_deg=999.0, dist_cm=99999.0, torso_yaw_dir="up", mode="X" * 99,
    )
    assert obs.frames == 1_000_000
    assert obs.fps == 120.0
    assert obs.tilt_deg == 90.0
    assert obs.sway_norm == 10.0
    assert obs.torso_yaw_deg == 180.0
    assert obs.dist_cm == 1000.0
    assert obs.torso_yaw_dir is None  # left|right 외에는 버린다
    assert len(obs.mode) == 30


def test_nonverbal_accepts_nested_kinect_and_sanitizes_source():
    nv = NonverbalIn(**_mp_payload(), posture_source="kinect",
                     kinect={"frames": 60, "tilt_deg": 2.0, "torso_yaw_deg": 8.0})
    assert nv.posture_source == "kinect"
    assert nv.kinect.frames == 60
    dumped = nv.model_dump()
    assert dumped["kinect"]["torso_yaw_deg"] == 8.0  # DB 저장 경로(model_dump) 직렬화

    weird = NonverbalIn(**_mp_payload(), posture_source="mediapipe0day")
    assert weird.posture_source is None  # 알 수 없는 출처 표기는 버린다

    plain = NonverbalIn(**_mp_payload())
    assert plain.kinect is None  # 하위 호환 — 키넥트 없는 기존 페이로드


# ---------------------------------------------------------------------------
# score_posture 게이트
# ---------------------------------------------------------------------------

def test_score_posture_backward_compatible_without_kinect():
    # 기존 페이로드는 값·게이트 모두 이전과 동일하게 동작해야 한다
    metrics = _mp_payload()
    assert nonverbal.score_posture(metrics) is not None
    assert nonverbal.score_posture({"frames": 2}) is None


def test_score_posture_accepts_kinect_frames_when_webcam_dead():
    # 웹캠 전멸 + 키넥트 생존: 뎁스 표본으로 게이트를 통과해야 한다
    metrics = {
        "frames": 0, "posture_source": "kinect",
        "avg_shoulder_tilt_deg": 3.0, "posture_sway": 0.02, "tilt_drift_deg": 0.5,
        "kinect": {"frames": 60},
    }
    score = nonverbal.score_posture(metrics)
    assert score is not None

    # 출처 표기 없이 kinect 뭉치만 있으면 게이트를 열지 않는다 (명시적 계약)
    unsourced = {**metrics}
    unsourced.pop("posture_source")
    assert nonverbal.score_posture(unsourced) is None


def test_score_posture_kinect_only_excludes_head_down_default():
    # head_down_ratio는 MediaPipe 몫 — 웹캠이 죽은 턴에서 기본값 0.0이 가중 0.35의
    # 상수 만점으로 새면 안 된다. 나쁜 자세(기울기 20°)의 키넥트 단독 턴이
    # head_down 만점 희석 덕에 점수가 올라가지 않는지 확인한다.
    bad_posture = {
        "frames": 0, "posture_source": "kinect",
        "avg_shoulder_tilt_deg": 20.0, "posture_sway": 0.22, "tilt_drift_deg": 10.0,
        "kinect": {"frames": 60},
    }
    kinect_only = nonverbal.score_posture(bad_posture)
    with_headdown_default = nonverbal.score_posture({**bad_posture, "frames": 100})
    assert kinect_only is not None and with_headdown_default is not None
    # head_down 0.0(만점)이 섞인 쪽이 반드시 더 높다 = 단독 경로에서는 빠져 있다
    assert with_headdown_default > kinect_only


def test_score_posture_kinect_values_flow_through_existing_bands():
    # 같은 단위이므로 밴드도 같다: 뎁스 기울기 0° vs 20°는 점수가 갈려야 한다
    good = nonverbal.score_posture({
        "frames": 0, "posture_source": "kinect",
        "avg_shoulder_tilt_deg": 0.0, "posture_sway": 0.0, "tilt_drift_deg": 0.0,
        "kinect": {"frames": 60},
    })
    bad = nonverbal.score_posture({
        "frames": 0, "posture_source": "kinect",
        "avg_shoulder_tilt_deg": 20.0, "posture_sway": 0.22, "tilt_drift_deg": 10.0,
        "kinect": {"frames": 60},
    })
    assert good == 100.0
    assert bad < 40.0


# ---------------------------------------------------------------------------
# 리포트 관찰 카드 (밴드 없는 축 — 관찰 문장으로만)
# ---------------------------------------------------------------------------

def _turn(kinect: dict | None, order: int = 1, **nv):
    metrics = {"frames": 100, **nv}
    if kinect is not None:
        metrics["kinect"] = kinect
    return SimpleNamespace(
        id=order, order=order, answered_at="2026-07-31T10:00:00",
        nonverbal_metrics=metrics, question_type="normal",
    )


def _session(*turns):
    return SimpleNamespace(turns=list(turns))


def test_kinect_segments_absent_without_depth_data():
    assert _kinect_segments(_session(_turn(None))) == []
    assert _kinect_segments(_session()) == []


def test_kinect_segments_torso_rotation_observation():
    segs = _kinect_segments(_session(
        _turn({"torso_yaw_deg": 15.0, "torso_yaw_dir": "left"}, order=1),
        _turn({"torso_yaw_deg": 13.0, "torso_yaw_dir": "left"}, order=2),
    ))
    assert len(segs) == 1
    assert "왼쪽" in segs[0]["observed"]
    assert "뎁스" in segs[0]["observed"]  # 측정 출처를 문장에 명시 (실측 근거 어필)
    assert segs[0]["fit_type"] == "habit"
    assert segs[0]["suggestion"]  # 처방(따라 할 행동)이 반드시 붙는다


def test_kinect_segments_distance_backoff_observation():
    segs = _kinect_segments(_session(_turn({"dist_drift_cm": 18.0})))
    assert len(segs) == 1
    assert "물러났" in segs[0]["observed"]


def test_kinect_segments_praises_frontal_torso():
    segs = _kinect_segments(_session(_turn({"torso_yaw_deg": 2.0, "dist_drift_cm": 1.0})))
    assert len(segs) == 1
    assert "정면" in segs[0]["observed"]


def test_kinect_segments_conservative_below_thresholds():
    # 애매한 값(회전 8°)에는 지적도 칭찬도 만들지 않는다 — 확실할 때만 말한다
    assert _kinect_segments(_session(_turn({"torso_yaw_deg": 8.0, "torso_yaw_dir": "left"}))) == []


# ---------------------------------------------------------------------------
# E2E: 세션 → 분석 → 리포트 전 구간에 키넥트 페이로드가 흐른다
# ---------------------------------------------------------------------------

def test_kinect_payload_flows_through_analysis_to_report():
    """웹캠이 죽은(frames=0) 턴도 뎁스 실측만으로 Posture가 채점되고,
    리포트에 뎁스 관찰 카드가 실린다 — S6 배선의 종단 검증."""
    from app.core.database import SessionLocal
    from app.models import (
        AnalysisResult, Consent, FitType, RoleplaySession, Scenario, SessionStatus, Turn, utcnow,
    )
    from app.seed.run import seed
    from app.services.analysis import run_analysis

    seed()
    db = SessionLocal()
    try:
        scenario = db.query(Scenario).first()
        episode = scenario.episodes[0]
        session = RoleplaySession(scenario_id=scenario.id, status=SessionStatus.analyzing)
        db.add(session)
        db.flush()
        db.add(Consent(session_id=session.id, storage_policy="anonymous", agreed=True))
        db.add(Turn(
            session_id=session.id, episode_id=episode.id, order=1,
            question_type="initial", question_text=episode.initial_question,
            character_id=episode.character_id, stt_source="text", answered_at=utcnow(),
            response_text="결론부터 말씀드리면 원인 로그를 확인했고 오늘 중 조치하겠습니다.",
            nonverbal_metrics={
                "frames": 0,  # 웹캠 전멸 시나리오 — 뎁스 게이트만으로 채점돼야 한다
                "posture_source": "kinect",
                "avg_shoulder_tilt_deg": 2.0, "posture_sway": 0.02, "tilt_drift_deg": 0.5,
                "kinect": {
                    "frames": 90, "duration_sec": 6.0, "fps": 30.0, "calibrated": True,
                    "mode": "CUDA", "tilt_deg": 2.0, "sway_norm": 0.02,
                    "torso_yaw_deg": 16.0, "torso_yaw_dir": "left", "dist_cm": 140.0,
                },
            },
        ))
        db.commit()
        sid = session.id
    finally:
        db.close()

    run_analysis(sid)

    db = SessionLocal()
    try:
        s = db.get(RoleplaySession, sid)
        assert s.status == SessionStatus.completed
        posture = [
            r for r in db.query(AnalysisResult).filter_by(session_id=sid).all()
            if r.fit_type == FitType.posture
        ]
        assert posture, "뎁스 실측만으로도 Posture-Fit이 채점돼야 한다 (kinect frames 게이트)"
        cards = [seg for seg in s.report.evidence_segments if "뎁스" in seg.get("observed", "")]
        assert cards, "리포트에 뎁스 관찰 카드(몸통 회전 16° 왼쪽)가 실려야 한다"
        assert any("왼쪽" in seg["observed"] for seg in cards)
    finally:
        db.close()
