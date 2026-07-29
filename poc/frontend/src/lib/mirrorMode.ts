/** 미러 모드 상태 — "하나의 앱, 두 개의 문법"의 스위치.
 *
 * /kiosk 진입 시 켜지고 localStorage로 유지된다(새로고침·방치 복귀에도 지속).
 * 켜지면 <html>에 .mirror-mode 클래스가 붙어 표현 계층 전체가 거울 문법으로 바뀐다.
 * 해제는 운영자 패널(모서리 롱프레스)에서만 — 관람객 동선에는 노출하지 않는다.
 */
import { useSyncExternalStore } from 'react';

const KEY = 'mirror-ting-kiosk'; // 기존 전시 플래그를 그대로 확장 (하위 호환)

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

function apply(on: boolean) {
  document.documentElement.classList.toggle('mirror-mode', on);
}

export function isMirrorMode(): boolean {
  return localStorage.getItem(KEY) === '1';
}

export function enterMirrorMode() {
  localStorage.setItem(KEY, '1');
  apply(true);
  emit();
}

export function exitMirrorMode() {
  localStorage.setItem(KEY, '0');
  apply(false);
  emit();
}

/** 앱 부팅 시 1회 — 저장된 모드를 <html> 클래스에 복원 */
export function restoreMirrorMode() {
  apply(isMirrorMode());
}

export function useMirrorMode(): boolean {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    isMirrorMode,
  );
}
