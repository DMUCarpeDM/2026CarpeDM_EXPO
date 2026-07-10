/** 깨어나는 거울 — 전시 대기 화면 (기획서 §4.0).
 *
 * 화면 대부분이 순수 검정(=거울). 사람이 다가오면 거울이 깨어나 인사하고
 * 출근 CTA가 떠오른다. 카메라를 못 쓰는 환경에서는 터치로 시작한다.
 * 진입 시 미러 모드가 켜져, 이후 모든 화면이 거울 문법으로 렌더된다.
 */
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { resetVisitorIdentity } from '../../api/client';
import FrameGlow from '../../components/FrameGlow';
import Icon from '../../components/Icon';
import { enterMirrorMode } from '../../lib/mirrorMode';
import { speak, stopSpeaking } from '../../lib/tts';
import { useFaceWake } from '../../lib/useFaceWake';

const GREETING = '거기 계신 분 — 오늘 하루, 신입 개발자로 살아보실래요?';

export default function KioskPage() {
  const navigate = useNavigate();
  const { awake, watching } = useFaceWake(true);
  const greetedRef = useRef(false);

  useEffect(() => {
    enterMirrorMode();
    // 관람객 간 격리 — 대기 화면으로 돌아오면 이전 사람의 익명 키·세션 토큰을 지운다
    resetVisitorIdentity();
  }, []);

  // 깨어날 때 한 번만 인사 — 사람이 떠났다 돌아오면 다시 인사한다
  useEffect(() => {
    if (awake && !greetedRef.current) {
      greetedRef.current = true;
      speak(GREETING, { rate: 1.0, pitch: 1.05 });
    }
    if (!awake) greetedRef.current = false;
    return stopSpeaking;
  }, [awake]);

  function enterFullscreen(e: React.MouseEvent) {
    e.stopPropagation();
    void document.documentElement.requestFullscreen?.();
  }

  function start() {
    stopSpeaking();
    navigate('/');
  }

  return (
    <div className={`mirror-idle ${awake ? 'awake' : ''}`} onClick={start}>
      <FrameGlow state={awake ? 'mine' : 'off'} />
      <button className="kiosk-fullscreen" onClick={enterFullscreen} title="전체화면">
        <Icon name="expand" size={18} />
      </button>

      {/* 잠든 거울 — 낮은 휘도로 숨쉬는 한 줄 */}
      <div className="mirror-idle-sleep">
        <p className="mirror-idle-brand">4-Fit 미러팅</p>
        <p className="mirror-idle-whisper">{watching ? '다가와 보세요' : '화면을 터치해 보세요'}</p>
      </div>

      {/* 깨어난 거울 — 인사와 출근 CTA */}
      <div className="mirror-idle-awake">
        <p className="mirror-idle-time">㈜클라우드밋 · 오늘</p>
        <h1 className="mirror-idle-greeting">
          오늘 하루,
          <br />
          <span className="accent">신입 개발자</span>로
          <br />
          살아보실래요?
        </h1>
        <p className="mirror-idle-sub">
          AI 상사·동료와의 하루 — 응답 · 말하기 · 시선 · 자세를 코칭해드려요
        </p>
        <button className="primary-btn mirror-start-btn" onClick={start}>
          출근하기
        </button>
        <p className="mirror-idle-note">약 5분 · 영상은 이 거울 밖으로 나가지 않습니다</p>
      </div>
    </div>
  );
}
