const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const sourcePath = path.join(
  process.cwd(),
  "app/lib/pmPdfEvidence.ts",
);
const source = fs.readFileSync(sourcePath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
  fileName: sourcePath,
}).outputText;
const loadedModule = { exports: {} };
const loadCompiledModule = new Function(
  "module",
  "exports",
  compiled,
);
loadCompiledModule(loadedModule, loadedModule.exports);

const { PM_PDF_EVIDENCE_LIMIT, selectPMPdfEvidence } = loadedModule.exports;

const image = (id, imageType) => ({
  id,
  image_type: imageType,
  image_url: `https://pcms.live/media/${id}.jpg`,
});

test("selects no evidence when a PM has no images", () => {
  assert.deepEqual(selectPMPdfEvidence([]), {
    items: [],
    total: 0,
    truncated: false,
  });
});

test("supports before-only and after-only evidence", () => {
  assert.deepEqual(
    selectPMPdfEvidence([image(1, "before"), image(2, "before")]).items.map(
      ({ label }) => label,
    ),
    ["Before 1", "Before 2"],
  );
  assert.deepEqual(
    selectPMPdfEvidence([image(3, "after")]).items.map(({ label }) => label),
    ["After 1"],
  );
});

test("orders mixed evidence with all before images first", () => {
  const selection = selectPMPdfEvidence([
    image(1, "after"),
    image(2, "before"),
    image(3, "after"),
    image(4, "before"),
  ]);

  assert.deepEqual(
    selection.items.map(({ key, label }) => [key, label]),
    [
      ["before-2", "Before 1"],
      ["before-4", "Before 2"],
      ["after-1", "After 1"],
      ["after-3", "After 2"],
    ],
  );
});

test("caps evidence at ten and reports overflow", () => {
  const images = [
    ...Array.from({ length: 6 }, (_, index) => image(index + 1, "before")),
    ...Array.from({ length: 6 }, (_, index) => image(index + 7, "after")),
  ];
  const selection = selectPMPdfEvidence(images);

  assert.equal(selection.items.length, PM_PDF_EVIDENCE_LIMIT);
  assert.equal(selection.total, 12);
  assert.equal(selection.truncated, true);
  assert.deepEqual(
    selection.items.map(({ label }) => label),
    [
      "Before 1",
      "Before 2",
      "Before 3",
      "Before 4",
      "Before 5",
      "Before 6",
      "After 1",
      "After 2",
      "After 3",
      "After 4",
    ],
  );
});

test("uses a larger reported total for an additive or anomalous payload", () => {
  const selection = selectPMPdfEvidence([image(1, "before")], 11);

  assert.equal(selection.items.length, 1);
  assert.equal(selection.total, 11);
  assert.equal(selection.truncated, true);
});
