import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useFaceTracking } from '../../../../lib/useFaceTracking.js';
import { requestCapture } from '../../../../lib/mediaRequest.js';

function TrackingCheck() {
  const [stream, setStream] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const videoRef = useRef(null), canvasRef = useRef(null), streamRef = useRef(null), epoch = useRef(0);
  const tracking = useFaceTracking(stream, videoRef, canvasRef, true);
  const stop = () => {
    epoch.current += 1;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    setStream(null);
    setConnecting(false);
  };
  const connect = async () => {
    stop();
    const attempt = epoch.current;
    setConnecting(true); setError('');
    try {
      const next = await requestCapture(navigator.mediaDevices, {video: {
        width: {ideal: 1920}, height: {ideal: 1080}, frameRate: {ideal: 30, max: 30},
      }, audio: false});
      if (attempt !== epoch.current) { next.getTracks().forEach(track => track.stop()); return; }
      streamRef.current = next;
      setStream(next);
    } catch (problem) {
      if (attempt === epoch.current) setError(problem.name === 'NotAllowedError'
        ? '카메라 권한을 허용한 뒤 다시 시작해 주세요.' : '카메라 연결을 확인한 뒤 다시 시작해 주세요.');
    } finally { if (attempt === epoch.current) setConnecting(false); }
  };
  useEffect(() => {
    const video = videoRef.current;
    video.srcObject = stream;
    if (stream) void video.play().catch(() => setError('카메라 시작을 다시 눌러 주세요.'));
    return () => { video.srcObject = null; };
  }, [stream]);
  useEffect(() => () => {
    epoch.current += 1;
    streamRef.current?.getTracks().forEach(track => track.stop());
  }, []);
  return <>
    <div className="camera"><video ref={videoRef} autoPlay muted playsInline aria-label="추적 테스트 카메라" /><canvas ref={canvasRef} aria-hidden="true" /></div>
    <section className="controls">
      <h1>스마트미러 추적 확인</h1>
      <p>카메라 중앙에서 어깨까지 보이게 1초간 서 주세요. 얼굴 마커를 확인하며 천천히 뒤로 이동해 보세요.</p>
      <p className="status" role="status">추적: {tracking.status} · 시연자: {tracking.tracking ? '연결됨' : '대기'} · 자세: {tracking.poseTracked ? '검출됨' : '대기'} · 표정 모델: {tracking.expressionStatus} · 처리: {tracking.inferMs}ms</p>
      <p>시뮬레이션과 같은 추적 훅·시연자 선택·원거리 얼굴 검출·마커를 사용합니다. 영상은 저장하거나 서버로 보내지 않습니다.</p>
      <button onClick={connect} disabled={connecting}>{connecting ? '카메라 연결 중…' : stream ? '카메라 다시 시작' : '카메라 시작'}</button>
      <button onClick={stop} disabled={!stream && !connecting}>중지</button>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  </>;
}
createRoot(document.getElementById('root')).render(<TrackingCheck />);
