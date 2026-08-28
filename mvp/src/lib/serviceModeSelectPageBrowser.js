import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { chromium } from "playwright";
import { createServer } from "vite";
import { waitForServiceModeCards } from "./serviceModeSelectPageHarness.js";

const browserTimeout = 10_000;

function viteFsImport(filePath) {
  return `/@fs/${filePath.replaceAll("\\", "/")}`;
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

async function closeHarnessResources(server, harnessRoot) {
  const results = await Promise.allSettled([
    Promise.resolve().then(() => server?.close()),
    rm(harnessRoot, { recursive: true, force: true }),
  ]);
  const labels = ["Vite", "temp"];
  const failures = results.flatMap((result, index) => {
    if (result.status === "fulfilled") return [];
    return [`${labels[index]}: ${errorMessage(result.reason)}`];
  });
  if (failures.length > 0) {
    throw new Error(`Harness cleanup failed: ${failures.join("; ")}`);
  }
}

async function waitForReadiness(url) {
  let lastError;
  const startedAt = Date.now();
  while (Date.now() - startedAt < browserTimeout) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolveReady) => setTimeout(resolveReady, 50));
  }
  try {
    const response = await fetch(url);
    if (response.ok) return;
    throw new Error(`Vite test harness readiness failed: ${response.status}`, {
      cause: lastError,
    });
  } catch (error) {
    throw new Error("Vite test harness readiness request failed", { cause: error });
  }
}

export async function startServiceModeSelectHarness({
  mvpRoot,
  serviceModePagePath,
  stylesPath,
}) {
  const tempRoot = await mkdtemp(join(tmpdir(), "service-mode-select-harness-"));
  const harnessRoot = await realpath(tempRoot);
  let server;
  try {
    const pageImport = viteFsImport(serviceModePagePath);
    const stylesImport = viteFsImport(stylesPath);
    await writeFile(join(harnessRoot, "index.html"), `
      <link rel="icon" href="data:,">
      <main id="root"></main>
      <script type="module" src="/main.jsx"></script>
    `);
    await writeFile(join(harnessRoot, "main.jsx"), `
      import React, { useState } from "react";
      import { createRoot } from "react-dom/client";
      import "${stylesImport}";
      import { ServiceModeSelectPage } from "${pageImport}";

      const selectedIds = [];
      window.__serviceModeSelectIds = selectedIds;

      function Harness() {
        const [selectedServiceModeId, setSelectedServiceModeId] = useState(null);
        const [renderKey, setRenderKey] = useState(0);
        const onSelect = (id) => {
          selectedIds.push(id);
          setSelectedServiceModeId(id);
        };
        window.__serviceModeSelectReturn = () => setRenderKey((value) => value + 1);
        return <ServiceModeSelectPage key={renderKey} onSelect={onSelect} selectedServiceModeId={selectedServiceModeId} />;
      }

      createRoot(document.getElementById("root")).render(<Harness />);
    `);
    server = await createServer({
      root: harnessRoot,
      plugins: [react()],
      logLevel: "error",
      server: {
        fs: { allow: [harnessRoot, mvpRoot] },
        host: "127.0.0.1",
        port: 0,
      },
      resolve: {
        alias: {
          react: resolve(mvpRoot, "node_modules/react"),
          "react-dom": resolve(mvpRoot, "node_modules/react-dom"),
          "framer-motion": resolve(mvpRoot, "node_modules/framer-motion"),
          "reicon-react": resolve(mvpRoot, "node_modules/reicon-react"),
        },
      },
      optimizeDeps: { include: ["react", "react-dom", "framer-motion", "reicon-react"] },
    });
    await server.listen();
    const address = server.httpServer.address();
    const port = typeof address === "object" && address ? address.port : null;
    if (!port) throw new Error("Vite test harness did not expose a port");
    const url = `http://127.0.0.1:${port}/`;
    await waitForReadiness(url);
    let closed = false;
    return {
      url,
      async close() {
        if (closed) return;
        closed = true;
        await closeHarnessResources(server, harnessRoot);
      },
    };
  } catch (error) {
    await closeHarnessResources(server, harnessRoot);
    throw error;
  }
}

export async function launchServiceModeChrome() {
  let chromeError;
  try {
    return await chromium.launch({ channel: "chrome", headless: true });
  } catch (error) {
    chromeError = error;
  }
  try {
    return await chromium.launch({ headless: true });
  } catch (fallbackError) {
    throw new AggregateError(
      [chromeError, fallbackError],
      "Could not launch Chrome or Playwright Chromium",
    );
  }
}

export async function closeServiceModeBrowserResources(resources) {
  const failures = [];
  for (const [label, resource] of resources) {
    if (!resource) continue;
    try {
      await resource.close();
    } catch (error) {
      failures.push(`${label}: ${errorMessage(error)}`);
    }
  }
  if (failures.length > 0) {
    throw new Error(`Browser cleanup failed: ${failures.join("; ")}`);
  }
}

export async function withServiceModeSelectBrowser({
  mvpRoot,
  serviceModePagePath,
  stylesPath,
  viewport = { width: 1280, height: 900 },
  run,
}) {
  let harness;
  let browser;
  let page;
  let value;
  let runError;
  try {
    harness = await startServiceModeSelectHarness({ mvpRoot, serviceModePagePath, stylesPath });
    browser = await launchServiceModeChrome();
    page = await browser.newPage({ viewport });
    page.setDefaultTimeout(browserTimeout);
    await page.goto(harness.url, { waitUntil: "domcontentloaded" });
    await waitForServiceModeCards(page);
    value = await run({ page, harness });
  } catch (error) {
    runError = error;
  }
  let cleanupError;
  try {
    await closeServiceModeBrowserResources([["page", page], ["browser", browser], ["harness", harness]]);
  } catch (error) {
    cleanupError = error;
  }
  if (runError && cleanupError) throw new AggregateError([runError, cleanupError], "Browser scenario and cleanup failed");
  if (runError) throw runError;
  if (cleanupError) throw cleanupError;
  return value;
}
