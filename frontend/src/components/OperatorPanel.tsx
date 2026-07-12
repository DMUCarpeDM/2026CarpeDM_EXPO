/** 운영자 패널 — 미러 모드의 유일한 탈출구.
 *
 * 화면 우상단 모서리를 3초 롱프레스하면 열린다. 관람객이 우연히 열 수 없도록
 * 시각적 표시가 없는 핫존 + 롱프레스 조합을 쓴다. (기획서 §4.6)
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toggleFx, useFxEnabled } from './FrameGlow';
import { enterGlassesMode, exitGlassesMode, useGlassesMode } from '../lib/glassesMode';
import { enterMirrorMode, exitMirrorMode } from '../lib/mirrorMode';
import { useSessionStore } from '../stores/sessionStore';

const HOLD_MS = 3000;

// 측정 샘플링 주기 후보 (§2.5 실기기 튜닝). 200ms=5Hz 기본, 100ms=10Hz는
// 깜빡임·끄덕임 과소집계를 줄이지만 CPU 부하가 오른다 — 전시 PC에서 실측 후 선택.
const SAMPLE_OPTIONS = [100, 150, 200] as const;
const SAMPLE_KEY = 'mirroting-sample-ms';

function currentSampleMs(): number {
  const v = Number(localStorage.getItem(SAMPLE_KEY));
  return Number.isFinite(v) && v >= 100 && v <= 500 ? v : 200;
}

export default function OperatorPanel() {
  const navigate = useNavigate();
  const clearSession = useSessionStore((s) => s.clear);
  const fxEnabled = useFxEnabled();
  const glasses = useGlassesMode();
  const [open, setOpen] = useState(false);
  const [holding, setHolding] = useState(false);
  const [sampleMs, setSampleMs] = useState(currentSampleMs);
  const timerRef = useRef<number | null>(null);

  // 샘플링 주기는 훅 초기화 시점에 읽히므로, 변경 후 새로고침해야 적용된다
  function applySample(ms: number) {
    localStorage.setItem(SAMPLE_KEY, String(ms));
    setSampleMs(ms);
    window.location.reload();
  }

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
            <div className="operator-sample">
              <span className="operator-sample-label">전시 표현</span>
              <div className="operator-sample-btns">
                <button
                  className={`ghost-btn ${!glasses ? 'active' : ''}`}
                  onClick={() => {
                    exitGlassesMode();
                    enterMirrorMode();
                  }}
                >
                  거울
                </button>
                <button
                  className={`ghost-btn ${glasses ? 'active' : ''}`}
                  onClick={() => {
                    enterGlassesMode();
                    exitMirrorMode();
                  }}
                >
                  글래스 HUD
                </button>
              </div>
              <span className="operator-sample-hint">
                같은 세션·같은 측정, 표현 계층만 전환 (즉시 적용)
              </span>
            </div>
            <div className="operator-sample">
              <span className="operator-sample-label">측정 정밀도 (샘플링)</span>
              <div className="operator-sample-btns">
                {SAMPLE_OPTIONS.map((ms) => (
                  <button
                    key={ms}
                    className={`ghost-btn ${sampleMs === ms ? 'active' : ''}`}
                    onClick={() => applySample(ms)}
                  >
                    {Math.round(1000 / ms)}Hz
                  </button>
                ))}
              </div>
              <span className="operator-sample-hint">
                높을수록 깜빡임·끄덕임 정밀 · CPU 부하 ↑ (변경 시 새로고침)
              </span>
            </div>
            <button
              className="ghost-btn"
              onClick={() => {
                exitMirrorMode();
                exitGlassesMode();
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
