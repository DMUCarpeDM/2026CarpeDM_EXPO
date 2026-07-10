/** 전시(미러) 모드 전 화면 무조작 복귀 (S-RKGLXP 확장).
 *
 * 기존에는 리포트 화면에만 90초 복귀가 있어 온보딩·브리핑·분석 중·에러 화면에서
 * 관람객이 떠나면 키오스크가 그 화면에 영구 정지했다. 이 훅을 앱 셸에 걸어
 * 대기 화면(/kiosk)을 제외한 모든 화면에서 복귀를 보장한다.
 *
 * 음성 역할극은 화면을 만지지 않고도 한 턴이 90초를 넘길 수 있으므로, DOM 입력
 * 외에 TTS 재생·음성 인식 결과도 pingKioskActivity()로 활동에 포함한다.
 */
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isMirrorMode, useMirrorMode } from './mirrorMode';

export const KIOSK_IDLE_MS = 90_000;
const ACTIVITY_EVENT = 'mirroting-activity';

/** DOM 입력이 아닌 활동(TTS 재생, 음성 인식 결과)을 무조작 타이머에 반영한다 */
export function pingKioskActivity(): void {
  window.dispatchEvent(new Event(ACTIVITY_EVENT));
}

export function useKioskIdleReturn(): void {
  const location = useLocation();
  const navigate = useNavigate();
  const mirror = useMirrorMode();
  const onKiosk = location.pathname === '/kiosk';

  useEffect(() => {
    if (!mirror || onKiosk) return; // 대기 화면 자체는 복귀 대상이 아니다
    let idle: ReturnType<typeof setTimeout> | null = null;
    const reset = () => {
      if (idle) clearTimeout(idle);
      idle = setTimeout(() => {
        if (isMirrorMode()) navigate('/kiosk'); // 발화 시점 재확인 — 운영자 해제 존중
      }, KIOSK_IDLE_MS);
    };
    reset();
    const events = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart', ACTIVITY_EVENT];
    // scroll은 버블링하지 않으므로 내부 스크롤 영역까지 캡처 단계로 잡는다
    events.forEach((e) => window.addEventListener(e, reset, true));
    return () => {
      if (idle) clearTimeout(idle);
      events.forEach((e) => window.removeEventListener(e, reset, true));
    };
  }, [mirror, onKiosk, navigate]);
}
