/** 운영/기관 대시보드 골격 (R-NCULBP) — 핵심 지표 카드 + 전시 초기화. */
import { useCallback, useEffect, useState } from 'react';
import { adminMetrics, adminReset } from '../../api/client';
import type { AdminMetrics } from '../../api/types';

export default function AdminPage() {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [message, setMessage] = useState('');

  const load = useCallback(() => {
    adminMetrics().then(setMetrics).catch(() => setMessage('지표를 불러오지 못했습니다.'));
  }, []);

  useEffect(load, [load]);

  async function reset() {
    const result = await adminReset();
    setMessage(`초기화 완료 — 진행 중이던 세션 ${result.aborted_sessions}건 정리`);
    load();
  }

  return (
    <div className="page admin">
      <header className="admin-header">
        <h1>운영 대시보드</h1>
        <button className="primary-btn" onClick={reset}>
          🔄 다음 체험자 준비 (1클릭 초기화)
        </button>
      </header>
      {message && <div className="notice">{message}</div>}

      {metrics && (
        <section className="metric-grid">
          <div className="metric-card">
            <span className="metric-value">{metrics.sessions_total}</span>
            <span className="metric-label">총 세션</span>
          </div>
          <div className="metric-card">
            <span className="metric-value">{Math.round(metrics.completion_rate * 100)}%</span>
            <span className="metric-label">완료율 (리포트 도달)</span>
          </div>
          <div className="metric-card">
            <span className="metric-value">{Math.round(metrics.retry_rate * 100)}%</span>
            <span className="metric-label">재도전율</span>
          </div>
          <div className="metric-card">
            <span className="metric-value">{metrics.avg_total_score ?? '—'}</span>
            <span className="metric-label">평균 종합 점수</span>
          </div>
          <div className="metric-card">
            <span className="metric-value">
              {metrics.avg_analysis_ms !== null
                ? `${(metrics.avg_analysis_ms / 1000).toFixed(1)}s`
                : '—'}
            </span>
            <span className="metric-label">평균 분석 시간</span>
          </div>
          {Object.entries(metrics.avg_fit_scores).map(([fit, score]) => (
            <div key={fit} className="metric-card">
              <span className="metric-value">{score}</span>
              <span className="metric-label">평균 {fit}-fit</span>
            </div>
          ))}
        </section>
      )}
      <p className="section-sub">
        * 기간/시나리오/기기 필터, 익명 ID 추이, CSV 내보내기는 다음 단계에서 확장 예정입니다.
      </p>
    </div>
  );
}
