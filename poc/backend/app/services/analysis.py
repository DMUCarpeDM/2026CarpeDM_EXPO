"""분석 파이프라인 오케스트레이션 + 진행률 추적 (S-TTQEUS).

FastAPI BackgroundTask로 실행되며 단계별로 session.analysis_progress를 갱신한다:
  stt → response → voice → nonverbal → scoring → report → done
"""
import copy
import time
import traceback
from pathlib import Path

from app.ai import nonverbal, response_fit, voice_align, voice_fit
from app.ai.discourse import analyze_discourse
from app.ai.scoring import ENGINE_VERSION, weighted_mean
from app.ai.stt import get_stt_provider
from app.core.database import SessionLocal
from app.models import AnalysisResult, Consent, FitType, Report, RoleplaySession, SessionStatus, Turn
from app.services import report as report_service
from app.services.session_fsm import transition

STAGES = ["stt", "response", "voice", "nonverbal", "scoring", "report"]


def strip_turn_verbatim(metrics: dict) -> dict:
    """턴 레벨 raw_metrics에서 발화 원문 조각 제거 — 미저장 동의 파기의 일부.

    리포트가 자기 사본(evidence_segments 등)으로 인용을 표시하므로, 내부 중간
    산출물에 남은 verbatim(quotes.*.text, banmal_quotes, alignment.spans[].text)은
    파기 대상이다. 남기면 '미저장' 동의가 부분 soft-delete로 전락한다.
    """
    m = copy.deepcopy(metrics or {})
    quotes = m.get("quotes")
    if isinstance(quotes, dict):
        for q in quotes.values():
            if isinstance(q, dict):
                q.pop("text", None)
    politeness = m.get("politeness")
    if isinstance(politeness, dict):
        politeness.pop("banmal_quotes", None)
    alignment = m.get("alignment")
    if isinstance(alignment, dict):
        for span in alignment.get("spans") or []:
            if isinstance(span, dict):
                span.pop("text", None)
    return m


def _set_progress(db, session: RoleplaySession, stage: str, pct: int) -> None:
    # "at": 진행률 정체 감지용 — get_progress가 이 시각으로 죽은 분석 스레드를 판별한다
    session.analysis_progress = {"stage": stage, "pct": pct, "at": time.time()}
    db.commit()


def _seniority(role: str) -> str:
    """캐릭터 role 문자열 → 청자 지위. 완곡 명령(상향 지시형) 판정에만 쓴다."""
    role = role or ""
    if any(k in role for k in ("팀장", "상사", "부장", "이사", "대표", "사장")):
        return "superior"
    if any(k in role for k in ("선임", "선배", "사수")):
        return "senior"
    if "동료" in role:
        return "peer"
    return "other"


def _seniority_by_character(session: RoleplaySession) -> dict[str, str]:
    """시나리오 등장인물 id → 지위 매핑 (Episode.character_id로 청자 지위 조회)."""
    chars = (session.scenario.characters if session.scenario else None) or []
    return {c.get("id"): _seniority(c.get("role", "")) for c in chars if c.get("id")}


