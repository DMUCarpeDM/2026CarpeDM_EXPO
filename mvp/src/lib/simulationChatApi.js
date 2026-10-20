import { resolveApiBase } from './pocApi.js';
const base = resolveApiBase(globalThis.__MIRROR_TING_API_BASE__ || import.meta.env?.VITE_API_URL);
export async function simulationChatRequest(step, payload, signal) {
  let response;
  try { response = await fetch(`${base}/simulation-chat/${step}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal }); }
  catch (error) { if (error.name === 'AbortError') throw error; throw new Error('AI에 연결하지 못했어요. 입력한 내용을 유지했으니 다시 시도해주세요.'); }
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(response.status === 422 ? '설정과 답변을 확인해주세요. 턴 수는 1~20회로 정할 수 있어요.' : typeof result?.detail === 'string' ? result.detail : 'AI 답변을 받지 못했어요. 다시 시도해주세요.');
  if (typeof result?.message !== 'string' || (step === 'prepare' && !result.draft)) throw new Error('AI 답변을 확인하지 못했어요. 다시 시도해주세요.');
  return result;
}
