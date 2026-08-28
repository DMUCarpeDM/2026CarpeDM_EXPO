import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function loadResolver() {
  const catalogSource = readFileSync(new URL("../data/setupCatalog.js", import.meta.url), "utf8")
    .replace(/^import\s+(?:\w+|\{[^}]+\})\s+from\s+"[^"]+";$/gm, (statement) => {
      const binding = statement.match(/^import\s+(\w+|\{\s*([^}]+)\s*\})/);
      if (binding?.[2]) return binding[2].split(",").map((name) => `const ${name.trim()} = "${name.trim()}";`).join("\n");
      return `const ${binding[1]} = "${binding[1]}";`;
    })
    .replace(/export\s+(?=(?:const|function)\s)/g, "");
  const { serviceModes } = new Function(`${catalogSource}\nreturn { serviceModes };`)();
  const resolverSource = readFileSync(new URL("./serviceModeContext.js", import.meta.url), "utf8")
    .replace(/^import\s+\{[^}]+\}\s+from\s+"[^"]+";$/m, "")
    .replace(/export\s+/g, "");
  return new Function("serviceModes", `${resolverSource}\nreturn { resolveServiceMode, workplaceServiceMode };`)(serviceModes);
}

test("resolveServiceMode returns the catalog entry for each service ID", () => {
  const { resolveServiceMode } = loadResolver();

  assert.equal(resolveServiceMode("interview").id, "interview");
  assert.equal(resolveServiceMode("training").id, "training");
  assert.equal(resolveServiceMode("workplace").id, "workplace");
});

test("resolveServiceMode uses the shared workplace entry for missing or invalid IDs", () => {
  const { resolveServiceMode, workplaceServiceMode } = loadResolver();

  for (const invalidId of [undefined, null, "", "unknown", 5, {}, false]) {
    assert.strictEqual(resolveServiceMode(invalidId), workplaceServiceMode);
  }
});
