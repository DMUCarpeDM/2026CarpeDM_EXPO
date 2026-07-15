import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const stylesheetFiles = [
  "../styles.css",
  "../styles/base.css",
  "../styles/home-legacy.css",
  "../styles/selection-setup-base.css",
  "../styles/practice-base.css",
  "../styles/result.css",
  "../styles/feedback.css",
  "../styles/share.css",
  "../styles/compare.css",
  "../styles/responsive-legacy.css",
  "../styles/navigation.css",
  "../styles/desktop-dashboard.css",
  "../styles/print.css",
  "../styles/fidelity-foundation.css",
  "../styles/fidelity-home.css",
  "../styles/fidelity-reports.css",
  "../styles/fidelity-practice.css",
  "../styles/fidelity-responsive.css",
  "../styles/setup-flow.css",
];
const styles = stylesheetFiles.map((file) => readFileSync(new URL(file, import.meta.url), "utf8")).join("\n");
const appSource = readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
const componentSources = [
  appSource,
  readFileSync(new URL("../data/homeContent.js", import.meta.url), "utf8"),
  readFileSync(new URL("../pages/HomePage.jsx", import.meta.url), "utf8"),
  readFileSync(new URL("../pages/PracticePage.jsx", import.meta.url), "utf8"),
  readFileSync(new URL("../pages/PreviewPage.jsx", import.meta.url), "utf8"),
  readFileSync(new URL("../pages/ResultPage.jsx", import.meta.url), "utf8"),
  readFileSync(new URL("../pages/FeedbackPage.jsx", import.meta.url), "utf8"),
  readFileSync(new URL("../pages/SharePage.jsx", import.meta.url), "utf8"),
  readFileSync(new URL("../pages/ComparePage.jsx", import.meta.url), "utf8"),
  readFileSync(new URL("../components/report/ResultPrimitives.jsx", import.meta.url), "utf8"),
  readFileSync(new URL("../data/setupCatalog.js", import.meta.url), "utf8"),
  readFileSync(new URL("../components/ui/IconGlyph.jsx", import.meta.url), "utf8"),
  readFileSync(new URL("../components/navigation/navigationConfig.js", import.meta.url), "utf8"),
  readFileSync(new URL("../components/navigation/AppNavigation.jsx", import.meta.url), "utf8"),
  readFileSync(new URL("../components/setup/SetupComponents.jsx", import.meta.url), "utf8"),
  readFileSync(new URL("../pages/setup/RoleSelectPage.jsx", import.meta.url), "utf8"),
  readFileSync(new URL("../pages/setup/DifficultyPage.jsx", import.meta.url), "utf8"),
  readFileSync(new URL("../pages/setup/SetupPage.jsx", import.meta.url), "utf8"),
];
const sourceBundle = componentSources.join("\n");

const functionBody = (functionName) => {
  const source = componentSources.find((item) => item.includes(`function ${functionName}(`));
  const start = source?.indexOf(`function ${functionName}(`) ?? -1;
  assert.notEqual(start, -1, `${functionName} exists`);
  const next = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
};

test("kiosk 1920 layout reserves desktop canvas for supplied PC mockup views", () => {
  assert.match(styles, /@media \(min-width: 1500px\) and \(min-height: 900px\)/);
  assert.match(styles, /\.app-shell\s*\{[^}]*width:\s*min\(1720px,\s*calc\(100% - 56px\)\)/s);

  for (const selector of [
    ".home-hero",
    ".setup-page",
    ".practice-page",
    ".result-page",
    ".compare-page",
  ]) {
    assert.match(styles, new RegExp(`${selector.replace(".", "\\.")}[\\s\\S]*?`, "m"));
  }

  assert.match(styles, /\.preview-page,\s*\.share-page\s*\{[^}]*max-width:\s*1720px/s);
  assert.match(styles, /\.share-layout\s*\{[^}]*max-width:\s*1484px/s);
});

test("MVP screens keep the shared component system and avoid sidebar UI", () => {
  for (const componentName of [
    "PageToolbar",
    "PrimaryButton",
    "PrimaryBar",
    "Panel",
    "DisclosurePanel",
    "Chip",
    "StatusBadge",
    "ScoreRing",
    "ProgressMini",
  ]) {
    assert.match(sourceBundle, new RegExp(`function ${componentName}\\(`));
  }

  for (const routeName of [
    "PracticePage",
    "ResultPage",
    "FeedbackPage",
    "SharePage",
    "ComparePage",
  ]) {
    assert.match(functionBody(routeName), /<PageToolbar\b/, `${routeName} uses the shared toolbar`);
  }

  const previewPage = functionBody("PreviewPage");
  assert.doesNotMatch(previewPage, /<PageToolbar\b/, "PreviewPage removes toolbar pill controls");
  assert.match(previewPage, /preview-scenario-panel/, "PreviewPage uses the readiness board");

  for (const routeName of ["RoleSelectPage", "DifficultyPage", "SetupPage"]) {
    assert.match(functionBody(routeName), /<SetupFlowActions\b/, `${routeName} uses the shared setup actions`);
    assert.match(functionBody(routeName), /<SetupSelectionSummary\b/, `${routeName} uses the shared selection summary`);
  }

  assert.doesNotMatch(sourceBundle, /className="ai-status-badge"/);
  assert.doesNotMatch(sourceBundle, /sidebar/i);
  assert.doesNotMatch(styles, /sidebar/i);
  assert.doesNotMatch(appSource, /<aside\b/i);
});

