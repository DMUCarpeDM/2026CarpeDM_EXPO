// 턴 변경·일시정지 때 진행 중인 요청과 늦게 도착한 팁을 함께 폐기한다.
export function startLiveCoaching({ observe, sample, onTip, onError = () => {},
  intervalMs = 5000, cooldownMs = 20000, now = () => Date.now(),
  setIntervalFn = setInterval, clearIntervalFn = clearInterval,
  memory = { lastShown: -Infinity, shown: new Set() } }) {
  let stopped = false;
  let controller = null;

  const tick = async () => {
    if (stopped || controller) return;
    const input = sample();
    if (!input || input.durationMs < 3000) return;
    controller = new AbortController();
    const timeout = setTimeout(() => controller?.abort(), 4000);
    try {
      const result = await observe(input, controller.signal);
      const tip = result.tip;
      if (!stopped && tip && !memory.shown.has(tip.id) && now() - memory.lastShown >= cooldownMs) {
        memory.shown.add(tip.id);
        memory.lastShown = now();
        onTip(tip);
      }
    } catch (error) {
      if (!stopped && error?.name !== "AbortError") onError(error);
    } finally {
      clearTimeout(timeout);
      controller = null;
    }
  };
  const timer = setIntervalFn(tick, intervalMs);
  return () => { stopped = true; clearIntervalFn(timer); controller?.abort(); };
}
