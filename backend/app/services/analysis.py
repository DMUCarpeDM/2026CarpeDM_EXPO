"""분석 파이프라인 오케스트레이션 + 진행률 추적 (S-TTQEUS).

FastAPI BackgroundTask로 실행되며 단계별로 session.analysis_progress를 갱신한다:
  stt → response → voice → nonverbal → scoring → report → done
"""
import time
import traceback

from app.ai import nonverbal, response_fit, voice_fit
from app.ai.scoring import weighted_mean
from app.ai.stt import get_stt_provider
from app.core.database import SessionLocal
from app.models import AnalysisResult, FitType, RoleplaySession, SessionStatus, Turn
from app.services import report as report_service
from app.services.session_fsm import transition

STAGES = ["stt", "response", "voice", "nonverbal", "scoring", "report"]


def _set_progress(db, session: RoleplaySession, stage: str, pct: int) -> None:
    session.analysis_progress = {"stage": stage, "pct": pct}
    db.commit()


def run_analysis(session_id: int) -> None:
    db = SessionLocal()
    started = time.monotonic()
    try:
        session = db.get(RoleplaySession, session_id)
        if session is None or session.status != SessionStatus.analyzing:
            return
        turns = [t for t in session.turns if t.response_text or t.audio_path]

        # 1) STT — Web Speech가 이미 텍스트를 보냈으면 스킵. whisper 설치 시 오디오만 있는 턴 변환
        _set_progress(db, session, "stt", 5)
        no_text = [t for t in turns if not t.response_text and t.audio_path]
        if no_text:
            provider = get_stt_provider()
            if provider:
                for t in no_text:
                    t.response_text = provider.transcribe(t.audio_path)
                    t.stt_source = "whisper"
                db.commit()

        # 2) Response-Fit (턴별)
        _set_progress(db, session, "response", 25)
        response_scores: list[tuple[float, float]] = []
        for t in turns:
            if not t.response_text:
                continue
            metrics = response_fit.analyze_response(t.response_text, t.episode.checklist)
            score = response_fit.score_response(metrics)
            db.add(AnalysisResult(
                session_id=session.id, turn_id=t.id,
                fit_type=FitType.response, raw_metrics=metrics, score=score,
            ))
            weight = sum(i.get("weight", 1.0) for i in t.episode.checklist) or 1.0
            response_scores.append((score, weight))

        # 3) Voice-Fit — 오디오가 있으면 실측, 음성 인식(webspeech) 턴만 발화 시간 근사.
        #    텍스트 입력 턴은 duration이 타이핑 시간이라 말속도 추정이 무의미하므로 측정 제외.
        _set_progress(db, session, "voice", 45)
        voice_scores: list[tuple[float, float]] = []
        for t in turns:
            if t.audio_path:
                metrics = voice_fit.analyze_audio(t.audio_path, t.response_text)
            elif t.stt_source == "webspeech":
                metrics = voice_fit.estimate_from_text(t.response_text, t.response_duration_ms)
            else:
                metrics = {}
            score = voice_fit.score_voice(metrics)
            if score is None:
                continue
            db.add(AnalysisResult(
                session_id=session.id, turn_id=t.id,
                fit_type=FitType.voice, raw_metrics=metrics, score=score,
            ))
            voice_scores.append((score, 1.0))

        # 4) Eye/Posture-Fit (클라이언트 MediaPipe 집계 지표)
        _set_progress(db, session, "nonverbal", 65)
        eye_scores: list[tuple[float, float]] = []
        posture_scores: list[tuple[float, float]] = []
        for t in turns:
            nv = t.nonverbal_metrics or {}
            duration = (t.response_duration_ms or 0) / 1000
            eye = nonverbal.score_eye(nv, duration)
            if eye is not None:
                db.add(AnalysisResult(
                    session_id=session.id, turn_id=t.id,
                    fit_type=FitType.eye, raw_metrics=nv, score=eye,
                ))
                eye_scores.append((eye, 1.0))
            posture = nonverbal.score_posture(nv)
            if posture is not None:
                db.add(AnalysisResult(
                    session_id=session.id, turn_id=t.id,
                    fit_type=FitType.posture, raw_metrics=nv, score=posture,
                ))
                posture_scores.append((posture, 1.0))
        db.commit()

        # 5) 세션 레벨 점수 통합
        _set_progress(db, session, "scoring", 80)
        session_scores: dict[FitType, float | None] = {
            FitType.response: weighted_mean(response_scores) if response_scores else None,
            FitType.voice: weighted_mean(voice_scores) if voice_scores else None,
            FitType.eye: weighted_mean(eye_scores) if eye_scores else None,
            FitType.posture: weighted_mean(posture_scores) if posture_scores else None,
        }
        for fit, score in session_scores.items():
            if score is not None:
                db.add(AnalysisResult(
                    session_id=session.id, turn_id=None, fit_type=fit,
                    raw_metrics={}, score=score,
                ))
        db.commit()

        # 6) 리포트 생성
        _set_progress(db, session, "report", 92)
        analysis_ms = int((time.monotonic() - started) * 1000)
        report_service.build_report(db, session, session_scores, analysis_ms)

        transition(session, SessionStatus.completed)
        _set_progress(db, session, "done", 100)
    except Exception:
        traceback.print_exc()
        db.rollback()
        session = db.get(RoleplaySession, session_id)
        if session:
            session.analysis_progress = {"stage": "error", "pct": 0}
            db.commit()
    finally:
        db.close()
