import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { CHROMELESS_VIEWS } from "./serviceEntryRoute.js";

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
  "../styles/dashboard.css",
  "../styles/shadcn-ui.css",
  "../styles/mode-home.css",
];
const styles = stylesheetFiles.map((file) => readFileSync(new URL(file, import.meta.url), "utf8")).join("\n");
const appSource = readFileSync(new URL("../App.jsx", import.meta.url), "utf8");
const setupCatalogSource = readFileSync(new URL("../data/setupCatalog.js", import.meta.url), "utf8");
const setupAssetFiles = [
  "setup-icons/job-developer.webp",
  "setup-icons/job-cafe-partner.webp",
  "setup-icons/job-counselor.webp",
  "setup-icons/difficulty-basic.webp",
  "setup-icons/difficulty-rude-customer.webp",
  "setup-icons/difficulty-extreme-rude-customer.webp",
  "setup-icons/scenario-kickoff.webp",
  "setup-icons/scenario-feature-priority.webp",
  "setup-icons/scenario-scope-schedule.webp",
];
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
  readFileSync(new URL("../components/report/DashboardShell.jsx", import.meta.url), "utf8"),
  readFileSync(new URL("../components/report/Charts.jsx", import.meta.url), "utf8"),
  setupCatalogSource,
  readFileSync(new URL("../components/ui/IconGlyph.jsx", import.meta.url), "utf8"),
  readFileSync(new URL("../components/navigation/navigationConfig.js", import.meta.url), "utf8"),
  readFileSync(new URL("../components/navigation/AppNavigation.jsx", import.meta.url), "utf8"),
  readFileSync(new URL("../components/setup/SetupComponents.jsx", import.meta.url), "utf8"),
  readFileSync(new URL("../pages/setup/RoleSelectPage.jsx", import.meta.url), "utf8"),
  readFileSync(new URL("../pages/setup/ScenarioSelectPage.jsx", import.meta.url), "utf8"),
  readFileSync(new URL("../pages/setup/DifficultyPage.jsx", import.meta.url), "utf8"),
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

test("Analysis views reuse the app navigation and shared component system", () => {
  for (const componentName of [
    "PageToolbar",
    "PrimaryButton",
    "PrimaryBar",
    "Panel",
    "DisclosurePanel",
    "Chip",
    "ScoreRing",
    "ProgressMini",
    "RadarChart",
    "TrendChart",
  ]) {
    assert.match(sourceBundle, new RegExp(`function ${componentName}\\(`));
  }

  // 분석 계열 화면은 설정 화면과 같은 전역 상단 네비게이션을 사용하고, 전용 사이드바는 쓰지 않아요.
  for (const routeName of ["ResultPage", "FeedbackPage", "ComparePage"]) {
    assert.doesNotMatch(functionBody(routeName), /<ReportShell\b/, `${routeName} avoids the dashboard shell`);
    assert.match(functionBody(routeName), /<PageToolbar\b/, `${routeName} uses the shared page toolbar`);
  }
  assert.deepEqual([...CHROMELESS_VIEWS], ["service"], "only the service selector omits shared navigation chrome");
  assert.match(functionBody("PracticePage"), /practice-contextbar/, "PracticePage keeps only its live context controls");
  assert.match(functionBody("PracticePage"), /finishSpeaking[\s\S]*setShowQuestionOverlay\(false\)/, "PracticePage closes the AI question overlay when TTS finishes");
  // 저장·공유 화면은 기존 공용 툴바를 유지해요.
  assert.match(functionBody("SharePage"), /<PageToolbar\b/, "SharePage keeps the shared toolbar");

  const previewPage = functionBody("PreviewPage");
  assert.doesNotMatch(previewPage, /<PageToolbar\b/, "PreviewPage removes toolbar pill controls");
  assert.match(previewPage, /preview-scenario-panel/, "PreviewPage uses the readiness board");

  for (const routeName of ["RoleSelectPage", "ScenarioSelectPage", "DifficultyPage"]) {
    assert.match(functionBody(routeName), /<SetupFlowActions\b/, `${routeName} uses the shared setup actions`);
    assert.match(functionBody(routeName), /<SetupSelectionSummary\b/, `${routeName} uses the shared selection summary`);
  }

  // 대시보드 셸 코드는 남아 있어도 현재 전시 흐름에서는 렌더하지 않아요.
  assert.match(styles, /\.dashboard-sidebar/);
  assert.match(sourceBundle, /<aside className="dashboard-sidebar"/);
});

test("home uses three mode layouts on one shared Shadcn-style component system", () => {
  assert.match(sourceBundle, /function InterviewHome\(/);
  assert.match(sourceBundle, /function TrainingHome\(/);
  assert.match(sourceBundle, /function WorkplaceHome\(/);
  assert.match(sourceBundle, /<Button\b/);
  assert.match(sourceBundle, /<Card\b/);
  assert.match(sourceBundle, /<Progress\b/);
  assert.match(sourceBundle, /<Accordion\b/);
  assert.match(styles, /--accent-blue:\s*#0071e3/);
  assert.match(styles, /--accent-orange:\s*#f05a24/);
  assert.match(styles, /--accent-violet:\s*#6e5ed2/);
  assert.doesNotMatch(styles, /--accent-green:/);
  assert.match(styles, /\.interview-hero/);
  assert.match(styles, /\.training-task-board/);
  assert.match(styles, /\.workplace-workspace/);
});

test("setup catalog keeps every rendered role and difficulty image available", () => {
  for (const assetName of setupAssetFiles) {
    assert.match(setupCatalogSource, new RegExp(assetName.replace(".", "\\.")), `${assetName} is imported by the catalog`);
    assert.ok(existsSync(new URL(`../assets/${assetName}`, import.meta.url)), `${assetName} exists for Vite to bundle`);
  }
});

test("home keeps each mode action-led and reuses shared section primitives", () => {
  const homePage = functionBody("HomePage");
  assert.match(homePage, /mode-home-page--\$\{mode\.id\}/);
  assert.match(homePage, /<InterviewHome onNext=\{onNext\}/);
  assert.match(homePage, /<TrainingHome onNext=\{onNext\}/);
  assert.match(homePage, /<WorkplaceHome onNext=\{onNext\}/);
  assert.match(sourceBundle, /function SectionIntro\(/);
  assert.match(sourceBundle, /function ProcessCard\(/);
  assert.match(sourceBundle, /function FitMetric\(/);
  assert.match(sourceBundle, /function FooterCta\(/);
  assert.match(styles, /\.mode-footer-cta\s*\{/);
  assert.match(styles, /\.mode-actions\s*\{/);
});
