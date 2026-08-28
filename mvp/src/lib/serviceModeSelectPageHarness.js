import assert from "node:assert/strict";
import { join } from "node:path";

const cardSelector = "button.choice-card.service-mode-card";
const browserTimeout = 10_000;

export async function waitForServiceModeCards(page) {
  await page.locator(cardSelector).first().waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const root = document.querySelector(".setup-flow-page");
    return root && getComputedStyle(root).opacity === "1";
  }, undefined, { timeout: browserTimeout });
}

async function inspectRenderedPage(page) {
  const cards = page.locator(cardSelector);
  const cardContent = await cards.evaluateAll((items) => items.map((item) => ({
    text: item.textContent?.trim() || "",
    strongCount: item.querySelectorAll("strong").length,
    imageCount: item.querySelectorAll("img.choice-asset").length,
    iconCount: item.querySelectorAll(".choice-icon").length,
    selectedClass: item.classList.contains("selected"),
    focusVisible: item.matches(":focus-visible"),
    checkCount: item.querySelectorAll(":scope > b").length,
    auxiliaryText: [...item.querySelectorAll("small, em, b")]
      .map((node) => node.textContent?.trim() || "")
      .filter(Boolean),
  })));
  return {
    h1Count: await page.locator("h1").count(),
    paragraphCount: await page.locator("p").count(),
    headingCount: await page.locator("h1, h2, h3, h4, h5, h6").count(),
    sectionCount: await page.locator("section").count(),
    headerCount: await page.locator("header").count(),
    navCount: await page.locator("nav, .top-nav, .mobile-menu-sheet").count(),
    helperCount: await page.locator(".page-title, .choice-section-heading, .mini-stepper, small, em").count(),
    statusCount: await page.locator("[role=status], [aria-live], .attract-overlay, .nfc").count(),
    nonCardButtonCount: await page.locator("button:not(.service-mode-card)").count(),
    boldCount: await page.locator(".service-mode-card b").count(),
    buttonCount: await page.locator("button").count(),
    cardCount: await cards.count(),
    labels: await cards.locator("strong").allTextContents(),
    pressed: await cards.evaluateAll((items) => items.map((item) => item.getAttribute("aria-pressed"))),
    cardContent,
    nestedInteractiveCount: await page.locator(".service-mode-card button, .service-mode-card a").count(),
    canvasBackground: await page.locator(".service-mode-page").evaluate((node) => getComputedStyle(node).backgroundColor),
    horizontalOverflow: await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
  };
}

function assertDesktopGeometry(cards) {
  assert.equal(cards.length, 3, "desktop renders three cards");
  assert.equal(new Set(cards.map((card) => Math.round(card.y))).size, 1, "desktop cards share one row");
  const widths = cards.map((card) => card.width);
  assert.ok(Math.max(...widths) - Math.min(...widths) < 2, "desktop cards have equal widths");
}

function assertMobileGeometry(cards) {
  assert.equal(cards.length, 3, "mobile renders three cards");
  assert.equal(new Set(cards.map((card) => Math.round(card.x))).size, 1, "mobile cards share one column");
  assert.ok(cards[0].y < cards[1].y && cards[1].y < cards[2].y, "mobile cards stack in catalog order");
}

async function readCardGeometry(page) {
  return page.locator(cardSelector).evaluateAll((items) => items.map((item) => {
    const box = item.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  }));
}

export class ServiceModeSelectAssertions {
  constructor(page, serviceModeLabels, serviceModeIds) {
    this.page = page;
    this.serviceModeLabels = serviceModeLabels;
    this.serviceModeIds = serviceModeIds;
  }

