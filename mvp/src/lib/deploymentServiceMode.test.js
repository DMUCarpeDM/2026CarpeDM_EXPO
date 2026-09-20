import assert from "node:assert/strict";
import test from "node:test";
import { resolveDeploymentServiceMode } from "./deploymentServiceMode.js";

test("submission URL can enter the interview service directly", () => {
  assert.equal(resolveDeploymentServiceMode("?service=interview"), "interview");
});

test("build-time service mode locks the deployment when the URL does not override it", () => {
  assert.equal(resolveDeploymentServiceMode("", "interview"), "interview");
});

test("unknown service modes do not bypass the service selector", () => {
  assert.equal(resolveDeploymentServiceMode("?service=unknown", ""), "");
});
