/** 운영자 패널 — 미러 모드의 유일한 탈출구.
 *
 * 화면 우상단 모서리를 3초 롱프레스하면 열린다. 관람객이 우연히 열 수 없도록
 * 시각적 표시가 없는 핫존 + 롱프레스 조합을 쓴다. (기획서 §4.6)
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toggleFx, useFxEnabled } from './FrameGlow';
import { exitMirrorMode } from '../lib/mirrorMode';
import { useSessionStore } from '../stores/sessionStore';

const HOLD_MS = 3000;

export default function OperatorPanel() {
  const navigate = useNavigate();
  const clearSession = useSessionStore((s) => s.clear);
  const fxEnabled = useFxEnabled();
  const [open, setOpen] = useState(false);
  const [holding, setHolding] = useState(false);
  const timerRef = useRef<number | null>(null);

  function startHold() {
    setHolding(true);
    timerRef.current = window.setTimeout(() => {
      setHolding(false);
      setOpen(true);
    }, HOLD_MS);
  }

  function cancelHold() {
    setHolding(false);
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }

  useEffect(() => () => cancelHold(), []);

  return (
    <>
      <div
        className={`operator-hotzone ${holding ? 'holding' : ''}`}
        onPointerDown={startHold}
        onPointerUp={cancelHold}
        onPointerLeave={cancelHold}
        aria-hidden
      />
      {open && (
        <div className="operator-overlay" onClick={() => setOpen(false)}>
          <div className="operator-panel" onClick={(e) => e.stopPropagation()}>
            <h2>운영자 패널</h2>
            <button
              className="primary-btn"
              onClick={() => {
                clearSession();
                setOpen(false);
                navigate('/kiosk');
              }}
            >
              세션 초기화 (다음 체험자)
            </button>
            <button className="ghost-btn" onClick={toggleFx}>
              연출 효과 {fxEnabled ? '끄기 (저사양 모드)' : '켜기'}
            </button>
            <button
              className="ghost-btn"
              onClick={() => {
                exitMirrorMode();
                clearSession();
                setOpen(false);
                navigate('/');
              }}
            >
              웹 모드로 복귀
            </button>
            <button className="ghost-btn" onClick={() => setOpen(false)}>
              닫기
            </button>
          </div>
        </div>
      )}
    </>
  );
}
