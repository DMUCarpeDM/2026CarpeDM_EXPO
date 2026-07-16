const LOCAL_API_BASE = "/api";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const API_BASE = resolveApiBase(globalThis.__MIRRORTING_API_BASE__ || import.meta.env?.VITE_API_URL);
const CLIENT_KEY = "mirrorting-client-key";
const ACTIVE_SESSION = "mirrorting-active-session";

export class PocApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "PocApiError";
    this.status = status;
  }
}

export function getClientKey() {
  let clientKey = localStorage.getItem(CLIENT_KEY);
  if (!clientKey) {
    clientKey = crypto.randomUUID();
    localStorage.setItem(CLIENT_KEY, clientKey);
  }
  return clientKey;
}

export function resolveApiBase(candidate) {
  if (!candidate) return LOCAL_API_BASE;
  if (candidate.startsWith("/")) return candidate;
  try {
    const url = new URL(candidate);
    return LOOPBACK_HOSTS.has(url.hostname) ? candidate : LOCAL_API_BASE;
  } catch {
    return LOCAL_API_BASE;
  }
}

async function request(path, { token, ...options } = {}) {
  const isFormData = options.body instanceof FormData;
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { "X-Session-Token": token } : {}),
      ...options.headers,
    },
    ...options,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new PocApiError(data?.detail || "서버를 실행하면 연습을 이어갈 수 있어요.", response.status);
  }
  return data;
}

export function getScenarios() {
  return request("/scenarios");
}

export function getHealth() {
  return request("/health");
}

export function createSession({ difficulty, mode, scenarioSlug, consent }) {
  return request("/sessions", {
    method: "POST",
    body: JSON.stringify({
      difficulty,
      mode,
      scenario_slug: scenarioSlug,
      client_key: getClientKey(),
      consent: { agreed: consent, storage_policy: "none" },
    }),
  });
}

export async function submitResponse(session, turnId, input) {
  // PoC 백엔드 계약은 2콜이다 — ① 오디오 업로드(/audio, 텍스트가 비면 서버 STT가 채움)
  // ② JSON 응답 제출(/response). 멀티파트 1콜로 보내면 422로 거부된다.
  if (input.audio && input.audio.size > 0) {
    const form = new FormData();
    form.set("file", input.audio, `turn-${turnId}.webm`);
    try {
      await request(`/sessions/${session.id}/turns/${turnId}/audio`, {
        method: "POST",
        token: session.access_token,
        body: form,
      });
    } catch (error) {
      // 텍스트가 있으면 오디오는 보조 신호 — 업로드 실패로 답변까지 막지 않는다.
      if (!input.text.trim()) throw error;
    }
  }
  return request(`/sessions/${session.id}/turns/${turnId}/response`, {
    method: "POST",
    token: session.access_token,
    body: JSON.stringify({
      text: input.text,
      stt_source: "webspeech",
      duration_ms: input.durationMs || 0,
      nonverbal: input.nonverbalMetrics || null,
    }),
  });
}

export function finishSession(session) {
  return request(`/sessions/${session.id}/finish`, { method: "POST", token: session.access_token });
}

export function getSession(session) {
  return request(`/sessions/${session.id}`, { token: session.access_token });
}

export function loadActiveSession() {
  try { return JSON.parse(localStorage.getItem(ACTIVE_SESSION) || "null"); }
  catch { return null; }
}

export function saveActiveSession(session) {
  localStorage.setItem(ACTIVE_SESSION, JSON.stringify({ id: session.id, access_token: session.access_token }));
}

export function getProgress(session) {
  return request(`/sessions/${session.id}/progress`, { token: session.access_token });
}

export function getReport(session) {
  return request(`/sessions/${session.id}/report`, { token: session.access_token });
}

export function getHistory() {
  return request(`/history?client_key=${encodeURIComponent(getClientKey())}`);
}

export function issueCode() {
  return request("/codes", { method: "POST", body: JSON.stringify({ client_key: getClientKey() }) });
}
