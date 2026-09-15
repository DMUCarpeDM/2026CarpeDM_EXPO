import assert from "node:assert/strict";
import { join } from "node:path";
import { capture, routeTrace, withPage } from "./serviceEntryRouteHarness.js";

async function openServiceSelector(page) {
  await page.locator(".service-mode-page").waitFor();
}

export async function runFreshSelection(pageHarness, runDir) {
  return withPage(pageHarness, {}, async ({ page, calls, pageErrors }) => {
    await openServiceSelector(page);
    assert.equal(await page.locator(".top-nav, .mobile-menu-layer, .attract-overlay, .nfc-fallback-overlay").count(), 0);
    assert.deepEqual(await page.locator(".service-mode-card").evaluateAll((cards) => cards.map((card) => card.getAttribute("aria-pressed"))), ["false", "false", "false"]);
    const selectorNfcCalls = calls.filter((path) => path === "/api/nfc/tap").length;
    assert.equal(selectorNfcCalls, 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight), true);
    await capture(page, join(runDir, "fresh-service.png"), ".setup-flow-page");

    const nfcRequest = page.waitForRequest((request) => new URL(request.url()).pathname === "/api/nfc/tap");
    await page.getByRole("button", { name: "면접", exact: true }).click();
    await page.locator(".home-page").waitFor();
    await nfcRequest;
    assert.equal(await page.locator(".attract-overlay").count(), 1);
    await capture(page, join(runDir, "selected-home.png"), ".home-page");
    await page.locator(".hero-actions button").first().click();
    await page.locator(".role-choice-section").waitFor();
    await capture(page, join(runDir, "selected-role.png"), ".selection-page");
    await page.locator(".setup-back-button").click();
    await page.locator(".home-page").waitFor();

    await page.locator(".hero-actions button").first().click();
    await page.locator(".role-choice-section").waitFor();
    await page.goBack();
    await page.locator(".home-page").waitFor();
    await page.goBack();
    await page.locator(".service-mode-page").waitFor();
    assert.equal(await page.getByRole("button", { name: "면접", exact: true }).getAttribute("aria-pressed"), "false");

    await page.getByRole("button", { name: "면접", exact: true }).click();
    await page.locator(".hero-actions button").first().click();
    await page.getByRole("button", { name: /개발자/ }).click();
    await page.locator(".setup-next-button").click();
    await page.getByRole("button", { name: /피드백 대화/ }).click();
    await page.locator(".setup-next-button").click();
    await page.getByRole("button", { name: /^진상 모드 / }).click();
    await page.locator(".setup-next-button").click();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Mirror-Ting 모드 선택", exact: true }).click();
    await page.locator(".service-mode-page").waitFor();
    assert.equal(await page.locator('[aria-pressed="true"]').count(), 0);
    assert.equal(await page.locator(".nfc-fallback-overlay").count(), 0);
    await capture(page, join(runDir, "reset-service.png"), ".setup-flow-page");

    await page.getByRole("button", { name: "직업훈련", exact: true }).click();
    await page.locator(".hero-actions button").first().click();
    assert.equal(await page.locator('.role-choice-section [aria-pressed="true"]').count(), 0);
    await page.getByRole("button", { name: /개발자/ }).click();
    await page.locator(".setup-next-button").click();
    assert.equal(await page.getByRole("button", { name: /일정 보고/ }).getAttribute("aria-pressed"), "true");
    assert.equal(await page.getByRole("button", { name: /피드백 대화/ }).getAttribute("aria-pressed"), "false");
    await page.locator(".setup-next-button").click();
    assert.equal(await page.locator('.difficulty-choice-section [aria-pressed="true"]').count(), 0);
    await page.getByRole("button", { name: /기본 모드/ }).click();
    await page.locator(".setup-next-button").click();
    assert.equal(await page.getByRole("checkbox").isChecked(), false);
    assert.deepEqual(pageErrors, []);
    return {
      trace: await routeTrace(page),
      selectorNfcCalls,
      selectedHomeNfcCalls: calls.filter((path) => path === "/api/nfc/tap").length,
      reset: { service: true, counterpart: true, scenario: true, episode: true, difficulty: true, consent: true, nfcFallback: true },
    };
  });
}

