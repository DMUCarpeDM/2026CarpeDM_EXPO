import axios from 'axios';
import type {
  AdminMetrics,
  NextTurnResult,
  NonverbalMetrics,
  Progress,
  Report,
  RoleplaySession,
  Scenario,
  Turn,
} from './types';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api',
});

/** 세션 능력 토큰 — 생성 시 서버가 발급하고, 세션 데이터 조회에 필요하다.
 * 새로고침·크래시 복구를 위해 세션 id별로 localStorage에 보관한다. */
export function sessionToken(id: number): string {
  return localStorage.getItem(`mirroting-session-${id}`) ?? '';
}

function setSessionToken(id: number, token: string): void {
  if (token) localStorage.setItem(`mirroting-session-${id}`, token);
}

/** 관람객 간 격리 — 대기 화면 복귀 시 이전 사람의 익명 키·세션 토큰을 지운다 */
export function resetVisitorIdentity(): void {
  localStorage.removeItem('mirroting-client-key');
  for (let i = localStorage.length - 1; i >= 0; i -= 1) {
    const k = localStorage.key(i);
    if (k && k.startsWith('mirroting-session-')) localStorage.removeItem(k);
  }
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('mirroting-token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  // 세션 능력 토큰 — /sessions/{id}… 호출에 자동 첨부 (IDOR 차단)
  const m = config.url?.match(/^\/sessions\/(\d+)(?:\/|$)/);
  if (m) {
    const st = sessionToken(Number(m[1]));
    if (st) config.headers['X-Session-Token'] = st;
  }
  return config;
});

/** 익명 연속성 키 — 재도전 비교와 익명 ID 연동의 기반 */
export function clientKey(): string {
  let key = localStorage.getItem('mirroting-client-key');
  if (!key) {
    key = crypto.randomUUID();
    localStorage.setItem('mirroting-client-key', key);
  }
  return key;
}

export async function getScenarios(): Promise<Scenario[]> {
  return (await api.get('/scenarios')).data;
}

export async function createSession(opts: {
  mode: number;
  difficulty: string;
  agreed: boolean;
}): Promise<RoleplaySession> {
  const { data } = await api.post('/sessions', {
    mode: opts.mode,
    difficulty: opts.difficulty,
    client_key: clientKey(),
    consent: { agreed: opts.agreed, storage_policy: 'none' },
  });
  setSessionToken(data.id, data.access_token);
  return data;
}

export interface SessionResume extends RoleplaySession {
  history: (Turn & { response_text: string })[];
  elapsed_sec: number;
}

/** 세션 복구 — 새로고침·크래시 후 진행 상태와 턴 이력을 다시 가져온다 */
export async function getSession(sessionId: number): Promise<SessionResume> {
  return (await api.get(`/sessions/${sessionId}`)).data;
}

export async function submitResponse(
  sessionId: number,
  turnId: number,
  body: {
    text: string;
    stt_source: string;
    duration_ms: number;
    nonverbal: NonverbalMetrics | null;
  },
): Promise<NextTurnResult> {
  const { data } = await api.post(
    `/sessions/${sessionId}/turns/${turnId}/response`,
    body,
  );
  return data;
}

export async function uploadAudio(
  sessionId: number,
  turnId: number,
  wav: Blob,
): Promise<{ ok: boolean; transcript: string }> {
  const form = new FormData();
  form.append('file', wav, 'response.wav');
  const url = `/sessions/${sessionId}/turns/${turnId}/audio`;
  try {
    return (await api.post(url, form)).data;
  } catch {
    // 전시장 네트워크 순단 대비 1회 자동 재전송 (S-UKMAHL)
    return (await api.post(url, form)).data;
  }
}

export async function retryAnalysis(sessionId: number): Promise<void> {
  await api.post(`/sessions/${sessionId}/retry-analysis`);
}

export async function getHealth(): Promise<{ ok: boolean; server_stt: string | null }> {
  return (await api.get('/health')).data;
}

export async function issueCode(): Promise<string> {
  const { data } = await api.post('/codes', { client_key: clientKey() });
  return data.code;
}

/** 체험 코드로 이전 기록을 이어받는다 (client_key 교체) */
export async function claimCode(code: string): Promise<void> {
  const { data } = await api.post(`/codes/${encodeURIComponent(code)}/claim`);
  localStorage.setItem('mirroting-client-key', data.client_key);
}

export interface HistoryItem {
  session_id: number;
  started_at: string;
  mode: number;
  difficulty: string;
  total_score: number;
  fit_scores: Record<string, number | null>;
}

export async function getHistory(): Promise<HistoryItem[]> {
  const { data } = await api.get('/history', { params: { client_key: clientKey() } });
  return data.items;
}

export async function finishSession(sessionId: number): Promise<Progress> {
  return (await api.post(`/sessions/${sessionId}/finish`)).data;
}

export async function getProgress(sessionId: number): Promise<Progress> {
  return (await api.get(`/sessions/${sessionId}/progress`)).data;
}

export async function getReport(sessionId: number): Promise<Report> {
  return (await api.get(`/sessions/${sessionId}/report`)).data;
}

export async function signup(email: string, password: string, name: string): Promise<void> {
  const { data } = await api.post('/auth/signup', { email, password, name });
  localStorage.setItem('mirroting-token', data.access_token);
}

export async function login(email: string, password: string): Promise<void> {
  const { data } = await api.post('/auth/login', { email, password });
  localStorage.setItem('mirroting-token', data.access_token);
}

/** 운영 토큰 — 서버에 MIRROTING_ADMIN_TOKEN이 설정된 경우 운영 API 호출에 필요 */
export function adminToken(): string {
  return localStorage.getItem('mirroting-admin-token') ?? '';
}

export function setAdminToken(token: string): void {
  localStorage.setItem('mirroting-admin-token', token);
}

function adminHeaders(): Record<string, string> {
  const token = adminToken();
  return token ? { 'X-Admin-Token': token } : {};
}

export async function adminMetrics(): Promise<AdminMetrics> {
  return (await api.get('/admin/metrics', { headers: adminHeaders() })).data;
}

export async function adminReset(): Promise<{ ok: boolean; aborted_sessions: number }> {
  return (await api.post('/admin/reset', null, { headers: adminHeaders() })).data;
}

/** CSV 내보내기 — 토큰 헤더가 필요해 <a href> 대신 blob 다운로드로 처리 */
export async function adminExportCsv(): Promise<void> {
  const { data } = await api.get('/admin/export.csv', {
    headers: adminHeaders(),
    responseType: 'blob',
  });
  const url = URL.createObjectURL(data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'mirroting_sessions.csv';
  a.click();
  URL.revokeObjectURL(url);
}
