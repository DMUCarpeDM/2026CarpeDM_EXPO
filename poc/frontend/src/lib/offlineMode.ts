/** 오프라인 모드 — 전시장 인터넷이 불안정할 때의 "완전 로컬 동작 보장" 스위치.
 *
 * 켜지면:
 *   STT  브라우저 Web Speech(Chrome→Google, 인터넷 필요)를 건너뛰고, 항상
 *        오디오를 녹음해 서버 STT(faster-whisper, 완전 로컬)로 인식한다.
 *   TTS  네트워크 음성(예: Google 한국어) 대신 OS 내장(localService) 음성만
 *        쓰도록 강제한다 (lib/tts.ts). 로컬 음성이 없으면 운영자에게 경고.
 *
 * 운영자 패널(AdminPage)에서만 토글하며 localStorage로 유지된다(새로고침 지속).
 * mirrorMode.ts와 같은 useSyncExternalStore 패턴 — 미러/웹 어디서든 즉시 반영.
 */
import { useSyncExternalStore } from 'react';

const KEY = 'mirror-ting-offline-mode';

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

export function isOfflineMode(): boolean {
  if (typeof localStorage === 'undefined') return false; // 테스트(node) 환경
  return localStorage.getItem(KEY) === '1';
}

export function setOfflineMode(on: boolean): void {
  if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, on ? '1' : '0');
  emit();
}

export function useOfflineMode(): boolean {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    isOfflineMode,
    () => false, // 서버 스냅샷(SSR/테스트) — 오프라인 모드는 클라이언트 전용
  );
}
