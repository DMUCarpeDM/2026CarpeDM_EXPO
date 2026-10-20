import assert from 'node:assert/strict';
import test from 'node:test';
import { simulationChatRequest } from './simulationChatApi.js';

test('preparation sends user settings to the backend and returns structured data', async () => {
  const original = globalThis.fetch;
  const payload = { prompt: '팀장과 일정 조율을 연습하고 싶어요.', consent: true, draft: { turns: 2 } };
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, '/api/simulation-chat/prepare');
      assert.deepEqual(JSON.parse(options.body), payload);
      return Response.json({ message: '상대의 성격은 어떤가요?', draft: { turns: 2 } });
    };
    assert.equal((await simulationChatRequest('prepare', payload)).draft.turns, 2);
  } finally { globalThis.fetch = original; }
});

test('connection and validation errors offer a retry without replacing the draft', async () => {
  const original = globalThis.fetch;
  const payload = { draft: { goal: '일정 합의' } };
  try {
    globalThis.fetch = async () => { throw new TypeError('network failed'); };
    await assert.rejects(simulationChatRequest('prepare', payload), /입력한 내용을 유지/);
    globalThis.fetch = async () => Response.json({ detail: [{ internal: 'validation' }] }, { status: 422 });
    await assert.rejects(simulationChatRequest('reply', payload), /턴 수는 1~20회/);
    assert.deepEqual(payload, { draft: { goal: '일정 합의' } });
  } finally { globalThis.fetch = original; }
});

test('malformed AI payload never becomes a fake assistant reply', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({ message: 'missing draft' });
    await assert.rejects(simulationChatRequest('prepare', {}), /답변을 확인하지 못/);
    globalThis.fetch = async () => { throw new DOMException('Aborted', 'AbortError'); };
    await assert.rejects(simulationChatRequest('reply', {}), { name: 'AbortError' });
  } finally { globalThis.fetch = original; }
});
