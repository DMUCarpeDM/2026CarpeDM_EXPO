export const ENTRY_LOOKUP_TIMEOUT_MS = 3_000;

export const CHROMELESS_VIEWS = new Set(["service"]);

export const LEGACY_REPORT_VIEWS = new Set(["feedback", "compare", "share"]);

export const SERVICE_ENTRY_FLOW = [
  { id: "home", label: "메인" },
  { id: "service", label: "서비스 모드 선택" },
  { id: "role", label: "직무 선택" },
  { id: "scenario", label: "시나리오 선택" },
  { id: "difficulty", label: "난이도 선택" },
  { id: "preview", label: "시나리오 미리보기" },
  { id: "practice", label: "AI와 연습하기" },
  { id: "result", label: "결과 보고서" },
];

const DIRECT_DEMO_VIEWS = new Set(["result", ...LEGACY_REPORT_VIEWS]);

export function isKioskIssue(search = window.location.search) {
  return new URLSearchParams(search).get("kiosk") === "issue";
}

export function demoDestination(search = window.location.search) {
  const demo = new URLSearchParams(search).get("demo");
  if (demo === "practice") return "practice";
  return DIRECT_DEMO_VIEWS.has(demo) ? "result" : null;
}

export function savedSessionDestination(status) {
  if (status === "in_progress") return "practice";
  if (status === "analyzing" || status === "completed") return "result";
  return null;
}

export function normalizeDestination(target, selectedServiceModeId) {
  if (LEGACY_REPORT_VIEWS.has(target)) return "result";
  return target === "home" && !selectedServiceModeId ? "service" : target;
}

export function isKnownView(view) {
  return LEGACY_REPORT_VIEWS.has(view) || SERVICE_ENTRY_FLOW.some((item) => item.id === view);
}

export function isChromelessView(view) {
  return CHROMELESS_VIEWS.has(view);
}
