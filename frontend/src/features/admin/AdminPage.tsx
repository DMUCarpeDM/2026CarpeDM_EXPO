/** 운영/기관 대시보드 골격 (R-NCULBP) — 핵심 지표 카드 + 전시 초기화. */
import { isAxiosError } from 'axios';
import { useCallback, useEffect, useState } from 'react';
import {
  adminExportCsv,
  adminMetrics,
  adminReset,
  adminToken,
  setAdminToken,
} from '../../api/client';
import type { AdminMetrics } from '../../api/types';
import Icon from '../../components/Icon';

export default function AdminPage() {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [message, setMessage] = useState('');
  const [kiosk, setKiosk] = useState(localStorage.getItem('mirroting-kiosk') === '1');
  // 서버에 MIRROTING_ADMIN_TOKEN이 설정된 경우에만 401이 떨어지고 입력창이 열린다
  const [needToken, setNeedToken] = useState(false);
  const [token, setToken] = useState(adminToken());

  const handleError = useCallback((e: unknown, fallback: string) => {
    if (isAxiosError(e) && e.response?.status === 401) {
      setNeedToken(true);
      setMessage('운영 토큰이 필요합니다. 서버의 MIRROTING_ADMIN_TOKEN 값을 입력해주세요.');
    } else {
      setMessage(fallback);
    }
  }, []);

  const load = useCallback(() => {
    adminMetrics()
      .then((m) => {
        setMetrics(m);
        setNeedToken(false);
      })
      .catch((e) => handleError(e, '지표를 불러오지 못했습니다.'));
  }, [handleError]);

  useEffect(load, [load]);

  async function reset() {
    try {
      const result = await adminReset();
      setMessage(`초기화 완료 — 진행 중이던 세션 ${result.aborted_sessions}건 정리`);
      load();
    } catch (e) {
      handleError(e, '초기화에 실패했습니다.');
    }
  }

  async function exportCsv() {
    try {
      await adminExportCsv();
    } catch (e) {
      handleError(e, 'CSV 내보내기에 실패했습니다.');
    }
  }

  function saveToken(e: React.FormEvent) {
    e.preventDefault();
    setAdminToken(token.trim());
    setMessage('');
    load();
  }

  function toggleKiosk() {
    const next = !kiosk;
    localStorage.setItem('mirroting-kiosk', next ? '1' : '0');
    setKiosk(next);
    setMessage(next ? '전시 모드 ON — 리포트 90초 무조작 시 자동 초기화됩니다.' : '전시 모드 OFF');
  }

  return (
    <div className="page admin">
      <header className="admin-header">
        <h1>운영 대시보드</h1>
        <div className="admin-actions">
          <button className="ghost-btn" onClick={toggleKiosk}>
            <Icon name="monitor" size={15} /> 전시 모드 {kiosk ? 'ON' : 'OFF'}
          </button>
          <button className="ghost-btn" onClick={exportCsv}>
            <Icon name="download" size={15} /> CSV 내보내기
          </button>
          <button className="primary-btn" onClick={reset}>
            <Icon name="refresh" size={15} /> 다음 체험자 준비
          </button>
        </div>
      </header>
      {message && <div className="notice">{message}</div>}

      {needToken && (
        <form className="admin-token-form" onSubmit={saveToken}>
          <input
            className="response-input"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="운영 토큰 (X-Admin-Token)"
            autoFocus
          />
          <button className="primary-btn" type="submit">확인</button>
        </form>
      )}

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

      {/* 측정 상태 — 조용한 품질 강등(폴백 발동) 감시. 정렬률·의미 구제율이
          0에 붙어 있으면 Vosk/Ollama가 죽은 것 — 리포트는 나오지만 얇아진다 */}
      {metrics?.observability && metrics.observability.voice_turns > 0 && (
        <section className="metric-grid">
          <div className="metric-card">
            <span className="metric-value">
              {metrics.observability.voice_alignment_rate !== null
                ? `${Math.round((metrics.observability.voice_alignment_rate ?? 0) * 100)}%`
                : '—'}
            </span>
            <span className="metric-label">음성 정렬률 (Vosk — 문장 인용 재료)</span>
          </div>
          <div className="metric-card">
            <span className="metric-value">{metrics.observability.voice_estimated_turns}</span>
            <span className="metric-label">근사 폴백 턴 (마이크 점검 신호)</span>
          </div>
          <div className="metric-card">
            <span className="metric-value">
              {metrics.observability.semantic_rescue_rate !== null
                ? `${Math.round((metrics.observability.semantic_rescue_rate ?? 0) * 100)}%`
                : '—'}
            </span>
            <span className="metric-label">의미 매칭 구제율 (0% 지속 시 Ollama 확인)</span>
          </div>
          <div className="metric-card">
            <span className="metric-value">
              {metrics.observability.iris_active_rate !== null
                ? `${Math.round((metrics.observability.iris_active_rate ?? 0) * 100)}%`
                : '—'}
            </span>
            <span className="metric-label">홍채 추적 가동률</span>
          </div>
          <div className="metric-card">
            <span className="metric-value">
              {metrics.observability.world_3d_rate !== null
                ? `${Math.round((metrics.observability.world_3d_rate ?? 0) * 100)}%`
                : '—'}
            </span>
            <span className="metric-label">3D 자세 가동률</span>
          </div>
          <div className="metric-card">
            <span className="metric-value">{metrics.observability.guard_dropped_frames}</span>
            <span className="metric-label">다인 가드 폐기 프레임 (급증 시 동선 점검)</span>
          </div>
        </section>
      )}
      <p className="section-sub">
        * 기간/시나리오/기기 필터, 익명 ID 추이, CSV 내보내기는 다음 단계에서 확장 예정입니다.
      </p>
    </div>
  );
}