  async initialContract() {
    const initial = await inspectRenderedPage(this.page);
    const excludedKeys = [
      "h1Count", "paragraphCount", "headingCount", "sectionCount", "headerCount",
      "navCount", "helperCount", "statusCount", "nonCardButtonCount", "boldCount",
    ];
    for (const key of excludedKeys) assert.equal(initial[key], 0, `${key} excluded`);
    assert.deepEqual({ buttons: initial.buttonCount, cards: initial.cardCount }, { buttons: 3, cards: 3 });
    assert.deepEqual(initial.labels, this.serviceModeLabels);
    for (const label of this.serviceModeLabels) {
      assert.equal(await this.page.getByRole("button", { name: label, exact: true }).count(), 1, `accessible name is ${label}`);
    }
    assert.deepEqual(initial.pressed, ["false", "false", "false"]);
    assert.deepEqual(initial.cardContent, this.serviceModeLabels.map((text) => ({
      text,
      strongCount: 1,
      imageCount: 1,
      iconCount: 0,
      selectedClass: false,
      focusVisible: false,
      checkCount: 0,
      auxiliaryText: [],
    })));
    assert.equal(initial.nestedInteractiveCount, 0);
    assert.equal(initial.canvasBackground, "rgb(255, 255, 255)");
    assert.equal(initial.horizontalOverflow, false);
    return initial;
  }

  async keyboardActivation() {
    await this.page.keyboard.press("Tab");
    assert.equal(await this.page.evaluate(() => document.activeElement?.matches("button.choice-card.service-mode-card")), true, "Tab focuses the first whole card");
    await this.page.keyboard.press("Enter");
    await this.page.waitForFunction((count) => window.__serviceModeSelectIds?.length === count, 1);
    assert.deepEqual(await this.page.evaluate(() => window.__serviceModeSelectIds), [this.serviceModeIds[0]]);
    assert.deepEqual(await this.page.locator(cardSelector).evaluateAll((items) => items.map((item) => ({
      pressed: item.getAttribute("aria-pressed"),
      selected: item.classList.contains("selected"),
      checkCount: item.querySelectorAll(":scope > b").length,
    }))), this.serviceModeIds.map(() => ({ pressed: "false", selected: false, checkCount: 0 })));
    for (const [index, id] of this.serviceModeIds.entries()) {
      await this.page.locator(cardSelector).nth(index).focus();
      await this.page.keyboard.press("Enter");
      await this.page.waitForFunction((count) => window.__serviceModeSelectIds?.length === count, index + 2);
      assert.equal(await this.page.evaluate(() => window.__serviceModeSelectIds.at(-1)), id);
    }
    assert.deepEqual(await this.page.evaluate(() => window.__serviceModeSelectIds), [this.serviceModeIds[0], ...this.serviceModeIds]);
    return { firstTabEnter: { focused: true, activated: this.serviceModeIds[0] }, allCardEnter: this.serviceModeIds };
  }

  async returnClearsFocusAndSelection() {
    await this.page.locator(cardSelector).nth(1).focus();
    assert.equal(await this.page.evaluate(() => document.activeElement?.matches("button.choice-card.service-mode-card")), true, "selector card receives keyboard focus");
    await this.page.evaluate(() => window.__serviceModeSelectReturn?.());
    await waitForServiceModeCards(this.page);
    const returned = await inspectRenderedPage(this.page);
    assert.equal(await this.page.evaluate(() => document.activeElement?.matches("button.choice-card.service-mode-card")), false, "return does not restore card focus");
    assert.deepEqual(returned.pressed, ["false", "false", "false"]);
    assert.equal(returned.boldCount, 0);
    assert.equal(returned.cardContent.some((card) => card.selectedClass || card.focusVisible || card.checkCount > 0), false);
    return returned;
  }

  async captureViewport({ artifactRoot, viewport, fileName, geometryAssertion }) {
    await this.page.setViewportSize(viewport);
    await this.page.reload({ waitUntil: "domcontentloaded" });
    await waitForServiceModeCards(this.page);
    const cards = await readCardGeometry(this.page);
    geometryAssertion(cards);
    const result = { viewport, ...(await inspectRenderedPage(this.page)), cards };
    await this.page.screenshot({ path: join(artifactRoot, fileName), fullPage: true });
    return result;
  }

  captureDesktop(artifactRoot) {
    return this.captureViewport({
      artifactRoot,
      viewport: { width: 1280, height: 900 },
      fileName: "service-mode-1280x900.png",
      geometryAssertion: assertDesktopGeometry,
    });
  }

  captureMobile(artifactRoot) {
    return this.captureViewport({
      artifactRoot,
      viewport: { width: 390, height: 900 },
      fileName: "service-mode-390x900.png",
      geometryAssertion: assertMobileGeometry,
    });
  }
}
