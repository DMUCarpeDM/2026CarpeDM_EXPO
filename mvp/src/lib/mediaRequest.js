// Device drivers can leave these promises pending even after permission is granted.
export async function enumerateCaptureDevices(devices, timeoutMs = 1500) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => devices.enumerateDevices()).catch(() => []),
      new Promise(resolve => { timer = setTimeout(() => resolve([]), timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
}

export async function requestCapture(devices, constraints, timeoutMs = 12000) {
  let timer, expired = false;
  const pending = Promise.resolve().then(() => devices.getUserMedia(constraints));
  // A timed-out request may still resolve later; never leave its camera running.
  pending.then(stream => { if (expired) stream.getTracks().forEach(track => track.stop()); }, () => {});
  try {
    return await Promise.race([pending, new Promise((_, reject) => {
      timer = setTimeout(() => {
        expired = true;
        reject(new DOMException("장치 연결 시간이 초과됐어요. 카메라·마이크 연결을 확인한 뒤 다시 시도해 주세요.", "TimeoutError"));
      }, timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}
