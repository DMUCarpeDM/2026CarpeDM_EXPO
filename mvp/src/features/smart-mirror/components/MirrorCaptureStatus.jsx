export function MirrorCaptureStatus({ capture, waveRef }) {
  const recording = Boolean(capture?.recording);
  const audioLabel = !capture ? "미리보기 · 녹음 안 함" : capture.audioError ? "녹음 오류" : recording ? "음성 녹음 중" : "녹음 대기";
  const cameraLabel = !capture ? "카메라 꺼짐" : capture.cameraError ? "카메라 분석 오류" : capture.cameraReady ? "카메라 분석 중" : capture.cameraStarting ? "카메라 준비 중" : "카메라 꺼짐";
  return <div className="overview-summary-card mirror-capture-status" role="status" aria-live="polite" aria-atomic="true">
    <span className="mirror-capture-audio" data-active={recording}>
      <i className="mirror-capture-dot" aria-hidden="true" />
      <span>{audioLabel}</span>
      <span className="mirror-capture-wave" ref={waveRef} aria-hidden="true" data-active={recording}>
        {Array.from({ length: 7 }, (_, index) => <i key={index} />)}
      </span>
    </span>
    <span className="mirror-capture-camera" data-active={Boolean(capture?.cameraReady)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3" y="6" width="12" height="12" rx="3" /><path d="m15 10 6-3v10l-6-3" /></svg>
      <span>{cameraLabel}</span>
    </span>
  </div>;
}
