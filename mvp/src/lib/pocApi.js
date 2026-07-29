const LOCAL_API_BASE = "/api";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const API_BASE = resolveApiBase(globalThis.__MIRROR_TING_API_BASE__ || import.meta.env?.VITE_API_URL);
const CLIENT_KEY = "mirror-ting-client-key";
const ACTIVE_SESSION = "mirror-ting-active-session";

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

export function createSession({ difficulty, mode, scenarioSlug, selectedEpisodeId, consent }) {
  return request("/sessions", {
    method: "POST",
    body: JSON.stringify({
      difficulty,
      mode,
      scenario_slug: scenarioSlug,
      ...(selectedEpisodeId ? { selected_episode_id: selectedEpisodeId } : {}),
      client_key: getClientKey(),
      consent: { agreed: consent, storage_policy: "none" },
    }),
  });
}

// poc 백엔드 계약: 오디오는 /audio(멀티파트 `file`), 답변 본문은 /response(JSON).
// 한 멀티파트에 섞으면 422/500이 난다.
//
// 순서가 중요하다: 텍스트가 있으면 /response를 **먼저** 보낸다. 오디오를 먼저 올리면
// 서버가 "아직 답변이 빈 턴"으로 보고 턴 전체 녹음을 whisper로 전사한 뒤 버린다 —
// 다음 질문이 그만큼(수십 초) 늦어진다. 응답이 먼저면 서버 전사가 스킵된다.
// 텍스트가 없을 때(순수 오프라인 폴백)만 예전처럼 오디오 먼저 → 서버 전사가 답을 채운다.
export async function submitResponse(session, turnId, input) {
  const uploadAudio = async () => {
    if (!input.audio || input.audio.size === 0) return;
    try {
      const form = new FormData();
      form.append("file", input.audio, `turn-${turnId}.wav`);
      await request(`/sessions/${session.id}/turns/${turnId}/audio`, {
        method: "POST",
        token: session.access_token,
        body: form,
      });
    } catch {
      // 오디오 분석은 부가 기능 — 업로드가 실패해도 텍스트 기반 분석으로 진행한다.
    }
  };
  const postResponse = () => request(`/sessions/${session.id}/turns/${turnId}/response`, {
    method: "POST",
    token: session.access_token,
    body: JSON.stringify({
      text: input.text,
      stt_source: input.sttSource || "text",
      duration_ms: input.durationMs,
      nonverbal: input.nonverbal || null,
    }),
  });
  if (input.text?.trim()) {
    const result = await postResponse();
    await uploadAudio();
    return result;
  }
  await uploadAudio();
  return postResponse();
}

// 연습 중 실시간 받아쓰기 폴백 — Web Speech가 없거나 실패할 때 3초 안팎의 WAV 조각을
// 서버 STT(whisper/vosk)로 전사한다. 반환: { text, provider }
export function transcribeLive(session, wavBlob) {
  const form = new FormData();
  form.append("file", wavBlob, "live.wav");
  return request(`/sessions/${session.id}/stt`, {
    method: "POST",
    token: session.access_token,
    body: form,
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
