const SERVICE_MODE_IDS = new Set(["interview", "training", "workplace"]);

export function resolveDeploymentServiceMode(search = "", configuredMode = "") {
  const requestedMode = new URLSearchParams(search).get("service") || "";
  if (SERVICE_MODE_IDS.has(requestedMode)) return requestedMode;
  return SERVICE_MODE_IDS.has(configuredMode) ? configuredMode : "";
}

export function currentDeploymentServiceMode() {
  return resolveDeploymentServiceMode(
    globalThis.location?.search || "",
    import.meta.env?.VITE_SERVICE_MODE || "",
  );
}