export async function runServiceCards(pageHarness, runDir) {
  const observations = [];
  for (const [serviceModeId, label] of [["interview", "면접"], ["training", "직업훈련"], ["workplace", "직장대화"]]) {
    observations.push(await withPage(pageHarness, {}, async ({ page, pageErrors }) => {
      await openServiceSelector(page);
      await page.getByRole("button", { name: label, exact: true }).click();
      await page.locator(".home-page").waitFor();
      assert.deepEqual(await page.locator(".top-nav nav button").allTextContents(), ["사이트 소개", "결과 및 기록", "사용방법"]);
      await page.locator(".top-nav nav button").filter({ hasText: "사이트 소개" }).click();
      await page.locator(".site-intro-page").waitFor();
      await page.locator(".top-nav nav button").filter({ hasText: "사용방법" }).click();
      await page.locator(".usage-page").waitFor();
      const question = page.getByRole("button", { name: "Mirror-Ting은 무엇을 평가하나요?", exact: true });
      await question.click();
      assert.equal(await question.getAttribute("aria-expanded"), "true");
      if (serviceModeId === "interview") await capture(page, join(runDir, "usage-desktop.png"), ".usage-page");
      await question.click();
      assert.equal(await question.getAttribute("aria-expanded"), "false");
      await page.locator(".top-nav nav button").filter({ hasText: "결과 및 기록" }).click();
      await page.locator(".records-page").waitFor();
      await page.getByRole("button", { name: "AI 연습하러 가기", exact: true }).click();
      await page.locator(`.home-mode-${serviceModeId} .home-page`).waitFor();
      await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole("button", { name: "메뉴 열기", exact: true }).click();
      const mobileNav = page.getByRole("navigation", { name: "모바일 주요 화면" });
      assert.deepEqual(await mobileNav.locator("button").allTextContents(), ["사이트 소개", "결과 및 기록", "사용방법"]);
      await mobileNav.getByRole("button", { name: "사용방법", exact: true }).click();
      await page.locator(".usage-page").waitFor();
      await page.waitForFunction(() => Number(getComputedStyle(document.querySelector(".mobile-menu-layer")).opacity) < 0.01);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      if (serviceModeId === "interview") await capture(page, join(runDir, "usage-mobile.png"), ".usage-page");
      await page.getByRole("button", { name: "연습하러 가기", exact: true }).click();
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.locator(".hero-actions button").first().click();
      await page.locator(".role-choice-section").waitFor();
      await page.locator(".setup-back-button").click();
      await page.locator(".home-page").waitFor();
      assert.deepEqual(pageErrors, []);
      return { serviceModeId, finalRoute: "home", trace: await routeTrace(page) };
    }));
  }
  return observations;
}

export async function runNfcReset(pageHarness) {
  const nfcCard = { uid: "card-1", job_role: "office_admin", scenario_slug: "office-scenario", job_role_label: "개발자" };
  return withPage(pageHarness, { nfcCard }, async ({ page, calls, pageErrors }) => {
    await openServiceSelector(page);
    assert.equal(calls.filter((path) => path === "/api/nfc/tap").length, 0);
    await page.getByRole("button", { name: "직장대화", exact: true }).click();
    await page.locator(".preview-page").waitFor();
    assert.equal(calls.includes("/api/nfc/resolve"), true);
    await page.getByRole("button", { name: "Mirror-Ting 모드 선택", exact: true }).click();
    await page.locator(".service-mode-page").waitFor();
    const postResetPoll = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/nfc/tap");
    await page.getByRole("button", { name: "직장대화", exact: true }).click();
    await page.locator(".home-page").waitFor();
    await postResetPoll;
    assert.equal(await page.locator(".preview-page").count(), 0, "reset clears the prior NFC direct-preview state");
    assert.deepEqual(pageErrors, []);
    return { trace: await routeTrace(page), nfcCalls: calls.filter((path) => path === "/api/nfc/tap").length, nfcStateCleared: true };
  });
}
