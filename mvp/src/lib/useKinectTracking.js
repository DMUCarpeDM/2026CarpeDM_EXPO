/** Azure Kinect 뎁스 자세 서비스(:8002) 실시간 연동 훅 (S6 통합).
 *
 * 별도 프로세스인 키넥트 서비스의 WebSocket(/ws/live, 30Hz)을 구독해
 * kinectMetrics.js 누적기에 프레임을 넣는다. 서비스 미기동·장치 미연결이면
 * 백오프 재접속을 반복하며 status="off"로 조용히 폴백한다 — 전시 경로는
 * 키넥트 없이도 기존 MediaPipe만으로 완주한다 (docs/kinect/04 §2.5).
 *
 * 개인 기준 캘리브레이션은 상황 브리핑 동안 모은다 (beginCalibration/
 * endCalibration — PracticePage가 브리핑 열림/닫힘에 맞춰 호출). 규칙은
 * 브라우저 MediaPipe 경로와 동일: 중앙값 · 최소 표본 4 · max(0, 현재-기준).
 *
 * 반환 live: { status, gate, mode, fps, distCm, tiltDeg, yawDeg, calibrating,
 *              calibrated, joints, bodies }
 *   + collectTurnStats(): 턴 집계를 NonverbalIn.kinect 페이로드로 회수·리셋
 *   + beginCalibration()/endCalibration()
 * status: off(미연결·재시도 중) | live(프레임 수신)
 */
import { useEffect, useRef, useState } from "react";
import {
  accumulateKinectFrame,
  finalizeKinectCalib,
  finalizeKinectTurn,
  makeKinectAcc,
  makeKinectCalib,
} from "./kinectMetrics";

const LIVE_PUSH_MS = 300; // 얼굴 훅과 같은 UI 갱신 주기
const RETRY_BASE_MS = 1500;
const RETRY_MAX_MS = 10000;
// 개발(5173 vite)·전시 모두 같은 PC의 8002 — 페이지 호스트를 따라간다
const wsUrl = () => `ws://${window.location.hostname || "127.0.0.1"}:8002/ws/live`;

const IDLE = { status: "off", gate: null, mode: "", fps: 0, distCm: null, tiltDeg: null, yawDeg: null, calibrating: false, calibrated: false, joints: null, bodies: 0 };

export function useKinectTracking(enabled) {
  const [live, setLive] = useState(IDLE);
  const liveRef = useRef(live);
  const accRef = useRef(makeKinectAcc());
  const baseRef = useRef(null);
  const calibRef = useRef(null); // makeKinectCalib() 수집 중일 때만 존재
  const modeRef = useRef("");

  const api = useRef({
    beginCalibration: () => { calibRef.current = makeKinectCalib(); },
    endCalibration: () => {
      const calib = calibRef.current;
      calibRef.current = null;
      if (!calib) return;
      const base = finalizeKinectCalib(calib);
      // 어느 축도 성립하지 않으면 기준 없음(절대 판정) 유지 — 브라우저와 동일
      baseRef.current = (base.tilt !== null || base.yaw !== null || base.pitch !== null) ? base : null;
    },
    collectTurnStats: () => {
      const acc = accRef.current;
      accRef.current = makeKinectAcc();
      return finalizeKinectTurn(acc, { calibrated: baseRef.current !== null, mode: modeRef.current });
    },
  }).current;

  useEffect(() => {
    if (!enabled) { setLive(IDLE); return undefined; }
    let socket = null;
    let closed = false;
    let retryTimer = 0;
    let retryMs = RETRY_BASE_MS;
    let lastSeq = 0;
    let lastPush = 0;

    const push = (next) => {
      const now = performance.now();
      if (now - lastPush < LIVE_PUSH_MS) return;
      const prev = liveRef.current;
      // joints는 매번 새 배열이라 얕은 비교에서 제외 — 나머지가 같으면 스킵
      const changed = next.status !== prev.status || next.gate !== prev.gate
        || next.calibrating !== prev.calibrating || next.calibrated !== prev.calibrated
        || next.tiltDeg !== prev.tiltDeg || next.yawDeg !== prev.yawDeg
        || next.distCm !== prev.distCm || Math.abs(next.fps - prev.fps) > 2
        || Boolean(next.joints) !== Boolean(prev.joints);
      if (!changed && next.joints === null) return;
      lastPush = now;
      liveRef.current = next;
      setLive(next);
    };

    const connect = () => {
      if (closed) return;
      try {
        socket = new WebSocket(wsUrl());
      } catch {
        retryTimer = window.setTimeout(connect, retryMs);
        retryMs = Math.min(retryMs * 1.5, RETRY_MAX_MS);
        return;
      }
      socket.onopen = () => { retryMs = RETRY_BASE_MS; };
      socket.onmessage = (event) => {
        let msg = null;
        try { msg = JSON.parse(event.data); } catch { return; }
        modeRef.current = msg.mode || modeRef.current;
        const frame = msg.frame;
        const fresh = Boolean(frame && frame.seq && frame.seq !== lastSeq);
        if (fresh) {
          lastSeq = frame.seq;
          const now = performance.now();
          if (calibRef.current && frame.gate === "ok" && frame.metrics) {
            // 캘리브레이션 창: 기준의 재료는 원시값 — |기울기|·부호 있는 회전/고개·거리
            const m = frame.metrics;
            if (m.shoulder_tilt_deg !== null && m.shoulder_tilt_deg !== undefined) calibRef.current.tilt.push(Math.abs(m.shoulder_tilt_deg));
            if (m.torso_yaw_deg !== null && m.torso_yaw_deg !== undefined) calibRef.current.yaw.push(m.torso_yaw_deg);
            if (m.head_pitch_deg !== null && m.head_pitch_deg !== undefined) calibRef.current.pitch.push(m.head_pitch_deg);
            if (m.dist_cm !== null && m.dist_cm !== undefined) calibRef.current.dist.push(m.dist_cm);
          } else {
            accumulateKinectFrame(accRef.current, frame, baseRef.current, now);
          }
        }
        const m = frame?.metrics || {};
        push({
          status: msg.status === "live" && frame ? "live" : "off",
          gate: frame?.gate ?? null,
          mode: modeRef.current,
          fps: frame?.fps || 0,
          distCm: m.dist_cm ?? null,
          tiltDeg: m.shoulder_tilt_deg ?? null,
          yawDeg: m.torso_yaw_deg ?? null,
          calibrating: Boolean(calibRef.current),
          calibrated: baseRef.current !== null,
          joints: fresh && frame?.gate === "ok" ? frame.joints : (frame?.gate === "ok" ? liveRef.current.joints : null),
          bodies: frame?.bodies || 0,
        });
      };
      const scheduleRetry = () => {
        if (closed) return;
        socket = null;
        liveRef.current = IDLE;
        setLive(IDLE);
        retryTimer = window.setTimeout(connect, retryMs);
        retryMs = Math.min(retryMs * 1.5, RETRY_MAX_MS);
      };
      socket.onclose = scheduleRetry;
      socket.onerror = () => { try { socket?.close(); } catch { /* 이미 닫힘 */ } };
    };
    connect();

    return () => {
      closed = true;
      window.clearTimeout(retryTimer);
      try { socket?.close(); } catch { /* 이미 닫힘 */ }
      liveRef.current = IDLE;
    };
  }, [enabled]);

  return { ...live, ...api };
}
