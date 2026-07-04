import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  createSession,
  getHistory,
  getProgress,
  getReport,
  issueCode,
  retryAnalysis,
  type HistoryItem,
} from '../../api/client';
import type { Report } from '../../api/types';
import Icon, { type IconName } from '../../components/Icon';
import { useSessionStore } from '../../stores/sessionStore';
import RadarChart from './RadarChart';

/** 성장 추이 스파크라인 — 최근 도전들의 종합 점수 */
function TrendChart({ items }: { items: HistoryItem[] }) {
  const W = 320;
  const H = 90;
  const PAD = 14;
  const xs = items.map((_, i) =>
    items.length === 1 ? W / 2 : PAD + (i * (W - PAD * 2)) / (items.length - 1),
  );
  const ys = items.map((it) => H - PAD - ((H - PAD * 2) * it.total_score) / 100);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="trend-chart" role="img" aria-label="점수 추이">
      <polyline
        points={xs.map((x, i) => `${x},${ys[i]}`).join(' ')}
        className="trend-line"
      />
      {items.map((it, i) => (
        <g key={it.session_id}>
          <circle cx={xs[i]} cy={ys[i]} r="4" className="trend-dot" />
          <text x={xs[i]} y={ys[i] - 8} textAnchor="middle" className="trend-value">
            {Math.round(it.total_score)}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** 점수 카운트업 애니메이션 (0 → target, 800ms) */
function useCountUp(target: number, ready: boolean): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!ready) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 800);
      setValue(target * (1 - (1 - t) ** 3)); // ease-out
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ready]);
  return value;
}

const KIOSK_IDLE_MS = 90_000;

function gradeLabel(score: number): string {
  if (score >= 85) return '훌륭해요';
  if (score >= 70) return '좋아요';
  if (score >= 55) return '성장 중';
  return '시작이 반';
}

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

