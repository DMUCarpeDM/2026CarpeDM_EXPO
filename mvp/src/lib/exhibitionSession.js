export const REPORT_FLOW_IDLE_TIMEOUT_MS = 90_000;

const ACTIVE_SESSION = "mirror-ting-active-session";
const RETAINED_RECORDS = "mirror-ting-retained-records";
const REPORT_FLOW_VIEWS = new Set(["result", "feedback", "compare", "share"]);
const AUDIO_DB = "mirror-ting-retained-audio";
const AUDIO_STORE = "turn-audio";
const AUDIO_DB_VERSION = 1;

export function isReportFlowView(view) {
  return REPORT_FLOW_VIEWS.has(view);
}

/** 리포트 흐름 방치 복귀 대기 시간 — `?idle=<초>`로 조정한다 (AttractLoop의 `?attract=`와 같은 방침).
 *
 *  `?idle=0`(또는 off/none)이면 **복귀 자체를 끈다.** 시연 영상 촬영처럼 리포트 화면을
 *  90초 넘게 띄워 두고 내레이션해야 하는 경우, 기본값이 세션까지 지우고 홈으로 보내버린다.
 *  전시 운영에서는 쿼리를 붙이지 않아 기본 90초가 그대로 유지된다.
 *  @returns {number|null} 대기 ms, 또는 복귀를 끄면 null */
export function resolveReportIdleTimeoutMs(search = "") {
  const raw = new URLSearchParams(search).get("idle");
  if (raw === null) return REPORT_FLOW_IDLE_TIMEOUT_MS;
  if (["0", "off", "none", "false"].includes(raw.trim().toLowerCase())) return null;
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : REPORT_FLOW_IDLE_TIMEOUT_MS;
}

export function retainedAudioReference(sessionId, turnId) {
  return `indexeddb://${AUDIO_DB}/${encodeURIComponent(sessionId)}/${encodeURIComponent(turnId)}`;
}

export function buildRetainedRecord({ session, report, audioReferences, completedAt = new Date().toISOString() }) {
  return {
    session_id: session.id,
    audio_reference: audioReferences[0] || null,
    audio_references: audioReferences,
    analysis_result: report,
    completed_at: completedAt,
  };
}

export function saveRetainedRecord(storage, record) {
  const existing = readRetainedRecords(storage).filter((item) => item.session_id !== record.session_id);
  storage.setItem(RETAINED_RECORDS, JSON.stringify([...existing, record]));
}

export function readRetainedRecords(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(RETAINED_RECORDS) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearActiveSession(storage) {
  storage.removeItem(ACTIVE_SESSION);
}

function openAudioDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(AUDIO_DB, AUDIO_DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(AUDIO_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function retainTurnAudio(sessionId, turnId, audio) {
  if (!audio || !globalThis.indexedDB) return null;
  const db = await openAudioDb();
  const reference = retainedAudioReference(sessionId, turnId);
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(AUDIO_STORE, "readwrite");
    transaction.objectStore(AUDIO_STORE).put(audio, reference);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
  return reference;
}
