import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createSession, getProgress, getReport } from '../../api/client';
import type { Report } from '../../api/types';
import { useSessionStore } from '../../stores/sessionStore';

const STAGE_LABEL: Record<string, string> = {
  queued: '분석 대기 중',
  stt: '음성 텍스트 변환',
  response: '응답 내용 분석',
  voice: '발화 안정성 분석',
  nonverbal: '시선·자세 분석',
  scoring: '4-Fit 점수 계산',
  report: '리포트 작성',
  done: '완료',
};

const FIT_EMOJI: Record<string, string> = {
  response: '💬',
  voice: '🎙',
  eye: '👀',
  posture: '🧍',
};

export default function ReportPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const setSession = useSessionStore((s) => s.setSession);
  const [report, setReport] = useState<Report | null>(null);
  const [stage, setStage] = useState('queued');
  const [pct, setPct] = useState(0);
  const [error, setError] = useState('');
  const [retryCountdown, setRetryCountdown] = useState<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const id = Number(sessionId);
    if (!id) return;
    pollRef.current = setInterval(async () => {
      try {
        const progress = await getProgress(id);
        setStage(progress.stage);
        setPct(progress.pct);
        if (progress.status === 'completed') {
          if (pollRef.current) clearInterval(pollRef.current);
          setReport(await getReport(id));
        } else if (progress.stage === 'error' || progress.status === 'aborted') {
          if (pollRef.current) clearInterval(pollRef.current);
          setError('분석 중 문제가 발생했습니다. 다시 시도해주세요.');
        }
      } catch {
        /* 다음 폴링에서 재시도 */
      }
    }, 700);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [sessionId]);

  const retry = useCallback(async () => {
    if (!report) return;
    const session = await createSession({
      mode: report.mode,
      difficulty: report.difficulty,
      agreed: true,
    });
    setSession(session);
    navigate(`/roleplay/${session.id}`);
  }, [report, setSession, navigate]);

  // '10초 재도전' 카운트다운 (F-RVLDIK)
  useEffect(() => {
    if (retryCountdown === null) return;
    if (retryCountdown === 0) {
      void retry();
      return;
    }
    const t = setTimeout(() => setRetryCountdown((c) => (c ?? 1) - 1), 1000);
    return () => clearTimeout(t);
  }, [retryCountdown, retry]);

  if (error) {
    return (
      <div className="page report">
        <div className="error-banner">{error}</div>
        <button className="primary-btn" onClick={() => navigate('/')}>처음으로</button>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="page report loading">
        <div className="analysis-loader">
          <div className="loader-ring" />
          <h2>{STAGE_LABEL[stage] ?? '분석 중'}…</h2>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <p className="loading-sub">발화 내용 · 말하기 · 시선 · 자세를 종합 분석하고 있어요</p>
        </div>
      </div>
    );
  }

  const delta = report.previous ? report.total_score - report.previous.total_score : null;

  return (
    <div className="page report">
      <header className="report-header">
        <p className="hero-badge">4-Fit 결과 리포트</p>
        <div className="total-gauge">
          <svg viewBox="0 0 120 120" width="160" height="160">
            <circle cx="60" cy="60" r="52" className="gauge-track" />
            <circle
              cx="60"
              cy="60"
              r="52"
              className="gauge-value"
              strokeDasharray={`${(report.total_score / 100) * 326.7} 326.7`}
            />
          </svg>
          <div className="gauge-center">
            <span className="gauge-score">{Math.round(report.total_score)}</span>
            <span className="gauge-label">종합 점수</span>
          </div>
        </div>
        {delta !== null && (
          <p className={`delta-badge ${delta >= 0 ? 'up' : 'down'}`}>
            직전 도전 대비 {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}점
          </p>
        )}
        <p className="analysis-time">분석 소요 {(report.analysis_ms / 1000).toFixed(1)}초</p>
      </header>

      <section className="fit-grid">
        {Object.entries(report.fit_scores).map(([fit, data]) => {
          const prevScore = report.previous?.fit_scores[fit];
          const fitDelta =
            data.score !== null && prevScore != null ? data.score - prevScore : null;
          return (
            <div key={fit} className={`fit-card ${data.score === null ? 'unmeasured' : ''}`}>
              <div className="fit-head">
                <span className="fit-emoji">{FIT_EMOJI[fit]}</span>
                <strong>{data.label}</strong>
                <span className="fit-score">
                  {data.score === null ? '—' : Math.round(data.score)}
                </span>
              </div>
              {data.score !== null && (
                <div className="fit-bar">
                  <div className="fit-bar-fill" style={{ width: `${data.score}%` }} />
                </div>
              )}
              <p className="fit-summary">{data.summary}</p>
              {fitDelta !== null && (
                <span className={`fit-delta ${fitDelta >= 0 ? 'up' : 'down'}`}>
                  {fitDelta >= 0 ? '▲' : '▼'} {Math.abs(fitDelta).toFixed(1)}
                </span>
              )}
            </div>
          );
        })}
      </section>

      {report.strengths.length > 0 && (
        <section className="card">
          <h2>💪 잘한 점</h2>
          <ul className="feedback-list">
            {report.strengths.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>
      )}

      {report.improvements.length > 0 && (
        <section className="card">
          <h2>🔧 다음에 이렇게</h2>
          <ul className="feedback-list">
            {report.improvements.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h2>🔍 근거 구간</h2>
        <p className="section-sub">왜 이런 점수가 나왔는지, 실제 응답에서 확인해보세요.</p>
        <div className="evidence-list">
          {report.evidence_segments.map((seg) => (
            <div key={`${seg.fit_type}-${seg.turn_id}`} className="evidence-item">
              <div className="evidence-meta">
                <span className="evidence-turn">턴 {seg.turn_order}</span>
                <span className="evidence-fit">{FIT_EMOJI[seg.fit_type]} {seg.fit_type}-fit</span>
              </div>
              {seg.quote && <blockquote>“{seg.quote}”</blockquote>}
              <p><strong>관측</strong> {seg.observed}</p>
              <p><strong>해석</strong> {seg.interpretation}</p>
              <p className="evidence-suggestion"><strong>추천</strong> {seg.suggestion}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="report-actions">
        {retryCountdown === null ? (
          <>
            <button className="primary-btn" onClick={() => setRetryCountdown(10)}>
              ⚡ 10초 재도전 — 방금 배운 걸 바로 적용해보기
            </button>
            <button className="ghost-btn" onClick={() => navigate('/')}>처음으로</button>
          </>
        ) : (
          <>
            <button className="primary-btn countdown" onClick={retry}>
              {retryCountdown}초 후 재입장… (바로 시작)
            </button>
            <button className="ghost-btn" onClick={() => setRetryCountdown(null)}>취소</button>
          </>
        )}
      </div>
    </div>
  );
}
