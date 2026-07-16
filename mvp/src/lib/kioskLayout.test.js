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
  "../styles/dashboard.css",
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
  readFileSync(new URL("../components/report/DashboardShell.jsx", import.meta.url), "utf8"),
  readFileSync(new URL("../components/report/Charts.jsx", import.meta.url), "utf8"),
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

test("Analysis views use the dashboard shell while keeping the shared component system", () => {
  for (const componentName of [
    "PageToolbar",
    "PrimaryButton",
    "PrimaryBar",
    "Panel",
    "DisclosurePanel",
    "Chip",
    "ScoreRing",
    "ProgressMini",
    "ReportShell",
    "DashboardSidebar",
    "RadarChart",
    "TrendChart",
  ]) {
    assert.match(sourceBundle, new RegExp(`function ${componentName}\\(`));
  }

  // 분석 계열 화면(성과 리포트·비교 분석·상세 분석)은 좌측 사이드바 대시보드 셸을 사용해요.
  for (const routeName of ["ResultPage", "FeedbackPage", "ComparePage"]) {
    assert.match(functionBody(routeName), /<ReportShell\b/, `${routeName} uses the dashboard shell`);
  }
  // 연습 화면은 전용 실시간 상단바를 사용해요.
  assert.match(functionBody("PracticePage"), /practice-topbar/, "PracticePage uses its live top bar");
  // 저장·공유 화면은 기존 공용 툴바를 유지해요.
  assert.match(functionBody("SharePage"), /<PageToolbar\b/, "SharePage keeps the shared toolbar");

  const previewPage = functionBody("PreviewPage");
  assert.doesNotMatch(previewPage, /<PageToolbar\b/, "PreviewPage removes toolbar pill controls");
  assert.match(previewPage, /preview-scenario-panel/, "PreviewPage uses the readiness board");

  for (const routeName of ["RoleSelectPage", "DifficultyPage", "SetupPage"]) {
    assert.match(functionBody(routeName), /<SetupFlowActions\b/, `${routeName} uses the shared setup actions`);
    assert.match(functionBody(routeName), /<SetupSelectionSummary\b/, `${routeName} uses the shared selection summary`);
  }

  // 대시보드 사이드바 셸을 도입했어요(피그마 대시보드 디자인 반영).
  assert.match(styles, /\.dashboard-sidebar/);
  assert.match(sourceBundle, /<aside className="dashboard-sidebar"/);
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
