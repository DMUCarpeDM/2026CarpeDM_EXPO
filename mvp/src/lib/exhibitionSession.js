export const REPORT_FLOW_IDLE_TIMEOUT_MS = 90_000;

const ACTIVE_SESSION = "mirrorting-active-session";
const RETAINED_RECORDS = "mirrorting-retained-records";
const REPORT_FLOW_VIEWS = new Set(["result", "feedback", "compare", "share"]);
const AUDIO_DB = "mirrorting-retained-audio";
const AUDIO_STORE = "turn-audio";
const AUDIO_DB_VERSION = 1;

export function isReportFlowView(view) {
  return REPORT_FLOW_VIEWS.has(view);
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
  if (!globalThis.indexedDB) return null;
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
