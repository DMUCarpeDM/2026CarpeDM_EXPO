/** 프레임 글로우 — 미러 모드의 상태 언어 (기획서 §5).
 *
 * 화면 가장자리를 감싸는 빛 하나가 시스템의 표정을 담당한다:
 *   idle     대기 — 느린 숨 (8초 주기)
 *   ai       상대가 말하는 중 — 차분한 저휘도
 *   mine     내가 말할 차례 — 밝은 호흡 (3초 주기)
 *   pressure 압박 질문 — 색온도가 차갑게
 *   complete 완료·칭찬 — 따뜻하게
 *   off      숨김
 *
 * 위치 이동 없이 휘도(opacity)만 애니메이션 — 하프미러에서 움직이는 밝은
 * 물체는 반사와 겹쳐 어지럽다. prefers-reduced-motion과 운영자 토글을 존중.
 */
import { useSyncExternalStore } from 'react';

export type GlowState = 'off' | 'idle' | 'ai' | 'mine' | 'pressure' | 'complete';

// 운영자 이펙트 토글 (저사양 전시 PC 대비)
const FX_KEY = 'mirror-ting-fx';
const fxListeners = new Set<() => void>();

export function isFxEnabled(): boolean {
  return localStorage.getItem(FX_KEY) !== '0';
}

export function toggleFx(): boolean {
  const next = !isFxEnabled();
  localStorage.setItem(FX_KEY, next ? '1' : '0');
  fxListeners.forEach((fn) => fn());
  return next;
}

export function useFxEnabled(): boolean {
  return useSyncExternalStore(
    (fn) => {
      fxListeners.add(fn);
      return () => fxListeners.delete(fn);
    },
    isFxEnabled,
  );
}

export default function FrameGlow({ state }: { state: GlowState }) {
  const enabled = useFxEnabled();
  if (!enabled || state === 'off') return null;
  return <div className={`frame-glow ${state}`} aria-hidden />;
}
