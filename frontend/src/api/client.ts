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
  // 응답 없는 요청은 제한 시간 후 실패시켜 재시도 UI로 넘긴다 — 무한 대기는
  // submitting 잠금과 겹쳐 키오스크 전체를 굳게 만든다 (전시 생존성)
  timeout: 10_000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('mirroting-token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
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
  // 서버가 리액션 개인화(Ollama, 기본 7s 타임아웃)까지 마치고 응답하므로 여유를 준다
  const { data } = await api.post(
    `/sessions/${sessionId}/turns/${turnId}/response`,
    body,
    { timeout: 20_000 },
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
  // 서버 STT(오프라인 폴백)가 전사까지 마치고 응답하므로 기본보다 길게 잡는다
  const opts = { timeout: 15_000 };
  try {
    return (await api.post(url, form, opts)).data;
  } catch {
    // 전시장 네트워크 순단 대비 1회 자동 재전송 (S-UKMAHL)
    return (await api.post(url, form, opts)).data;
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
