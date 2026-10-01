const SERVICE_MODE_IDS = new Set(["interview", "training", "workplace"]);

export function resolveDeploymentServiceMode(search = "") {
  const requestedMode = new URLSearchParams(search).get("service") || "";
  if (SERVICE_MODE_IDS.has(requestedMode)) return requestedMode;
  return "";
}

export function currentDeploymentServiceMode() {
  return resolveDeploymentServiceMode(
    globalThis.location?.search || "",
  );
}
