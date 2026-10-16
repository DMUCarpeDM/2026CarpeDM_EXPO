// Local development diagnostics contain device state and event timings only.
export function audioDiagnostic(event, details = {}) {
  if (!import.meta.hot || window.location.port !== "5173") return;
  import.meta.hot.send("mirror:audio-diagnostic", { event, at: Date.now(), ...details });
}
