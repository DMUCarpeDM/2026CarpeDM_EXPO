import axios from 'axios';
import type {
  AdminMetrics,
  Me,
  MySession,
  NextTurnResult,
  NonverbalMetrics,
  OrgDetail,
  OrgMember,
  OrgSessionList,
  Progress,
  Report,
  RoleplaySession,
  Scenario,
  SessionClaim,
  Turn,
} from './types';

export const api = axios.create({
  // 기본은 상대 경로 — dev는 vite 프록시(5174→8001), 배포는 동일 호스트 서빙을
  // 전제해 브라우저 CORS를 원천 회피한다. 절대 URL(구 기본값 8001 직접 호출)은
  // 5173 외 포트에서 CORS로 전 API가 죽는 함정이었다. 다른 호스트의 백엔드를
  // 쓸 때만 VITE_API_URL로 명시 지정한다.
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  // 응답 없는 요청은 제한 시간 후 실패시켜 재시도 UI로 넘긴다 — 무한 대기는
  // submitting 잠금과 겹쳐 키오스크 전체를 굳게 만든다 (전시 생존성)
  timeout: 10_000,
});

/** 세션 능력 토큰 — 생성 시 서버가 발급하고, 세션 데이터 조회에 필요하다.
 * 새로고침·크래시 복구를 위해 세션 id별로 localStorage에 보관한다. */
export function sessionToken(id: number): string {
  return localStorage.getItem(`mirror-ting-session-${id}`) ?? '';
}

function setSessionToken(id: number, token: string): void {
  if (token) localStorage.setItem(`mirror-ting-session-${id}`, token);
}

/** 관람객 간 격리 — 대기 화면 복귀 시 이전 사람의 익명 키·세션 토큰을 지운다 */
export function resetVisitorIdentity(): void {
  localStorage.removeItem('mirror-ting-client-key');
  for (let i = localStorage.length - 1; i >= 0; i -= 1) {
    const k = localStorage.key(i);
    if (k && k.startsWith('mirror-ting-session-')) localStorage.removeItem(k);
  }
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('mirror-ting-token');
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
  let key = localStorage.getItem('mirror-ting-client-key');
  if (!key) {
    key = crypto.randomUUID();
    localStorage.setItem('mirror-ting-client-key', key);
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
  // 직무 축 시나리오 선택 (S-B2B-PACK) — 미지정이면 서버 기본(첫) 시나리오
  scenarioSlug?: string;
}): Promise<RoleplaySession> {
  const { data } = await api.post('/sessions', {
    mode: opts.mode,
    difficulty: opts.difficulty,
    ...(opts.scenarioSlug ? { scenario_slug: opts.scenarioSlug } : {}),
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
  localStorage.setItem('mirror-ting-client-key', data.client_key);
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

export async function signup(
  email: string,
  password: string,
  name: string,
  inviteCode?: string,
  jobRole?: string,
): Promise<void> {
  // 초대 코드가 있으면 가입과 동시에 기관 소속 (S-B2B-118).
  // 코드 불일치 시 서버가 404를 던지고 계정은 만들어지지 않는다.
  // 직무는 선택 입력 (S-B2B-PACK) — 알 수 없는 직무면 422, 계정 미생성.
  const { data } = await api.post('/auth/signup', {
    email,
    password,
    name,
    ...(inviteCode ? { invite_code: inviteCode } : {}),
    ...(jobRole ? { job_role: jobRole } : {}),
  });
  localStorage.setItem('mirror-ting-token', data.access_token);
}

export async function login(email: string, password: string): Promise<void> {
  const { data } = await api.post('/auth/login', { email, password });
  localStorage.setItem('mirror-ting-token', data.access_token);
}

// ---- B2B 온보딩 교육 (S-B2B-101·S-B2B-118) ----

/** 로그인 토큰 존재 여부 — 네비게이션·페이지 게이트용 */
export function authToken(): string {
  return localStorage.getItem('mirror-ting-token') ?? '';
}

export function clearAuthToken(): void {
  localStorage.removeItem('mirror-ting-token');
}

export async function getMe(): Promise<Me> {
  return (await api.get('/auth/me')).data;
}

/** 본인 직무 변경 (S-B2B-PACK) — 무인증 401, 알 수 없는 직무 422 */
export async function updateJobRole(jobRole: string): Promise<Me> {
  return (await api.patch('/auth/me', { job_role: jobRole })).data;
}

export async function getOrgDetail(orgId: number): Promise<OrgDetail> {
  return (await api.get(`/orgs/${orgId}`)).data;
}

/** 초대 코드 회전 — 기존 코드는 즉시 만료된다 (매니저 전용) */
export async function rotateOrgInvites(orgId: number): Promise<OrgDetail> {
  return (await api.post(`/orgs/${orgId}/invites/rotate`)).data;
}

export async function getOrgMembers(orgId: number): Promise<OrgMember[]> {
  return (await api.get(`/orgs/${orgId}/members`)).data;
}

export async function getOrgSessions(
  orgId: number,
  opts: { jobRole?: string; limit?: number; offset?: number } = {},
): Promise<OrgSessionList> {
  const { data } = await api.get(`/orgs/${orgId}/sessions`, {
    params: {
      job_role: opts.jobRole || undefined,
      limit: opts.limit ?? 50,
      offset: opts.offset ?? 0,
    },
  });
  return data;
}

/** 수강생 본인 연습 이력 — /me/results 데이터 소스 */
export async function getMySessions(): Promise<MySession[]> {
  return (await api.get('/sessions/mine')).data;
}

/** 클레임 미리보기 — claim_token 자체가 능력 토큰이라 무인증 (S-B2B-111) */
export async function previewClaim(claimToken: string): Promise<SessionClaim> {
  return (await api.get(`/sessions/claim/${encodeURIComponent(claimToken)}`)).data;
}

/** 세션을 내 계정에 귀속 — 404 위조 토큰, 409 타인 귀속 */
export async function claimSession(claimToken: string): Promise<SessionClaim> {
  return (await api.post('/sessions/claim', { claim_token: claimToken })).data;
}

/** 운영 토큰 — 서버에 MIRROR_TING_ADMIN_TOKEN이 설정된 경우 운영 API 호출에 필요 */
export function adminToken(): string {
  return localStorage.getItem('mirror-ting-admin-token') ?? '';
}

export function setAdminToken(token: string): void {
  localStorage.setItem('mirror-ting-admin-token', token);
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
  a.download = 'mirror-ting_sessions.csv';
  a.click();
  URL.revokeObjectURL(url);
}
