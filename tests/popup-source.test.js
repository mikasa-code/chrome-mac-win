const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.join(__dirname, "..");

function readText(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ");
}

function getFunctionBody(source, functionName) {
  const start = source.indexOf("function " + functionName + "(");
  assert.notEqual(start, -1, "Expected function " + functionName + " to exist.");

  const bodyStart = source.indexOf("{", start);
  assert.notEqual(bodyStart, -1, "Expected function body for " + functionName + ".");

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") {
      depth += 1;
    } else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(bodyStart + 1, index);
      }
    }
  }

  assert.fail("Expected closing brace for function " + functionName + ".");
}

test("popup HTML defines required controls and dependencies", () => {
  const html = readText("popup.html");
  const compactHtml = normalizeWhitespace(html);

  assert.match(html, /<!doctype html>/i);
  assert.match(compactHtml, /<link[^>]+href=["']styles\/popup\.css["']/);
  assert.match(compactHtml, /<form[^>]+id=["']domain-form["']/);
  assert.match(compactHtml, /<input[^>]+id=["']domain-input["']/);
  assert.match(
    compactHtml,
    /<[^>]+id=["']domain-error["'][^>]+role=["']alert["']|<[^>]+role=["']alert["'][^>]+id=["']domain-error["']/,
  );
  assert.match(compactHtml, /<[^>]+id=["']domain-list["']/);
  assert.match(compactHtml, /<[^>]+id=["']empty-state["']/);

  const scriptSources = Array.from(
    html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*><\/script>/gi),
    (match) => match[1],
  );
  assert.deepEqual(scriptSources, [
    "src/constants.js",
    "src/domain-utils.js",
    "src/domain-store.js",
    "src/popup.js",
  ]);
});

test("popup JS wires storage, domain store actions, and safe text rendering", () => {
  const source = readText("src/popup.js");

  assert.match(source, /^\s*\(\s*function\s*\(\s*\)\s*{/);
  assert.match(source, /ChromeWinSpoofConstants/);
  assert.match(source, /ChromeWinSpoofDomainStore/);
  assert.match(source, /STORAGE_KEY/);
  assert.match(source, /chrome\.storage\.local\.get/);
  assert.match(source, /chrome\.storage\.local\.set/);
  assert.match(source, /addDomainRecord/);
  assert.match(source, /removeDomainRecord/);
  assert.match(source, /setDomainEnabled/);
  assert.match(source, /textContent/);
  assert.doesNotMatch(source, /innerHTML/);
});

test("popup JS updates local records before persisting storage", () => {
  const source = readText("src/popup.js");
  const saveBody = getFunctionBody(source, "saveRecords");
  const stateUpdateIndex = saveBody.indexOf("currentRecords = records");
  const storageSetIndex = saveBody.indexOf("chrome.storage.local.set");

  assert.notEqual(stateUpdateIndex, -1);
  assert.notEqual(storageSetIndex, -1);
  assert.ok(
    stateUpdateIndex < storageSetIndex,
    "saveRecords should update currentRecords before queueing storage writes.",
  );
});

test("popup JS bases empty state on renderable domain records", () => {
  const source = readText("src/popup.js");
  const renderBody = getFunctionBody(source, "renderRecords");

  assert.match(renderBody, /validRecords\s*=\s*currentRecords\.filter/);
  assert.match(renderBody, /record\s*&&\s*record\.domain/);
  assert.match(renderBody, /emptyState\.hidden\s*=\s*validRecords\.length\s*>\s*0/);
  assert.doesNotMatch(renderBody, /emptyState\.hidden\s*=\s*currentRecords\.length\s*>\s*0/);
});

test("popup JS gives domain-specific accessible names to row controls", () => {
  const source = readText("src/popup.js");

  assert.match(
    source,
    /checkbox\.setAttribute\(\s*["']aria-label["']\s*,\s*["']Enable spoofing for ["']\s*\+\s*record\.domain\s*\)/,
  );
  assert.match(
    source,
    /removeButton\.setAttribute\(\s*["']aria-label["']\s*,\s*["']Remove ["']\s*\+\s*record\.domain\s*\)/,
  );
});

test("popup JS disables form actions until stored records are loaded", () => {
  const source = readText("src/popup.js");
  const loadIndex = source.indexOf("chrome.storage.local.get");
  const disableIndex = source.indexOf("setFormEnabled(false)");
  const submitIndex = source.indexOf('form.addEventListener("submit"');
  const guardIndex = source.indexOf("if (!isLoaded)", submitIndex);
  const addIndex = source.indexOf("addDomainRecord", submitIndex);
  const loadedIndex = source.indexOf("isLoaded = true", loadIndex);
  const enableIndex = source.indexOf("setFormEnabled(true)", loadIndex);

  assert.match(source, /var\s+isLoaded\s*=\s*false/);
  assert.match(source, /submitButton\s*=\s*form\.querySelector\(\s*["']button\[type=["']submit["']\]["']\s*\)/);
  assert.match(source, /function\s+setFormEnabled\s*\(\s*enabled\s*\)/);
  assert.match(source, /input\.disabled\s*=\s*!\s*enabled/);
  assert.match(source, /submitButton\.disabled\s*=\s*!\s*enabled/);
  assert.notEqual(disableIndex, -1);
  assert.notEqual(loadIndex, -1);
  assert.ok(disableIndex < loadIndex, "Form controls should be disabled before storage load starts.");
  assert.notEqual(guardIndex, -1);
  assert.notEqual(addIndex, -1);
  assert.ok(guardIndex < addIndex, "Submit handler should guard before adding records.");
  assert.notEqual(loadedIndex, -1);
  assert.notEqual(enableIndex, -1);
  assert.ok(loadedIndex < enableIndex, "Controls should be enabled only after load state is true.");
});

test("manifest default popup points to an existing popup resource", () => {
  const manifest = JSON.parse(readText("manifest.json"));
  const popupPath = manifest.action && manifest.action.default_popup;

  assert.equal(popupPath, "popup.html");
  assert.equal(fs.existsSync(path.join(repoRoot, popupPath)), true);
});