test("home uses the radial four-Fit summary and concise, action-led writing", () => {
  assert.match(sourceBundle, /function HomeRadarChart\(/);
  assert.match(sourceBundle, /mini-line-fill-\$\{tone\}/);
  assert.match(sourceBundle, /className="mini-line-area"/);
  assert.match(sourceBundle, /stopOpacity="\.36"/);
  assert.match(sourceBundle, /AI와 함께/);
  assert.match(sourceBundle, /연습해요/);
  assert.doesNotMatch(sourceBundle, /home-trust-row/);
  assert.match(styles, /\.home-radar-chart/);
  assert.match(styles, /\.mini-line-chart\s*\{[^}]*height:\s*80px/s);
  assert.match(styles, /\.home-page\s*\{[^}]*--home-content-rail:\s*1560px/s);
  assert.match(styles, /\.home-fit-card > span\s*\{[^}]*font-size:\s*16px[^}]*font-weight:\s*600/s);
  assert.match(styles, /\.top-nav:hover/);
});

test("simulator setup follows the three-step, two-column supplied mockup contract", () => {
  assert.match(sourceBundle, /const setupSteps = \[\["1", "기본 설정"\], \["2", "상황 선택"\], \["3", "목표 선택"\]\]/);
  assert.match(sourceBundle, /setup-role-colleague\.webp/);
  assert.match(sourceBundle, /setup-role-manager\.webp/);
  assert.match(sourceBundle, /setup-role-executive\.webp/);
  assert.match(sourceBundle, /setup-role-partner\.webp/);
  assert.match(sourceBundle, /setup-difficulty-basic\.webp/);
  assert.match(sourceBundle, /setup-difficulty-pressure\.webp/);
  assert.match(sourceBundle, /const scenarioCatalogByRole =/);
  assert.match(sourceBundle, /const practiceGoals =/);
  assert.match(sourceBundle, /const scenariosForRole =/);
  assert.match(sourceBundle, /setup-scenario-server\.webp/);
  assert.match(sourceBundle, /setup-goal-prep\.webp/);
  assert.match(functionBody("RoleSelectPage"), /variant="portrait"/);
  assert.match(functionBody("RoleSelectPage"), /variant="difficulty"/);
  assert.match(functionBody("DifficultyPage"), /variant="scenario-catalog"/);
  assert.match(functionBody("DifficultyPage"), /columns="four"/);
  assert.match(functionBody("SetupPage"), /variant="goal-catalog"/);
  assert.match(functionBody("SetupPage"), /columns="five"/);
  assert.match(styles, /\.setup-flow-layout\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(390px, 0\.56fr\)/s);
  assert.match(styles, /\.choice-card\.portrait\s*\{[^}]*flex-direction:\s*column/s);
  assert.match(styles, /\.setup-summary-panel\s*\{[^}]*position:\s*sticky/s);
  assert.match(styles, /\.home-hero\s*\{[^}]*background:\s*#FFF\s+url\("\/src\/assets\/hero-device-background\.png"\)/s);
  assert.match(styles, /\.choice-card\.scenario strong\s*\{[^}]*overflow-wrap:\s*anywhere/s);
  assert.match(styles, /\.choice-card\.scenario-catalog,\s*\.choice-card\.goal-catalog\s*\{[^}]*flex-direction:\s*column/s);
  assert.match(styles, /\.goal-choice-section \.choice-grid\.five \{ grid-template-columns:\s*1fr;/);
  assert.match(functionBody("SetupSelectionSummary"), /summary-asset/);
  assert.match(sourceBundle, /loading="lazy"/);
});

test("home keeps one primary practice action and centers the benefit explanation", () => {
  const homePage = functionBody("HomePage");
  assert.doesNotMatch(homePage, /4-Fit 살펴보기/);
  assert.doesNotMatch(homePage, /화면 미리 보기/);
  assert.match(homePage, /leadingIcon=\{false\}/);
  assert.doesNotMatch(homePage, /home-visual/);
  assert.match(styles, /\.hero-actions \.primary-button\s*\{[^}]*justify-content:\s*center/s);
  assert.match(styles, /\.hero-actions \.primary-button svg\s*\{[^}]*position:\s*absolute[^}]*right:\s*28px/s);
  assert.match(styles, /\.home-hero\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)[^}]*hero-device-background\.png/s);
  assert.match(styles, /\.home-advantage-card\s*\{[^}]*align-items:\s*center/s);
  assert.match(styles, /\.home-advantage-card\s*\{[^}]*text-align:\s*center/s);
});
