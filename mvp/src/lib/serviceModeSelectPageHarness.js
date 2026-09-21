import assert from "node:assert/strict";
import { join } from "node:path";

const cardSelector = ".mode-picker__card";

export async function waitForServiceModeCards(page) {
  await page.locator(cardSelector).first().waitFor({ state: "visible" });
}

export class ServiceModeSelectAssertions {
  constructor(page, serviceModeLabels, serviceModeIds) {
    this.page = page;
    this.serviceModeLabels = serviceModeLabels;
    this.serviceModeIds = serviceModeIds;
  }

  async initialContract() {
    const cards = this.page.locator(cardSelector);
    assert.equal(await cards.count(), 3);
    assert.deepEqual(await cards.locator("strong").allTextContents(), this.serviceModeLabels);
    assert.deepEqual(await cards.evaluateAll((items) => items.map((item) => item.getAttribute("aria-pressed"))), ["false", "false", "false"]);
    assert.equal(await this.page.getByRole("button", { name: "시작하기", exact: true }).isDisabled(), true);
    for (const label of this.serviceModeLabels) {
      assert.equal(await this.page.getByRole("button", { name: label, exact: true }).count(), 1);
    }
    assert.equal(await cards.locator("button, a").count(), 0);
    return { cards: 3, labels: this.serviceModeLabels, startDisabled: true };
  }

  async keyboardActivation() {
    const start = this.page.getByRole("button", { name: "시작하기", exact: true });
    for (const [index, id] of this.serviceModeIds.entries()) {
      const card = this.page.locator(cardSelector).nth(index);
      await card.focus();
      await this.page.keyboard.press(index % 2 ? "Space" : "Enter");
      assert.equal(await card.getAttribute("aria-pressed"), "true");
      assert.equal(await this.page.locator(cardSelector + '[aria-pressed="true"]').count(), 1);
      assert.equal(await this.page.evaluate(() => window.__serviceModeSelectIds.length), index, "selection alone does not navigate");
      await start.focus();
      await this.page.keyboard.press("Enter");
      assert.equal(await this.page.evaluate(() => window.__serviceModeSelectIds.at(-1)), id);
    }
    return { activated: this.serviceModeIds };
  }

  async returnClearsFocusAndSelection() {
    await this.page.locator(cardSelector).nth(1).click();
    await this.page.evaluate(() => window.__serviceModeSelectReturn());
    await this.page.waitForFunction(() => !document.querySelector('.mode-picker__card[aria-pressed="true"]'));
    return this.initialContract();
  }

  async captureViewport({ artifactRoot, viewport, fileName }) {
    await this.page.setViewportSize(viewport);
    await this.page.reload({ waitUntil: "domcontentloaded" });
    await waitForServiceModeCards(this.page);
    await this.page.waitForFunction(() => [...document.querySelectorAll('.mode-picker__image')].every((image) => image.complete && image.naturalWidth > 0));
    await this.page.locator('.mode-picker__image').evaluateAll((images) => Promise.all(images.map((image) => image.decode())));
    await this.page.mouse.move(0, 0);
    await this.page.waitForFunction(() => [...document.querySelectorAll('.mode-picker__card')].every((card) => getComputedStyle(card).transform === 'none'));
    const cards = await this.page.locator(cardSelector).evaluateAll((items) => items.map((item) => {
      const box = item.getBoundingClientRect();
      const image = item.querySelector("img").getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, imageWidth: image.width, imageHeight: image.height };
    }));
    assert.equal(await this.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    for (const card of cards) assert.ok(Math.abs(card.imageWidth - card.imageHeight) < 1, "images stay square");
    if (viewport.width > 640) assert.equal(new Set(cards.map((card) => Math.round(card.y))).size, 1);
    else assert.ok(cards[0].y < cards[1].y && cards[1].y < cards[2].y);
    await this.page.screenshot({ path: join(artifactRoot, fileName), fullPage: true });
    return { viewport, cards };
  }

  captureDesktop(artifactRoot) {
    return this.captureViewport({ artifactRoot, viewport: { width: 1280, height: 900 }, fileName: "service-mode-1280x900.png" });
  }

  captureMobile(artifactRoot) {
    return this.captureViewport({ artifactRoot, viewport: { width: 390, height: 900 }, fileName: "service-mode-390x900.png" });
  }
}
