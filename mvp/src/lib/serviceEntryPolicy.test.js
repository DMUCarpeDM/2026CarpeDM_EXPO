import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { navMap, NEW_PRACTICE_TARGET } from "../components/navigation/navigationConfig.js";

const source = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), "utf8");
const appNavigation = source("../components/navigation/AppNavigation.jsx");
const dashboardShell = source("../components/report/DashboardShell.jsx");
const serviceEntryShell = source("../pages/ServiceEntryShell.jsx");

test("new practice entry points resolve to the shared service selector", () => {
  assert.equal(NEW_PRACTICE_TARGET, "service");
  assert.deepEqual(navMap, { "사이트 소개": "intro", "결과 및 기록": "records", "사용방법": "usage" });
  assert.match(appNavigation, /onNavigate\(NEW_PRACTICE_TARGET\).*새 연습 시작/);
  assert.match(dashboardShell, /onNavigate\(NEW_PRACTICE_TARGET\)/);
  assert.match(serviceEntryShell, /onPractice=\{\(\) => navigate\("preview"\)\}/);
  assert.doesNotMatch(serviceEntryShell, /<FeedbackPage|<ComparePage|<SharePage/);
});

test("same-scenario retry still skips the service selector", () => {
  assert.match(serviceEntryShell, /<ResultPage[\s\S]*onPractice=\{\(\) => navigate\("preview"\)\}/);
});
