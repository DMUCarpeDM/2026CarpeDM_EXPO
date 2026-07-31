import { useEffect, useRef } from "react";
import { getNfcTap } from "./pocApi";
import { advanceTapCursor } from "./nfc";

export const NFC_POLL_INTERVAL_MS = 1000;

/** NFC 태그 폴링 훅 (S-B2B-104/105) — enabled일 때만 1초 간격으로 리더 브리지를 폴링한다.
 *
 *  - 활성화 직후 첫 폴링은 커서만 전진시키고 발화하지 않는다: 화면을 열기 전에 남아 있던
 *    과거 태그(브리지의 마지막 이벤트)로 유령 발급·유령 세션이 시작되는 걸 막는다.
 *  - 요청이 겹치지 않게 in-flight 가드를 두고, 비활성·언마운트 시 인터벌을 정리한다(누수 방지).
 *  - 네트워크·서버 오류는 조용히 삼킨다 — 다음 폴링에서 자연 회복된다.
 */
export function useNfcTap({ reader, enabled, onTap }) {
  const sinceRef = useRef(0);
  const onTapRef = useRef(onTap);
  onTapRef.current = onTap;

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    let inFlight = false;
    let primed = false;
    const poll = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await getNfcTap(reader, sinceRef.current);
        if (cancelled) return;
        const next = advanceTapCursor(sinceRef.current, response);
        sinceRef.current = next.since;
        // 첫 응답은 발화 없이 커서만 소비 — 이후 도착한 태그부터 실제 이벤트로 다룬다.
        if (next.tap && primed) onTapRef.current?.(next.tap);
      } catch {
        // 서버 미기동·일시 오류 — 다음 폴링에서 회복
      } finally {
        primed = true;
        inFlight = false;
      }
    };
    poll();
    const timer = window.setInterval(poll, NFC_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [reader, enabled]);
}
