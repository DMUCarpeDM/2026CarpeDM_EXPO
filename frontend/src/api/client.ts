import axios from 'axios';
import type {
  AdminMetrics,
  NextTurnResult,
  NonverbalMetrics,
  Progress,
  Report,
  RoleplaySession,
  Scenario,
} from './types';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api',
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

export async function uploadAudio(sessionId: number, turnId: number, wav: Blob): Promise<void> {
  const form = new FormData();
  form.append('file', wav, 'response.wav');
  await api.post(`/sessions/${sessionId}/turns/${turnId}/audio`, form);
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

export async function adminMetrics(): Promise<AdminMetrics> {
  return (await api.get('/admin/metrics')).data;
}

export async function adminReset(): Promise<{ ok: boolean; aborted_sessions: number }> {
  return (await api.post('/admin/reset')).data;
}
