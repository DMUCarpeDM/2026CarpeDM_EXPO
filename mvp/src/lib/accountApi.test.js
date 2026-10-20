import assert from "node:assert/strict";
import test from "node:test";
import { authenticate, clearAccount, readAccount } from "./accountApi.js";

test("account API stores successful authentication and clears it on logout", async () => {
  const records = new Map();
  globalThis.sessionStorage = { getItem: key => records.get(key) || null, setItem: (key, value) => records.set(key, value), removeItem: key => records.delete(key) };
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify(url.endsWith("/me") ? { name: "테스트", email: "test@example.com" } : { access_token: "test-token" }));
  };
  const account = await authenticate("signup", { name: "테스트", email: "test@example.com", password: "example-password" });
  assert.deepEqual(JSON.parse(calls[0].options.body), { name: "테스트", email: "test@example.com", password: "example-password" });
  assert.equal(calls[1].options.headers.Authorization, "Bearer test-token");
  assert.deepEqual(readAccount(), account);
  clearAccount();
  assert.equal(readAccount(), null);
});

test("rejected authentication does not save an account", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ detail: "로그인 실패" }), { status: 401 });
  await assert.rejects(authenticate("login", { email: "test@example.com", password: "wrong" }), /이메일과 비밀번호를 다시 확인해주세요/);
  assert.equal(readAccount(), null);
});

for (const [status, message] of [[409, "이미 가입한 이메일이에요. 로그인해주세요."], [422, "입력한 정보를 다시 확인해주세요."], [429, "요청이 많아요. 잠시 후 다시 시도해주세요."], [500, "계정 요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요."]]) {
  test(`account failure ${status} shows an actionable message without server details`, async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({ detail: "Internal server details" }), { status });
    await assert.rejects(authenticate("signup", { email: "test@example.com", password: "example-password" }), { message });
    assert.equal(readAccount(), null);
  });
}
