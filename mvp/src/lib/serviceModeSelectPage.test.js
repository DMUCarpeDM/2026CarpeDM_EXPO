import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { withServiceModeSelectBrowser } from "./serviceModeSelectPageBrowser.js";
import { ServiceModeSelectAssertions } from "./serviceModeSelectPageHarness.js";

const mvpRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const serviceModePagePath = resolve(mvpRoot, "src/pages/setup/ServiceModeSelectPage.jsx");
const sharedCardPath = resolve(mvpRoot, "src/components/setup/SetupComponents.jsx");
const baseStylesPath = resolve(mvpRoot, "src/styles/base.css");
const setupStylesPath = resolve(mvpRoot, "src/styles/setup-flow.css");
const selectorStylesPath = resolve(mvpRoot, "src/styles/service-mode-select.css");
const harnessPath = resolve(mvpRoot, "src/lib/serviceModeSelectPageHarness.js");
const browserHarnessPath = resolve(mvpRoot, "src/lib/serviceModeSelectPageBrowser.js");
const testPath = fileURLToPath(import.meta.url);
const stylesPath = resolve(mvpRoot, "src/styles.css");
const artifactParent = resolve(mvpRoot, "../.omo/evidence/task-2-browser");
const serviceModeIds = ["interview", "training", "workplace"];
const serviceModeLabels = ["면접", "직업훈련", "직장대화"];

async function sha256(filePath) {
  const content = await readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

async function readSourceHashes() {
  return {
    page: await sha256(serviceModePagePath),
    sharedCard: await sha256(sharedCardPath),
    baseStyles: await sha256(baseStylesPath),
    setupStyles: await sha256(setupStylesPath),
    selectorStyles: await sha256(selectorStylesPath),
    harness: await sha256(harnessPath),
    browserHarness: await sha256(browserHarnessPath),
    test: await sha256(testPath),
  };
}

async function createFreshArtifactRoot() {
  await mkdir(artifactParent, { recursive: true });
  const timestamp = new Date().toISOString().replaceAll(/[-:.]/g, "");
  const artifactRoot = await mkdtemp(join(artifactParent, `run-${timestamp}-`));
  assert.deepEqual(await readdir(artifactRoot), [], "browser artifact run starts empty");
  return artifactRoot;
}

async function writeArtifactResult(artifactRoot, result) {
  await writeFile(join(artifactRoot, "results.json"), `${JSON.stringify(result, null, 2)}\n`);
}

function serializeError(error) {
  return {
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  };
}

async function runArtifactScenario(name, run) {
  const artifactRoot = await createFreshArtifactRoot();
  const result = {
    status: "running",
    scenario: name,
    artifactRoot,
    sourceHashes: await readSourceHashes(),
  };
  let failure;
  try {
    result.observed = await run(artifactRoot);
    result.status = "passed";
  } catch (error) {
    failure = error;
    result.status = "failed";
    result.error = serializeError(error);
  }
  try {
    await writeArtifactResult(artifactRoot, result);
  } catch (error) {
    if (failure) throw new AggregateError([failure, error], "Scenario and artifact write failed");
    throw error;
  }
  console.log(`ServiceModeSelectPage browser artifacts: ${artifactRoot}`);
  console.log(JSON.stringify(result));
  if (failure) throw failure;
  return artifactRoot;
}

function runSelectorBrowser(artifactRoot, run) {
  return withServiceModeSelectBrowser({
    mvpRoot,
    serviceModePagePath,
    stylesPath,
    serviceModeLabels,
    serviceModeIds,
    run: ({ page }) => {
      const assertions = new ServiceModeSelectAssertions(page, serviceModeLabels, serviceModeIds);
      return run({ artifactRoot, assertions });
    },
  });
}

test(
  "service selector keeps a card-only accessible DOM contract",
  { timeout: 60_000 },
  async () => {
    await runArtifactScenario("card-only DOM contract", (artifactRoot) => runSelectorBrowser(
      artifactRoot,
      ({ assertions }) => assertions.initialContract(),
    ));
  },
);

test(
  "service selector activates every card with keyboard input",
  { timeout: 60_000 },
  async () => {
    await runArtifactScenario("keyboard activation", (artifactRoot) => runSelectorBrowser(
      artifactRoot,
      ({ assertions }) => assertions.keyboardActivation(),
    ));
  },
);

test(
  "service selector clears card focus and selection when the view returns",
  { timeout: 60_000 },
  async () => {
    await runArtifactScenario("return clears focus and selection", (artifactRoot) => runSelectorBrowser(
      artifactRoot,
      ({ assertions }) => assertions.returnClearsFocusAndSelection(),
    ));
  },
);

test(
  "service selector captures coherent desktop and mobile evidence",
  { timeout: 60_000 },
  async () => {
    await runArtifactScenario("responsive selector evidence", async (artifactRoot) => (
      runSelectorBrowser(artifactRoot, async ({ assertions }) => ({
        initial: await assertions.initialContract(),
        keyboard: await assertions.keyboardActivation(),
        returned: await assertions.returnClearsFocusAndSelection(),
        viewports: {
          desktop: await assertions.captureDesktop(artifactRoot),
          mobile: await assertions.captureMobile(artifactRoot),
        },
      }))
    ));
  },
);
