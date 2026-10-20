import { resolveApiBase } from "./pocApi.js";

const KEY = "mirror-ting-web-account";
const API_BASE = resolveApiBase(globalThis.__MIRROR_TING_API_BASE__ || import.meta.env?.VITE_API_URL);

export function readAccount() {
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY) || "null");
    return typeof value?.access_token === "string" && typeof value?.email === "string" ? value : null;
  } catch { return null; }
}

export function clearAccount() { sessionStorage.removeItem(KEY); }

export async function authenticate(kind, { email, password, name }) {
  const response = await fetch(`${API_BASE}/auth/${kind}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, ...(kind === "signup" ? { name } : {}) }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.access_token) {
    const message = response.status === 401 ? "이메일과 비밀번호를 다시 확인해주세요."
      : response.status === 409 ? "이미 가입한 이메일이에요. 로그인해주세요."
      : response.status === 422 ? "입력한 정보를 다시 확인해주세요."
      : response.status === 429 ? "요청이 많아요. 잠시 후 다시 시도해주세요."
      : "계정 요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.";
    throw new Error(message);
  }
  const profile = await fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${result.access_token}` } });
  if (!profile.ok) throw new Error("계정 정보를 확인하지 못했어요. 다시 로그인해주세요.");
  const user = await profile.json();
  const account = { access_token: result.access_token, name: user.name, email: user.email };
  sessionStorage.setItem(KEY, JSON.stringify(account));
  return account;
}
