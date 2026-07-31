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
    // FastAPI 422의 detail은 객체 배열이라 그대로 message에 넣으면 화면에
    // "[object Object]"가 뜬다 — 문자열 detail만 통과시키고 나머지는 축약한다.
    const detail = data?.detail;
    const message =
      typeof detail === "string" && detail
        ? detail
        : Array.isArray(detail)
          ? "입력 형식이 올바르지 않아요. 다시 확인해 주세요."
          : "서버를 실행하면 연습을 이어갈 수 있어요.";
    throw new PocApiError(message, response.status);
  }
  return data;
}

export function getScenarios() {
  return request("/scenarios");
}

export function getHealth() {
  return request("/health");
}

export function createSession({ difficulty, mode, scenarioSlug, selectedEpisodeId, consent, jobRole, nfcUid }) {
  return request("/sessions", {
    method: "POST",
    body: JSON.stringify({
      difficulty,
      mode,
      scenario_slug: scenarioSlug,
      ...(selectedEpisodeId ? { selected_episode_id: selectedEpisodeId } : {}),
      // ---- B2B 확장 (S-B2B-SESSION / S-B2B-NFC) — NFC·직무 흐름일 때만 실어 기존 계약을 보존한다.
      // nfc_uid를 주면 서버가 카드의 직무·시나리오를 세션에 스탬프한다 (미등록 카드 404).
      ...(jobRole ? { job_role: jobRole } : {}),
      ...(nfcUid ? { nfc_uid: nfcUid } : {}),
      client_key: getClientKey(),
      consent: { agreed: consent, storage_policy: "none" },
    }),
  });
}

// ---- NFC (S-B2B-103~106) — 발급 키오스크·미러 태그 계약 ----

// 리더 브리지 폴링 — since(마지막으로 본 seq) 이후 새 태그가 없으면 uid가 빈 문자열이다.
export function getNfcTap(reader, since = 0) {
  return request(`/nfc/tap?reader=${encodeURIComponent(reader)}&since=${since}`);
}

// 카드 발급/재발급 — 같은 uid는 직무를 덮어쓴다 (카드는 회전 소모품). 알 수 없는 직무면 422.
export function issueNfcCard({ uid, jobRole, scenarioSlug }) {
  return request("/nfc/issue", {
    method: "POST",
    body: JSON.stringify({
      uid,
      job_role: jobRole,
      ...(scenarioSlug ? { scenario_slug: scenarioSlug } : {}),
    }),
  });
}

// 미러 시작 계약 — 태그된 카드의 직무·시나리오를 돌려준다. 미등록·폐기 카드는 404 →
// 호출부가 수동 직무 선택 폴백 UI를 띄운다 (미인식이 체험 중단이 되면 안 된다).
export function resolveNfcCard(uid) {
  return request("/nfc/resolve", { method: "POST", body: JSON.stringify({ uid }) });
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