const FIT_ICON: Record<string, IconName> = {
  response: 'message',
  voice: 'activity',
  eye: 'eye',
  posture: 'user',
  live: 'spark', // 실시간 코칭 발생 구간
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
  const [code, setCode] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const displayScore = useCountUp(report?.total_score ?? 0, !!report);

  // 체험 코드 발급 + 연습 추이 로드
  useEffect(() => {
    if (!report) return;
    issueCode().then(setCode).catch(() => undefined);
    getHistory().then(setHistory).catch(() => undefined);
  }, [report]);

  // 전시(키오스크) 모드: 무조작 90초 후 자동으로 대기 화면 복귀 (S-RKGLXP)
  useEffect(() => {
    if (localStorage.getItem('mirroting-kiosk') !== '1' || !report) return;
    let idle: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(idle);
      idle = setTimeout(() => navigate('/kiosk'), KIOSK_IDLE_MS);
    };
    reset();
    const events: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'scroll'];
    events.forEach((e) => window.addEventListener(e, reset));
    return () => {
      clearTimeout(idle);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [report, navigate]);

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
        <div className="report-actions">
          <button
            className="primary-btn"
            onClick={async () => {
              try {
                await retryAnalysis(Number(sessionId));
                window.location.reload(); // 폴링 재시작
              } catch {
                navigate('/');
              }
            }}
          >
            분석 다시 시도
          </button>
          <button className="ghost-btn" onClick={() => navigate('/')}>처음으로</button>
        </div>
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
            <span className="gauge-score">{Math.round(displayScore)}</span>
            <span className="gauge-label">{gradeLabel(report.total_score)}</span>
          </div>
        </div>
        <div className="badge-row">
          {report.percentile_top !== null && report.percentile_top <= 50 && (
            <p className="delta-badge up">체험자 상위 {report.percentile_top}%</p>
          )}
          {delta !== null && (
            <p className={`delta-badge ${delta >= 0 ? 'up' : 'down'}`}>
              직전 도전 대비 {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}점
            </p>
          )}
        </div>
        <p className="analysis-time">
          {report.mode}분 모드 · {report.difficulty === 'pressure' ? '압박' : '기본'} 난이도 ·
          턴 {report.turn_breakdown.length}개 · 분석 {(report.analysis_ms / 1000).toFixed(1)}초
        </p>
        {report.speech_stats.turns !== undefined && (
          <div className="stats-strip">
            <span>발화 {report.speech_stats.total_syllables}음절</span>
            <span className={report.speech_stats.banned_count ? 'stat-bad' : 'stat-good'}>
              위험 표현 {report.speech_stats.banned_count}회
            </span>
            <span className="stat-good">권장 표현 {report.speech_stats.recommended_count}회</span>
            {report.speech_stats.formal_pct != null && (
              <span>존댓말 {report.speech_stats.formal_pct}%</span>
            )}
            {report.speech_stats.avg_speech_rate != null && (
              <span>말속도 {report.speech_stats.avg_speech_rate}음절/초</span>
            )}
          </div>
        )}
      </header>

      {'sentence' in report.headline && (
        <section className="headline-card">
          <span className="headline-label">오늘의 한 문장</span>
          <p className="headline-sentence">{report.headline.sentence}</p>
          <p className="headline-context">{report.headline.context}</p>
        </section>
      )}

      <section className="analysis-visuals">
        <div className="card radar-card">
          <h2>4-Fit 프로파일 {report.previous && <small className="legend">─ 이번 &nbsp; ┄ 직전</small>}</h2>
          <RadarChart
            current={Object.fromEntries(
              Object.entries(report.fit_scores).map(([k, v]) => [k, v.score]),
            )}
            previous={report.previous?.fit_scores ?? null}
          />
        </div>
        {report.turn_breakdown.length > 0 && (
          <div className="card timeline-card">
            <h2>턴별 흐름</h2>
            <div className="turn-timeline">
              {report.turn_breakdown.map((t) => (
                <div key={t.turn_order} className="turn-row">
                  <div className="turn-row-head">
                    <span className="evidence-turn">턴 {t.turn_order}</span>
                    {t.question_type !== 'initial' && (
                      <span className={`type-chip ${t.question_type}`}>
                        {t.question_type === 'pressure' ? '압박' : '후속'}
                      </span>
                    )}
                    <span className="turn-episode">{t.episode_title}</span>
                  </div>
                  {t.scores.response !== undefined && (
                    <div className="turn-score-bar">
                      <span className="turn-score-label">응답 {Math.round(t.scores.response)}</span>
                      <div className="fit-bar">
                        <div className="fit-bar-fill" style={{ width: `${t.scores.response}%` }} />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="fit-grid">
        {Object.entries(report.fit_scores).map(([fit, data]) => {
          const prevScore = report.previous?.fit_scores[fit];
          const fitDelta =
            data.score !== null && prevScore != null ? data.score - prevScore : null;
          return (
            <div key={fit} className={`fit-card ${data.score === null ? 'unmeasured' : ''}`}>
              <div className="fit-head">
                <span className="fit-icon"><Icon name={FIT_ICON[fit]} size={16} /></span>
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
          <h2><Icon name="check" size={16} /> 잘한 점</h2>
          <ul className="feedback-list">
            {report.strengths.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>
      )}

      {report.improvements.length > 0 && (
        <section className="card">
          <h2><Icon name="spark" size={16} /> 다음에 이렇게</h2>
          <ul className="feedback-list">
            {report.improvements.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>
      )}

      {report.rebuild.items && report.rebuild.items.length > 0 && (
        <section className="card rebuild-card">
          <h2><Icon name="message" size={16} /> 코치와 다시 쓰기
            <small className="legend">「{report.rebuild.episode_title}」 답변 첨삭</small>
          </h2>
          {report.rebuild.quote && <blockquote>“{report.rebuild.quote}”</blockquote>}
          <p className="section-sub">
            잘 담은 요소는 그대로, 빠진 요소는 아래 문장을 더하면 완성된 답변이 됩니다.
          </p>
          <div className="rebuild-list">
            {report.rebuild.items.map((item) => (
              <div key={item.label} className={`rebuild-item ${item.covered ? 'covered' : 'missing'}`}>
                <span className="rebuild-mark">
                  <Icon name={item.covered ? 'check' : 'spark'} size={14} />
                </span>
                <div>
                  <span className="rebuild-label">
                    {item.label} {item.covered ? '— 이미 잘 담았어요' : '— 이 문장을 더해보세요'}
                  </span>
                  {!item.covered && <p className="rebuild-sentence">“{item.sentence}”</p>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <h2><Icon name="search" size={16} /> 근거 구간</h2>
        <p className="section-sub">왜 이런 점수가 나왔는지, 실제 응답에서 확인해보세요.</p>
        <div className="evidence-list">
          {report.evidence_segments.map((seg) => (
            <div key={`${seg.fit_type}-${seg.turn_id}`} className="evidence-item">
              <div className="evidence-meta">
                <span className="evidence-turn">턴 {seg.turn_order}</span>
                <span className="evidence-fit">
                  <Icon name={FIT_ICON[seg.fit_type] ?? 'search'} size={13} />{' '}
                  {seg.fit_type === 'live' ? '실시간 코칭' : `${seg.fit_type}-fit`}
                </span>
              </div>
              {seg.quote && <blockquote>“{seg.quote}”</blockquote>}
              <p><strong>관측</strong> {seg.observed}</p>
              <p><strong>해석</strong> {seg.interpretation}</p>
              <p className="evidence-suggestion"><strong>추천</strong> {seg.suggestion}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="analysis-visuals">
        {history.length >= 2 && (
          <div className="card">
            <h2>
              <Icon name="trend" size={16} /> 나의 성장 추이
              <small className="legend">최근 {history.length}회 종합 점수</small>
            </h2>
            <TrendChart items={history} />
          </div>
        )}
        {code && (
          <div className="card code-card">
            <h2><Icon name="key" size={16} /> 내 체험 코드</h2>
            <p className="my-code">{code}</p>
            <p className="section-sub">
              다음 방문 때 시작 화면에서 이 코드를 입력하면, 개인정보 없이도
              오늘의 기록에 이어서 성장 추이를 볼 수 있어요.
            </p>
          </div>
        )}
      </section>

      <div className="report-actions">
        {retryCountdown === null ? (
          <>
            <button className="primary-btn" onClick={() => setRetryCountdown(10)}>
              10초 재도전 — 방금 배운 것을 바로 적용해보기
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
