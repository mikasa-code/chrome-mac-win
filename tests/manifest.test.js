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
    "scripting",
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

test("manifest relies on dynamic page-world content script registration", () => {
  const manifest = readJson("manifest.json");

  assert.equal(manifest.content_scripts, undefined);
  assert.equal(manifest.web_accessible_resources, undefined);
});

test("background imports dependencies and listens for extension refresh events", () => {
  const source = readText("src/background.js");

  assert.match(
    source,
    /importScripts\(\s*["']constants\.js["']\s*,\s*["']domain-utils\.js["']\s*,\s*["']rules\.js["']\s*\)/,
  );
  assert.match(source, /self\.ChromeWinSpoofConstants/);
  assert.match(source, /self\.ChromeWinSpoofDomainUtils/);
  assert.match(source, /self\.ChromeWinSpoofRules/);
  assert.match(source, /chrome\.scripting\.registerContentScripts/);
  assert.match(source, /chrome\.scripting\.unregisterContentScripts/);
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

test("background registers page spoof script in MAIN world for enabled valid domains", async () => {
  const source = readText("src/background.js");
  const listeners = {};
  const unregisterCalls = [];
  const registerCalls = [];

  const context = {
    importScripts() {},
    self: {
      ChromeWinSpoofConstants: {
        STORAGE_KEY: "spoofDomains",
      },
      ChromeWinSpoofDomainUtils: require("../src/domain-utils"),
      ChromeWinSpoofRules: {
        buildDynamicRules() {
          return [];
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
              spoofDomains: [
                { domain: "example.com", enabled: true },
                { domain: "https://App.Example.COM/path", enabled: true },
                { domain: "example.com", enabled: true },
                { domain: "disabled.example", enabled: false },
              ],
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
        async updateDynamicRules() {},
      },
      scripting: {
        async unregisterContentScripts(options) {
          unregisterCalls.push(options);
        },
        async registerContentScripts(scripts) {
          registerCalls.push(scripts);
        },
      },
    },
  };

  vm.runInNewContext(source, context);

  listeners.onInstalled();

  await waitFor(() => registerCalls.length === 1);

  assert.deepEqual(JSON.parse(JSON.stringify(unregisterCalls)), [
    { ids: ["chrome-windows-spoof-page"] },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(registerCalls)), [
    [
      {
        id: "chrome-windows-spoof-page",
        matches: [
          "*://example.com/*",
          "*://*.example.com/*",
          "*://app.example.com/*",
          "*://*.app.example.com/*",
        ],
        js: ["src/page-spoof.js"],
        runAt: "document_start",
        allFrames: true,
        world: "MAIN",
      },
    ],
  ]);
});

test("background unregisters and skips registration when no valid enabled domains remain", async () => {
  const source = readText("src/background.js");
  const listeners = {};
  const unregisterCalls = [];
  const registerCalls = [];

  const context = {
    importScripts() {},
    self: {
      ChromeWinSpoofConstants: {
        STORAGE_KEY: "spoofDomains",
      },
      ChromeWinSpoofDomainUtils: require("../src/domain-utils"),
      ChromeWinSpoofRules: {
        buildDynamicRules() {
          return [];
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
              spoofDomains: [
                { domain: "example.com", enabled: false },
                { domain: "*.example.com", enabled: true },
                { domain: "localhost", enabled: true },
              ],
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
        async updateDynamicRules() {},
      },
      scripting: {
        async unregisterContentScripts(options) {
          unregisterCalls.push(options);
        },
        async registerContentScripts(scripts) {
          registerCalls.push(scripts);
        },
      },
    },
  };

  vm.runInNewContext(source, context);

  listeners.onInstalled();

  await waitFor(() => unregisterCalls.length === 1);
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(JSON.parse(JSON.stringify(unregisterCalls)), [
    { ids: ["chrome-windows-spoof-page"] },
  ]);
  assert.deepEqual(registerCalls, []);
});

test("background serializes queued refreshes so latest storage wins", async () => {
  const source = readText("src/background.js");
  const listeners = {};
  const firstUpdate = deferred();
  const updateCalls = [];
  const registerCalls = [];
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
      ChromeWinSpoofDomainUtils: require("../src/domain-utils"),
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
      scripting: {
        async unregisterContentScripts() {},
        async registerContentScripts(scripts) {
          registerCalls.push(scripts);
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
  assert.equal(registerCalls.length, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(registerCalls[1][0].matches)), [
    "*://latest.example/*",
    "*://*.latest.example/*",
  ]);
});
