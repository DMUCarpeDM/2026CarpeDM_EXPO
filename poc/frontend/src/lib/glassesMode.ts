/** 스마트 글래스(HUD) 모드 — "하나의 앱, 세 개의 문법"의 세 번째 스위치.
 *
 * 미러 모드가 "거울 앞의 나"라면, 글래스 모드는 "상대를 마주한 나의 1인칭 시야"다.
 * 같은 세션 로직·같은 비언어 측정을 쓰되, 표현 계층만 헤드업 디스플레이로 바꾼다:
 * 사후 리포트가 아니라 대화 중 시야 가장자리에 뜨는 실시간 코칭 넛지가 주인공이다.
 *
 * 실제 스마트 글래스 카메라는 바깥(상대)을 향하므로 착용자 자신의 시선·자세는
 * 잡을 수 없다 — 전시에서는 착용자를 향한 외부 카메라(기존 웹캠)가 라이브 신호를
 * 공급하고, 이 화면이 "글래스로 보면 이렇게 코칭이 뜬다"를 재현한다.
 *
 * mirrorMode.ts와 동일한 토글 패턴(localStorage + <html> 클래스 + 외부 스토어 훅).
 * 해제는 운영자 패널에서만 — 관람객 동선에는 노출하지 않는다.
 */
import { useSyncExternalStore } from 'react';

const KEY = 'mirroting-glasses';

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

function apply(on: boolean) {
  document.documentElement.classList.toggle('glasses-mode', on);
}

export function isGlassesMode(): boolean {
  return localStorage.getItem(KEY) === '1';
}

export function enterGlassesMode() {
  localStorage.setItem(KEY, '1');
  apply(true);
  emit();
}

export function exitGlassesMode() {
  localStorage.setItem(KEY, '0');
  apply(false);
  emit();
}

/** 앱 부팅 시 1회 — 저장된 모드를 <html> 클래스에 복원 */
export function restoreGlassesMode() {
  apply(isGlassesMode());
}

export function useGlassesMode(): boolean {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    isGlassesMode,
  );
}
