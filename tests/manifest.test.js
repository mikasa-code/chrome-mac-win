const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const repoRoot = path.join(__dirname, "..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function deferred() {
  let resolve;
  const promise = new Promise((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) {
      return;
    }

    await new Promise((resolve) => setImmediate(resolve));
  }

  assert.equal(predicate(), true);
}

test("manifest defines required MV3 extension wiring", () => {
  const manifest = readJson("manifest.json");

  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, "Chrome Windows Spoof");
  assert.equal(manifest.version, "0.1.0");
  assert.equal(
    manifest.description,
    "Spoof selected domains as Windows Chrome from macOS Chrome.",
  );
  assert.deepEqual(manifest.permissions, [
    "storage",
    "declarativeNetRequestWithHostAccess",
  ]);
  assert.deepEqual(manifest.host_permissions, ["<all_urls>"]);
  assert.deepEqual(manifest.action, {
    default_title: "Windows Spoof",
    default_popup: "popup.html",
  });
  assert.deepEqual(manifest.background, {
    service_worker: "src/background.js",
  });
});

test("manifest wires content script and page spoof web accessible resource", () => {
  const manifest = readJson("manifest.json");

  assert.deepEqual(manifest.content_scripts, [
    {
      matches: ["<all_urls>"],
      js: ["src/constants.js", "src/domain-utils.js", "src/content.js"],
      run_at: "document_start",
    },
  ]);
  assert.deepEqual(manifest.web_accessible_resources, [
    {
      resources: ["src/page-spoof.js"],
      matches: ["<all_urls>"],
    },
  ]);
});

test("background imports dependencies and listens for extension refresh events", () => {
  const source = readText("src/background.js");

  assert.match(
    source,
    /importScripts\(\s*["']constants\.js["']\s*,\s*["']domain-utils\.js["']\s*,\s*["']rules\.js["']\s*\)/,
  );
  assert.match(source, /self\.ChromeWinSpoofConstants/);
  assert.match(source, /self\.ChromeWinSpoofRules/);
  assert.match(source, /chrome\.runtime\.onInstalled\.addListener/);
  assert.match(source, /chrome\.runtime\.onStartup\.addListener/);
  assert.match(source, /chrome\.storage\.onChanged\.addListener/);
  assert.match(source, /areaName\s*===\s*["']local["']/);
  assert.match(source, /changes\[STORAGE_KEY\]/);
});

test("background event listeners route refresh failures through a catch handler", () => {
  const source = readText("src/background.js");

  assert.match(source, /function\s+runRefreshDynamicRules\s*\(\)\s*{/);
  assert.match(
    source,
    /console\.error\(\s*["']Failed to refresh dynamic rules["']\s*,\s*error\s*\)/,
  );
  assert.match(source, /chrome\.runtime\.onInstalled\.addListener\(runRefreshDynamicRules\)/);
  assert.match(source, /chrome\.runtime\.onStartup\.addListener\(runRefreshDynamicRules\)/);
  assert.match(
    source,
    /if\s*\(\s*areaName\s*===\s*["']local["']\s*&&\s*changes\[STORAGE_KEY\]\s*\)\s*{\s*runRefreshDynamicRules\(\);/,
  );
  assert.doesNotMatch(
    source,
    /chrome\.runtime\.on(?:Installed|Startup)\.addListener\(refreshDynamicRules\)/,
  );
});

test("background serializes queued refreshes so latest storage wins", async () => {
  const source = readText("src/background.js");
  const listeners = {};
  const firstUpdate = deferred();
  const updateCalls = [];
  const storageSnapshots = [
    [{ domain: "stale.example", enabled: true }],
    [{ domain: "latest.example", enabled: true }],
  ];
  let activeUpdates = 0;
  let overlappingUpdates = false;
  let appliedRules = [];

  const context = {
    importScripts() {},
    self: {
      ChromeWinSpoofConstants: {
        STORAGE_KEY: "spoofDomains",
      },
      ChromeWinSpoofRules: {
        buildDynamicRules(records) {
          return records.map((record) => ({ domain: record.domain }));
        },
      },
    },
    console: {
      error() {},
    },
    chrome: {
      runtime: {
        onInstalled: {
          addListener(listener) {
            listeners.onInstalled = listener;
          },
        },
        onStartup: {
          addListener(listener) {
            listeners.onStartup = listener;
          },
        },
      },
      storage: {
        local: {
          async get() {
            return {
              spoofDomains:
                storageSnapshots.shift() || [{ domain: "latest.example", enabled: true }],
            };
          },
        },
        onChanged: {
          addListener(listener) {
            listeners.onChanged = listener;
          },
        },
      },
      declarativeNetRequest: {
        async getDynamicRules() {
          return [];
        },
        updateDynamicRules(options) {
          activeUpdates += 1;
          overlappingUpdates = overlappingUpdates || activeUpdates > 1;
          updateCalls.push(options);

          if (updateCalls.length === 1) {
            return firstUpdate.promise.then(() => {
              appliedRules = options.addRules;
              activeUpdates -= 1;
            });
          }

          appliedRules = options.addRules;
          activeUpdates -= 1;
          return Promise.resolve();
        },
      },
    },
  };

  vm.runInNewContext(source, context);

  listeners.onChanged({ spoofDomains: {} }, "local");
  listeners.onChanged({ spoofDomains: {} }, "local");

  await waitFor(() => updateCalls.length >= 1);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(updateCalls.length, 1);
  assert.equal(overlappingUpdates, false);

  firstUpdate.resolve();

  await waitFor(() => updateCalls.length === 2);
  assert.equal(overlappingUpdates, false);
  assert.deepEqual(appliedRules, [{ domain: "latest.example" }]);
});