def run_analysis(session_id: int) -> None:
    db = SessionLocal()
    started = time.monotonic()
    try:
        session = db.get(RoleplaySession, session_id)
        if session is None or session.status != SessionStatus.analyzing:
            return
        # 멱등성: 중단된 이전 실행(크래시·재시작·재시도)이 남긴 부분 결과를 지우고 처음부터.
        # 지우지 않으면 (session_id, turn_id, fit_type) 유니크 제약에 걸린다.
        db.query(AnalysisResult).filter_by(session_id=session_id).delete()
        db.query(Report).filter_by(session_id=session_id).delete()
        db.commit()
        turns = [t for t in session.turns if t.response_text or t.audio_path]

        # 1) STT — Web Speech가 이미 텍스트를 보냈으면 스킵. whisper 설치 시 오디오만 있는 턴 변환
        _set_progress(db, session, "stt", 5)
        no_text = [t for t in turns if not t.response_text and t.audio_path]
        if no_text:
            provider = get_stt_provider()
            if provider:
                for t in no_text:
                    # 턴 단위 격리: 손상된 오디오 한 건이 세션 전체를 무너뜨리지 않게
                    try:
                        t.response_text = provider.transcribe(t.audio_path)
                        t.stt_source = "whisper"
                    except Exception:
                        traceback.print_exc()
                db.commit()

        # 2) Response-Fit (턴별) + 담화 구조 분석 (심층 리포트용)
        _set_progress(db, session, "response", 25)
        seniority = _seniority_by_character(session)
        response_scores: list[tuple[float, float]] = []
        for t in turns:
            if not t.response_text:
                continue
            # 과거 시드 방식이 남긴 깨진 에피소드 참조 방어 — 체크리스트 없이 분석 지속
            checklist = t.episode.checklist if t.episode else []
            # 청자 지위: 상사·선배 턴에서만 완곡 명령(상향 지시형)을 집계
            listener = seniority.get(t.episode.character_id, "") if t.episode else ""
            # 턴 단위 격리: 한 턴의 분석 실패는 그 턴만 건너뛰고 리포트를 완성한다
            try:
                metrics = response_fit.analyze_response(t.response_text, checklist)
                metrics["discourse"] = analyze_discourse(
                    t.response_text, t.question_text, listener,
                )
                score = response_fit.score_response(metrics)
            except Exception:
                traceback.print_exc()
                continue
            db.add(AnalysisResult(
                session_id=session.id, turn_id=t.id,
                fit_type=FitType.response, raw_metrics=metrics, score=score, engine_version=ENGINE_VERSION,
            ))
            weight = sum(i.get("weight", 1.0) for i in checklist) or 1.0
            response_scores.append((score, weight))

        # 3) Voice-Fit — 오디오가 있으면 실측, 음성 인식(webspeech) 턴만 발화 시간 근사.
        #    텍스트 입력 턴은 duration이 타이핑 시간이라 말속도 추정이 무의미하므로 측정 제외.
        _set_progress(db, session, "voice", 45)
        voice_scores: list[tuple[float, float]] = []
        for t in turns:
            # 턴 단위 격리: 병리적 오디오 한 건의 DSP 예외가 리포트 전체를 날리지 않게
            try:
                if t.audio_path:
                    metrics = voice_fit.analyze_audio(t.audio_path, t.response_text)
                    # 텍스트-음성 정렬: 어느 문장에서 무너졌는지 (Vosk 단어 타임스탬프)
                    provider = get_stt_provider()
                    if metrics and provider and hasattr(provider, "transcribe_words"):
                        try:
                            alignment = voice_align.analyze_alignment(
                                t.audio_path, provider.transcribe_words(t.audio_path),
                            )
                            if alignment:
                                metrics["alignment"] = alignment
                        except Exception:
                            pass  # 정렬은 부가 분석 — 실패해도 턴 분석은 유지
                elif t.stt_source == "webspeech":
                    metrics = voice_fit.estimate_from_text(t.response_text, t.response_duration_ms)
                else:
                    metrics = {}
                score = voice_fit.score_voice(metrics)
            except Exception:
                traceback.print_exc()
                continue
            if score is None:
                continue
            db.add(AnalysisResult(
                session_id=session.id, turn_id=t.id,
                fit_type=FitType.voice, raw_metrics=metrics, score=score, engine_version=ENGINE_VERSION,
            ))
            # 오디오 없이 발화 시간으로 근사한 턴(webspeech)은 단일 프록시(말속도)라
            # 신뢰도가 낮다 — 실측 오디오 턴을 가리지 않도록 세션 평균에서 하향 가중.
            voice_scores.append((score, 0.35 if metrics.get("estimated") else 1.0))

        # 4) Eye/Posture-Fit (클라이언트 MediaPipe 집계 지표)
        _set_progress(db, session, "nonverbal", 65)
        eye_scores: list[tuple[float, float]] = []
        posture_scores: list[tuple[float, float]] = []
        for t in turns:
            nv = t.nonverbal_metrics or {}
            duration = (t.response_duration_ms or 0) / 1000
            # 턴 단위 격리: 예상 밖 지표 페이로드는 그 턴만 건너뛴다
            try:
                eye = nonverbal.score_eye(nv, duration)
                posture = nonverbal.score_posture(nv)
            except Exception:
                traceback.print_exc()
                continue
            if eye is not None:
                db.add(AnalysisResult(
                    session_id=session.id, turn_id=t.id,
                    fit_type=FitType.eye, raw_metrics=nv, score=eye, engine_version=ENGINE_VERSION,
                ))
                eye_scores.append((eye, 1.0))
            if posture is not None:
                db.add(AnalysisResult(
                    session_id=session.id, turn_id=t.id,
                    fit_type=FitType.posture, raw_metrics=nv, score=posture, engine_version=ENGINE_VERSION,
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
                    raw_metrics={}, score=score, engine_version=ENGINE_VERSION,
                ))
        db.commit()

        # 6) 리포트 생성
        _set_progress(db, session, "report", 92)
        analysis_ms = int((time.monotonic() - started) * 1000)
        report_service.build_report(db, session, session_scores, analysis_ms)

        # 7) 저장 정책 적용 (S-CBYKOH): '미저장' 동의면 분석이 끝난 음성 파일을 즉시 삭제
        consent = db.query(Consent).filter_by(session_id=session.id).first()
        if consent is None or consent.storage_policy == "none":
            for t in session.turns:
                if t.audio_path:
                    Path(t.audio_path).unlink(missing_ok=True)
                    t.audio_path = ""
                # '미저장' 동의: 리포트 생성 후 대화 전문(발화 텍스트)도 파기.
                # 인용 근거는 이미 report.evidence_segments에 복사됐고 집계 리포트만 남긴다.
                t.response_text = ""
            # 턴 레벨 분석 중간 산출물의 verbatim도 함께 파기 — 리포트 사본만 남기고,
            # 그 사본은 보관 기간 후 기동 정리(_purge_expired_quotes)가 지운다.
            turn_results = db.query(AnalysisResult).filter(
                AnalysisResult.session_id == session.id,
                AnalysisResult.turn_id.isnot(None),
            ).all()
            for r in turn_results:
                r.raw_metrics = strip_turn_verbatim(r.raw_metrics)
            db.commit()

        # 최종 승격 전 DB 진실 재확인 — 분석 도중 운영자 리셋(→aborted)이 들어왔는지.
        # SessionLocal은 expire_on_commit=False라 in-memory status가 stale할 수 있어,
        # 그대로 completed로 전이하면 중단된 세션이 되살아나 지표·CSV를 오염시킨다.
        db.refresh(session)
        if session.status != SessionStatus.analyzing:
            db.query(AnalysisResult).filter_by(session_id=session_id).delete()
            db.query(Report).filter_by(session_id=session_id).delete()
            db.commit()
            return
        transition(session, SessionStatus.completed)
        _set_progress(db, session, "done", 100)
    except Exception:
        traceback.print_exc()
        db.rollback()
        session = db.get(RoleplaySession, session_id)
        if session:
            session.analysis_progress = {"stage": "error", "pct": 0, "at": time.time()}
            db.commit()
    finally:
        db.close()
