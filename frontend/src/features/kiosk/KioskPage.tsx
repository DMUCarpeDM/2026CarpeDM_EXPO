/** 스마트 미러 대기(어트랙트) 화면 — 전시 부스용.
 * 진입 시 전시 모드가 자동으로 켜져, 리포트 방치 시 이 화면으로 복귀한다.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function KioskPage() {
  const navigate = useNavigate();

  useEffect(() => {
    localStorage.setItem('mirroting-kiosk', '1');
  }, []);

  function enterFullscreen(e: React.MouseEvent) {
    e.stopPropagation();
    void document.documentElement.requestFullscreen?.();
  }

  return (
    <div className="kiosk" onClick={() => navigate('/')}>
      <button className="kiosk-fullscreen" onClick={enterFullscreen} title="전체화면">⛶</button>
      <div className="kiosk-center">
        <p className="hero-badge">2026 동양미래EXPO · CarpeDM</p>
        <h1 className="kiosk-title">
          4-Fit <span className="accent">미러팅</span>
        </h1>
        <p className="kiosk-sub">
          AI 상사·동료와 직장생활 역할극을 하고
          <br />
          응답 · 말하기 · 시선 · 자세 코칭을 받아보세요
        </p>
        <div className="kiosk-fits">
          <span>💬 Response</span>
          <span>🎙 Voice</span>
          <span>👀 Eye</span>
          <span>🧍 Posture</span>
        </div>
        <div className="kiosk-cta">화면을 터치해 출근하기</div>
        <p className="kiosk-time">체험 시간 약 5분 · 영상은 저장되지 않습니다</p>
      </div>
    </div>
  );
}
