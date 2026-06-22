# Chrome Windows Spoof Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome Manifest V3 extension that lets a macOS Chrome user spoof selected domains as Windows Chrome, with popup-managed domain rules.

**Architecture:** Use plain JavaScript files that can run directly as an unpacked extension without a bundler. Pure domain, storage-list, and DNR rule logic lives in testable modules that also expose browser globals. Chrome API files stay thin and call those modules.

**Tech Stack:** Chrome Manifest V3, `chrome.storage.local`, `chrome.declarativeNetRequest`, web-accessible page script injection, Node built-in test runner.

---

## References

- Chrome Declarative Net Request API: `https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest`
- Chrome content scripts: `https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts`
- Chrome web-accessible resources: `https://developer.chrome.com/docs/extensions/reference/manifest/web-accessible-resources`

## File Structure

- Create: `package.json` - Node test script only.
- Create: `manifest.json` - Chrome MV3 extension manifest.
- Create: `README.md` - Install, usage, verification, and limits.
- Create: `popup.html` - Extension popup shell.
- Create: `styles/popup.css` - Popup styling.
- Create: `src/constants.js` - Shared storage key and Windows identity values.
- Create: `src/domain-utils.js` - Domain input parsing, hostname matching, and DNR URL filter formatting.
- Create: `src/domain-store.js` - Pure domain-list add, remove, and toggle operations.
- Create: `src/rules.js` - Pure dynamic DNR rule builder.
- Create: `src/background.js` - Service worker that refreshes DNR rules from storage.
- Create: `src/content.js` - Isolated content script that conditionally injects the page script.
- Create: `src/page-spoof.js` - Page-world script that overrides common `navigator` identity values.
- Create: `tests/domain-utils.test.js` - Domain parsing and matching tests.
- Create: `tests/rules.test.js` - DNR rule generation tests.
- Create: `tests/domain-store.test.js` - Domain-list operation tests.
- Create: `tests/manifest.test.js` - Manifest shape tests.
- Create: `tests/page-spoof.test.js` - Page-world spoof behavior tests.
- Create: `tests/content-source.test.js` - Content injection source checks.
- Create: `tests/popup-source.test.js` - Popup wiring source checks.

## Assumptions

- Use CommonJS-compatible modules with browser global exports so the same files work in Node tests, service worker `importScripts`, popup scripts, and content scripts.
- Use static content scripts on `<all_urls>` but only inject `src/page-spoof.js` when the current hostname matches enabled user domains.
- Use DNR `urlFilter` values such as `||example.com^` so one rule covers the exact domain and subdomains.
- Keep the Chrome version string fixed at `126.0.0.0` for the first version.

---

### Task 1: Domain Utilities

**Files:**
- Create: `package.json`
- Create: `src/domain-utils.js`
- Create: `tests/domain-utils.test.js`

- [ ] **Step 1: Create the test harness**

Create `package.json`:

```json
{
  "name": "chrome-mac-win",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "test": "node --test tests/*.test.js"
  }
}
```

- [ ] **Step 2: Write the failing domain utility tests**

Create `tests/domain-utils.test.js`:

```javascript
const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  parseDomainInput,
  domainMatches,
  toDnrUrlFilter
} = require("../src/domain-utils");

test("parseDomainInput normalizes URL-like input to a lowercase hostname", () => {
  assert.deepEqual(
    parseDomainInput("HTTP://App.Example.COM:8080/login?q=1#hash"),
    { ok: true, domain: "app.example.com" }
  );
});

test("parseDomainInput normalizes bare domains and strips a trailing dot", () => {
  assert.deepEqual(parseDomainInput(" Example.COM. "), {
    ok: true,
    domain: "example.com"
  });
});

test("parseDomainInput rejects unsupported hostnames", () => {
  const invalidInputs = [
    "",
    "*",
    "*.example.com",
    "example .com",
    "http://",
    "localhost",
    "127.0.0.1",
    "example",
    "-example.com",
    "example-.com"
  ];

  for (const input of invalidInputs) {
    assert.equal(parseDomainInput(input).ok, false, input);
  }
});

test("domainMatches matches exact hostnames and subdomains only", () => {
  assert.equal(domainMatches("example.com", "example.com"), true);
  assert.equal(domainMatches("app.example.com", "example.com"), true);
  assert.equal(domainMatches("deep.app.example.com", "example.com"), true);
  assert.equal(domainMatches("badexample.com", "example.com"), false);
  assert.equal(domainMatches("example.com.evil.com", "example.com"), false);
});

test("toDnrUrlFilter creates a domain-anchored filter", () => {
  assert.equal(toDnrUrlFilter("example.com"), "||example.com^");
});
```

- [ ] **Step 3: Create a loadable skeleton and verify the tests fail**

Create `src/domain-utils.js`:

```javascript
(function exposeDomainUtils(global) {
  const api = {
    parseDomainInput() {
      return { ok: false, error: "Not implemented." };
    },
    domainMatches() {
      return false;
    },
    toDnrUrlFilter() {
      return "";
    }
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  global.ChromeWinSpoofDomainUtils = api;
})(typeof globalThis !== "undefined" ? globalThis : self);
```

Run: `npm test -- tests/domain-utils.test.js`

Expected: FAIL with assertion differences for normalization, matching, and URL filter output.

- [ ] **Step 4: Implement the minimal domain utilities**

Replace `src/domain-utils.js` with:

```javascript
(function exposeDomainUtils(global) {
  const INVALID_DOMAIN_ERROR = "Enter a valid domain.";

  function parseDomainInput(input) {
    if (typeof input !== "string") {
      return { ok: false, error: INVALID_DOMAIN_ERROR };
    }

    const trimmed = input.trim().toLowerCase();
    if (!trimmed || trimmed.includes("*") || /\s/.test(trimmed)) {
      return { ok: false, error: INVALID_DOMAIN_ERROR };
    }

    const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;

    let parsed;
    try {
      parsed = new URL(candidate);
    } catch (_error) {
      return { ok: false, error: INVALID_DOMAIN_ERROR };
    }

    const domain = parsed.hostname.toLowerCase().replace(/\.$/, "");
    if (!isValidDomain(domain)) {
      return { ok: false, error: INVALID_DOMAIN_ERROR };
    }

    return { ok: true, domain };
  }

  function isValidDomain(domain) {
    if (!domain || domain.length > 253 || domain.includes(":")) {
      return false;
    }

    if (/^\d+\.\d+\.\d+\.\d+$/.test(domain)) {
      return false;
    }

    const labels = domain.split(".");
    if (labels.length < 2) {
      return false;
    }

    if (!/^[a-z]{2,63}$/.test(labels[labels.length - 1])) {
      return false;
    }

    return labels.every((label) => {
      return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label);
    });
  }

  function domainMatches(hostname, configuredDomain) {
    if (typeof hostname !== "string" || typeof configuredDomain !== "string") {
      return false;
    }

    const host = hostname.toLowerCase().replace(/\.$/, "");
    const domain = configuredDomain.toLowerCase().replace(/\.$/, "");
    return host === domain || host.endsWith(`.${domain}`);
  }

  function toDnrUrlFilter(domain) {
    return `||${domain}^`;
  }

  const api = {
    parseDomainInput,
    domainMatches,
    toDnrUrlFilter
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  global.ChromeWinSpoofDomainUtils = api;
})(typeof globalThis !== "undefined" ? globalThis : self);
```

- [ ] **Step 5: Run domain utility tests and commit**

Run: `npm test -- tests/domain-utils.test.js`

Expected: PASS for all tests in `tests/domain-utils.test.js`.

Commit:

```bash
git add package.json src/domain-utils.js tests/domain-utils.test.js
git commit -m "feat: add domain parsing utilities"
```

---

### Task 2: DNR Rule Builder

**Files:**
- Create: `src/constants.js`
- Create: `src/rules.js`
- Create: `tests/rules.test.js`

- [ ] **Step 1: Write the failing DNR rule tests**

Create `tests/rules.test.js`:

```javascript
const { test } = require("node:test");
const assert = require("node:assert/strict");

const { WINDOWS_IDENTITY } = require("../src/constants");
const { buildDynamicRules } = require("../src/rules");

test("buildDynamicRules creates one modifyHeaders rule per enabled domain", () => {
  const rules = buildDynamicRules([
    { domain: "example.com", enabled: true },
    { domain: "disabled.com", enabled: false },
    { domain: "app.example.org", enabled: true }
  ]);

  assert.equal(rules.length, 2);
  assert.deepEqual(
    rules.map((rule) => rule.id),
    [1, 2]
  );
  assert.equal(rules[0].condition.urlFilter, "||example.com^");
  assert.equal(rules[1].condition.urlFilter, "||app.example.org^");
  assert.equal(rules[0].action.type, "modifyHeaders");
});

test("buildDynamicRules sets Windows request identity headers", () => {
  const [rule] = buildDynamicRules([{ domain: "example.com", enabled: true }]);

  assert.deepEqual(rule.action.requestHeaders, [
    {
      header: "User-Agent",
      operation: "set",
      value: WINDOWS_IDENTITY.userAgent
    },
    {
      header: "Sec-CH-UA-Platform",
      operation: "set",
      value: "\"Windows\""
    }
  ]);
});

test("buildDynamicRules ignores invalid stored records", () => {
  const rules = buildDynamicRules([
    { domain: "example.com", enabled: true },
    { domain: "bad domain", enabled: true },
    { domain: "", enabled: true }
  ]);

  assert.equal(rules.length, 1);
  assert.equal(rules[0].condition.urlFilter, "||example.com^");
});
```

- [ ] **Step 2: Create constants and a loadable rules skeleton**

Create `src/constants.js`:

```javascript
(function exposeConstants(global) {
  const STORAGE_KEY = "spoofDomains";

  const WINDOWS_IDENTITY = {
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    platform: "Win32",
    vendor: "Google Inc.",
    maxTouchPoints: 0,
    uaData: {
      platform: "Windows",
      architecture: "x86",
      bitness: "64",
      model: "",
      platformVersion: "15.0.0",
      uaFullVersion: "126.0.0.0"
    }
  };

  const api = {
    STORAGE_KEY,
    WINDOWS_IDENTITY
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  global.ChromeWinSpoofConstants = api;
})(typeof globalThis !== "undefined" ? globalThis : self);
```

Create `src/rules.js`:

```javascript
(function exposeRules(global) {
  const api = {
    buildDynamicRules() {
      return [];
    }
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  global.ChromeWinSpoofRules = api;
})(typeof globalThis !== "undefined" ? globalThis : self);
```

Run: `npm test -- tests/rules.test.js`

Expected: FAIL because `buildDynamicRules` returns no rules.

- [ ] **Step 3: Implement DNR rule generation**

Replace `src/rules.js` with:

```javascript
(function exposeRules(global) {
  const constants =
    typeof require === "function"
      ? require("./constants")
      : global.ChromeWinSpoofConstants;
  const domainUtils =
    typeof require === "function"
      ? require("./domain-utils")
      : global.ChromeWinSpoofDomainUtils;

  const REQUEST_HEADERS = [
    {
      header: "User-Agent",
      operation: "set",
      value: constants.WINDOWS_IDENTITY.userAgent
    },
    {
      header: "Sec-CH-UA-Platform",
      operation: "set",
      value: "\"Windows\""
    }
  ];

  function buildDynamicRules(records) {
    if (!Array.isArray(records)) {
      return [];
    }

    const enabledDomains = records
      .filter((record) => record && record.enabled !== false)
      .map((record) => domainUtils.parseDomainInput(record.domain))
      .filter((result) => result.ok)
      .map((result) => result.domain);

    return enabledDomains.map((domain, index) => ({
      id: index + 1,
      priority: 1,
      action: {
        type: "modifyHeaders",
        requestHeaders: REQUEST_HEADERS
      },
      condition: {
        urlFilter: domainUtils.toDnrUrlFilter(domain)
      }
    }));
  }

  const api = {
    buildDynamicRules
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  global.ChromeWinSpoofRules = api;
})(typeof globalThis !== "undefined" ? globalThis : self);
```

- [ ] **Step 4: Run rule tests and commit**

Run: `npm test -- tests/rules.test.js`

Expected: PASS for all tests in `tests/rules.test.js`.

Commit:

```bash
git add src/constants.js src/rules.js tests/rules.test.js
git commit -m "feat: add dynamic rule builder"
```

---

### Task 3: Domain Store Operations

**Files:**
- Create: `src/domain-store.js`
- Create: `tests/domain-store.test.js`

- [ ] **Step 1: Write failing store tests**

Create `tests/domain-store.test.js`:

```javascript
const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  addDomainRecord,
  removeDomainRecord,
  setDomainEnabled
} = require("../src/domain-store");

test("addDomainRecord normalizes and adds enabled domains", () => {
  const result = addDomainRecord([], "HTTPS://Example.COM/login");

  assert.deepEqual(result, {
    ok: true,
    records: [{ domain: "example.com", enabled: true }]
  });
});

test("addDomainRecord rejects duplicates", () => {
  const result = addDomainRecord(
    [{ domain: "example.com", enabled: true }],
    "example.com"
  );

  assert.equal(result.ok, false);
  assert.equal(result.error, "Domain already exists.");
});

test("removeDomainRecord removes only the requested domain", () => {
  const records = removeDomainRecord(
    [
      { domain: "example.com", enabled: true },
      { domain: "example.org", enabled: true }
    ],
    "example.com"
  );

  assert.deepEqual(records, [{ domain: "example.org", enabled: true }]);
});

test("setDomainEnabled updates only the requested domain", () => {
  const records = setDomainEnabled(
    [
      { domain: "example.com", enabled: true },
      { domain: "example.org", enabled: true }
    ],
    "example.org",
    false
  );

  assert.deepEqual(records, [
    { domain: "example.com", enabled: true },
    { domain: "example.org", enabled: false }
  ]);
});
```

- [ ] **Step 2: Create a loadable store skeleton and verify failure**

Create `src/domain-store.js`:

```javascript
(function exposeDomainStore(global) {
  const api = {
    addDomainRecord() {
      return { ok: false, error: "Not implemented.", records: [] };
    },
    removeDomainRecord(records) {
      return records;
    },
    setDomainEnabled(records) {
      return records;
    }
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  global.ChromeWinSpoofDomainStore = api;
})(typeof globalThis !== "undefined" ? globalThis : self);
```

Run: `npm test -- tests/domain-store.test.js`

Expected: FAIL because the skeleton does not add or update records.

- [ ] **Step 3: Implement store operations**

Replace `src/domain-store.js` with:

```javascript
(function exposeDomainStore(global) {
  const domainUtils =
    typeof require === "function"
      ? require("./domain-utils")
      : global.ChromeWinSpoofDomainUtils;

  function normalizeRecords(records) {
    return Array.isArray(records) ? records : [];
  }

  function addDomainRecord(records, input) {
    const currentRecords = normalizeRecords(records);
    const parsed = domainUtils.parseDomainInput(input);

    if (!parsed.ok) {
      return {
        ok: false,
        error: parsed.error,
        records: currentRecords
      };
    }

    if (currentRecords.some((record) => record.domain === parsed.domain)) {
      return {
        ok: false,
        error: "Domain already exists.",
        records: currentRecords
      };
    }

    return {
      ok: true,
      records: currentRecords.concat({
        domain: parsed.domain,
        enabled: true
      })
    };
  }

  function removeDomainRecord(records, domain) {
    return normalizeRecords(records).filter((record) => record.domain !== domain);
  }

  function setDomainEnabled(records, domain, enabled) {
    return normalizeRecords(records).map((record) => {
      if (record.domain !== domain) {
        return record;
      }

      return {
        domain: record.domain,
        enabled: Boolean(enabled)
      };
    });
  }

  const api = {
    addDomainRecord,
    removeDomainRecord,
    setDomainEnabled
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  global.ChromeWinSpoofDomainStore = api;
})(typeof globalThis !== "undefined" ? globalThis : self);
```

- [ ] **Step 4: Run store tests and commit**

Run: `npm test -- tests/domain-store.test.js`

Expected: PASS for all tests in `tests/domain-store.test.js`.

Commit:

```bash
git add src/domain-store.js tests/domain-store.test.js
git commit -m "feat: add popup domain store operations"
```

---

### Task 4: Manifest and Background Service Worker

**Files:**
- Create: `manifest.json`
- Create: `src/background.js`
- Create: `tests/manifest.test.js`

- [ ] **Step 1: Write failing manifest tests**

Create `tests/manifest.test.js`:

```javascript
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("manifest declares the required MV3 extension wiring", () => {
  const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));

  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.action.default_popup, "popup.html");
  assert.equal(manifest.background.service_worker, "src/background.js");
  assert.ok(manifest.permissions.includes("storage"));
  assert.ok(manifest.permissions.includes("declarativeNetRequestWithHostAccess"));
  assert.deepEqual(manifest.host_permissions, ["<all_urls>"]);
});

test("manifest wires content scripts and page spoof resource", () => {
  const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));

  assert.deepEqual(manifest.content_scripts[0].matches, ["<all_urls>"]);
  assert.equal(manifest.content_scripts[0].run_at, "document_start");
  assert.deepEqual(manifest.content_scripts[0].js, [
    "src/constants.js",
    "src/domain-utils.js",
    "src/content.js"
  ]);
  assert.deepEqual(manifest.web_accessible_resources[0].resources, [
    "src/page-spoof.js"
  ]);
  assert.deepEqual(manifest.web_accessible_resources[0].matches, ["<all_urls>"]);
});
```

Run: `npm test -- tests/manifest.test.js`

Expected: FAIL because `manifest.json` does not exist.

- [ ] **Step 2: Create the manifest**

Create `manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "Chrome Windows Spoof",
  "version": "0.1.0",
  "description": "Spoof selected domains as Windows Chrome from macOS Chrome.",
  "permissions": [
    "storage",
    "declarativeNetRequestWithHostAccess"
  ],
  "host_permissions": [
    "<all_urls>"
  ],
  "action": {
    "default_title": "Windows Spoof",
    "default_popup": "popup.html"
  },
  "background": {
    "service_worker": "src/background.js"
  },
  "content_scripts": [
    {
      "matches": [
        "<all_urls>"
      ],
      "js": [
        "src/constants.js",
        "src/domain-utils.js",
        "src/content.js"
      ],
      "run_at": "document_start"
    }
  ],
  "web_accessible_resources": [
    {
      "resources": [
        "src/page-spoof.js"
      ],
      "matches": [
        "<all_urls>"
      ]
    }
  ]
}
```

- [ ] **Step 3: Create the background service worker**

Create `src/background.js`:

```javascript
importScripts("constants.js", "domain-utils.js", "rules.js");

const { STORAGE_KEY } = self.ChromeWinSpoofConstants;
const { buildDynamicRules } = self.ChromeWinSpoofRules;

async function getStoredDomains() {
  const result = await chrome.storage.local.get({ [STORAGE_KEY]: [] });
  return Array.isArray(result[STORAGE_KEY]) ? result[STORAGE_KEY] : [];
}

async function refreshDynamicRules() {
  const records = await getStoredDomains();
  const currentRules = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = currentRules.map((rule) => rule.id);
  const addRules = buildDynamicRules(records);

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules
  });
}

chrome.runtime.onInstalled.addListener(() => {
  refreshDynamicRules();
});

chrome.runtime.onStartup.addListener(() => {
  refreshDynamicRules();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes[STORAGE_KEY]) {
    refreshDynamicRules();
  }
});
```

- [ ] **Step 4: Run manifest tests and commit**

Run: `npm test -- tests/manifest.test.js`

Expected: PASS for all tests in `tests/manifest.test.js`.

Commit:

```bash
git add manifest.json src/background.js tests/manifest.test.js
git commit -m "feat: add extension manifest and background worker"
```

---

### Task 5: Content Script and Page Spoofing

**Files:**
- Create: `src/content.js`
- Create: `src/page-spoof.js`
- Create: `tests/content-source.test.js`
- Create: `tests/page-spoof.test.js`

- [ ] **Step 1: Write failing content and page spoof tests**

Create `tests/content-source.test.js`:

```javascript
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("content script injects the page spoof file through a script element", () => {
  const source = fs.readFileSync("src/content.js", "utf8");

  assert.match(source, /chrome\.runtime\.getURL\("src\/page-spoof\.js"\)/);
  assert.match(source, /document\.createElement\("script"\)/);
  assert.doesNotMatch(source, /chrome\.scripting/);
});
```

Create `tests/page-spoof.test.js`:

```javascript
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

test("page spoof script overrides common navigator identity values", async () => {
  const source = fs.readFileSync("src/page-spoof.js", "utf8");
  const navigator = {
    userAgentData: {
      platform: "macOS",
      getHighEntropyValues: async () => ({
        platform: "macOS",
        architecture: "arm",
        bitness: "64"
      })
    }
  };

  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    get() {
      return "Macintosh";
    }
  });
  Object.defineProperty(navigator, "platform", {
    configurable: true,
    get() {
      return "MacIntel";
    }
  });

  vm.runInNewContext(source, {
    navigator,
    Object,
    Promise
  });

  assert.equal(navigator.platform, "Win32");
  assert.match(navigator.userAgent, /Windows NT 10\.0/);
  assert.equal(navigator.vendor, "Google Inc.");
  assert.equal(navigator.maxTouchPoints, 0);
  assert.equal(navigator.userAgentData.platform, "Windows");

  const highEntropy = await navigator.userAgentData.getHighEntropyValues([
    "platform",
    "architecture",
    "bitness",
    "model",
    "platformVersion",
    "uaFullVersion"
  ]);

  assert.deepEqual(highEntropy, {
    platform: "Windows",
    architecture: "x86",
    bitness: "64",
    model: "",
    platformVersion: "15.0.0",
    uaFullVersion: "126.0.0.0"
  });
});
```

Run: `npm test -- tests/content-source.test.js tests/page-spoof.test.js`

Expected: FAIL because `src/content.js` and `src/page-spoof.js` do not exist.

- [ ] **Step 2: Implement the content script**

Create `src/content.js`:

```javascript
(function runContentScript() {
  const { STORAGE_KEY } = globalThis.ChromeWinSpoofConstants;
  const { domainMatches } = globalThis.ChromeWinSpoofDomainUtils;

  function getStoredRecords(callback) {
    chrome.storage.local.get({ [STORAGE_KEY]: [] }, (result) => {
      const records = Array.isArray(result[STORAGE_KEY])
        ? result[STORAGE_KEY]
        : [];
      callback(records);
    });
  }

  function shouldSpoofHostname(records, hostname) {
    return records.some((record) => {
      return record && record.enabled !== false && domainMatches(hostname, record.domain);
    });
  }

  function injectPageSpoofScript() {
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("src/page-spoof.js");
    script.onload = () => script.remove();

    const target = document.documentElement || document.head || document.body;
    if (target) {
      target.appendChild(script);
    }
  }

  getStoredRecords((records) => {
    if (shouldSpoofHostname(records, window.location.hostname)) {
      injectPageSpoofScript();
    }
  });
})();
```

- [ ] **Step 3: Implement the page-world spoof script**

Create `src/page-spoof.js`:

```javascript
(function spoofNavigatorForWindows() {
  const identity = {
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    platform: "Win32",
    vendor: "Google Inc.",
    maxTouchPoints: 0,
    uaData: {
      platform: "Windows",
      architecture: "x86",
      bitness: "64",
      model: "",
      platformVersion: "15.0.0",
      uaFullVersion: "126.0.0.0"
    }
  };

  function defineValue(object, property, value) {
    try {
      Object.defineProperty(object, property, {
        configurable: true,
        get() {
          return value;
        }
      });
    } catch (_error) {
      return false;
    }

    return true;
  }

  defineValue(navigator, "userAgent", identity.userAgent);
  defineValue(navigator, "platform", identity.platform);
  defineValue(navigator, "vendor", identity.vendor);
  defineValue(navigator, "maxTouchPoints", identity.maxTouchPoints);

  if (!navigator.userAgentData) {
    return;
  }

  const userAgentData = navigator.userAgentData;
  defineValue(userAgentData, "platform", identity.uaData.platform);

  const originalGetHighEntropyValues =
    typeof userAgentData.getHighEntropyValues === "function"
      ? userAgentData.getHighEntropyValues.bind(userAgentData)
      : null;

  try {
    Object.defineProperty(userAgentData, "getHighEntropyValues", {
      configurable: true,
      value: async function getHighEntropyValues(hints) {
        const requestedHints = Array.isArray(hints) ? hints : [];
        const originalValues = originalGetHighEntropyValues
          ? await originalGetHighEntropyValues(requestedHints)
          : {};
        const spoofedValues = {};

        for (const hint of requestedHints) {
          if (Object.prototype.hasOwnProperty.call(identity.uaData, hint)) {
            spoofedValues[hint] = identity.uaData[hint];
          }
        }

        return Object.assign({}, originalValues, spoofedValues);
      }
    });
  } catch (_error) {
    return;
  }
})();
```

- [ ] **Step 4: Run content and page spoof tests and commit**

Run: `npm test -- tests/content-source.test.js tests/page-spoof.test.js`

Expected: PASS for content source and page spoof behavior tests.

Commit:

```bash
git add src/content.js src/page-spoof.js tests/content-source.test.js tests/page-spoof.test.js
git commit -m "feat: add page spoof injection"
```

---

### Task 6: Popup UI

**Files:**
- Create: `popup.html`
- Create: `src/popup.js`
- Create: `styles/popup.css`
- Create: `tests/popup-source.test.js`

- [ ] **Step 1: Write failing popup source tests**

Create `tests/popup-source.test.js`:

```javascript
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("popup html includes domain controls and script dependencies", () => {
  const html = fs.readFileSync("popup.html", "utf8");

  assert.match(html, /id="domain-form"/);
  assert.match(html, /id="domain-input"/);
  assert.match(html, /id="domain-list"/);
  assert.match(html, /src="src\/constants\.js"/);
  assert.match(html, /src="src\/domain-utils\.js"/);
  assert.match(html, /src="src\/domain-store\.js"/);
  assert.match(html, /src="src\/popup\.js"/);
});

test("popup script stores domains under the shared storage key", () => {
  const source = fs.readFileSync("src/popup.js", "utf8");

  assert.match(source, /ChromeWinSpoofConstants/);
  assert.match(source, /chrome\.storage\.local\.set/);
  assert.match(source, /addDomainRecord/);
  assert.match(source, /removeDomainRecord/);
  assert.match(source, /setDomainEnabled/);
});
```

Run: `npm test -- tests/popup-source.test.js`

Expected: FAIL because popup files do not exist.

- [ ] **Step 2: Create the popup HTML**

Create `popup.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Windows Spoof</title>
    <link rel="stylesheet" href="styles/popup.css">
  </head>
  <body>
    <main class="popup">
      <header class="popup__header">
        <h1>Windows Spoof</h1>
      </header>

      <form id="domain-form" class="domain-form">
        <label for="domain-input">Domain</label>
        <div class="domain-form__row">
          <input
            id="domain-input"
            name="domain"
            type="text"
            autocomplete="off"
            spellcheck="false"
            placeholder="example.com"
          >
          <button type="submit">Add</button>
        </div>
        <p id="domain-error" class="domain-form__error" role="alert"></p>
      </form>

      <ul id="domain-list" class="domain-list" aria-label="Spoofed domains"></ul>
      <p id="empty-state" class="empty-state">No domains configured.</p>
    </main>

    <script src="src/constants.js"></script>
    <script src="src/domain-utils.js"></script>
    <script src="src/domain-store.js"></script>
    <script src="src/popup.js"></script>
  </body>
</html>
```

- [ ] **Step 3: Create popup styling**

Create `styles/popup.css`:

```css
:root {
  color-scheme: light;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 14px;
}

body {
  margin: 0;
  min-width: 320px;
  color: #1f2933;
  background: #f7f8fa;
}

button,
input {
  font: inherit;
}

.popup {
  box-sizing: border-box;
  width: 320px;
  padding: 14px;
}

.popup__header {
  margin-bottom: 12px;
}

.popup__header h1 {
  margin: 0;
  font-size: 16px;
  font-weight: 650;
}

.domain-form {
  margin-bottom: 12px;
}

.domain-form label {
  display: block;
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #52606d;
}

.domain-form__row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
}

.domain-form input {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  padding: 8px 9px;
  border: 1px solid #cbd2d9;
  border-radius: 6px;
  background: #ffffff;
  color: #1f2933;
}

.domain-form button,
.domain-list button {
  border: 1px solid #2563eb;
  border-radius: 6px;
  background: #2563eb;
  color: #ffffff;
  cursor: pointer;
  font-weight: 600;
}

.domain-form button {
  padding: 8px 11px;
}

.domain-form__error {
  min-height: 18px;
  margin: 6px 0 0;
  color: #b42318;
  font-size: 12px;
}

.domain-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.domain-list__item {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 8px;
  border: 1px solid #d9e2ec;
  border-radius: 6px;
  background: #ffffff;
}

.domain-list__item span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.domain-list input {
  width: 16px;
  height: 16px;
}

.domain-list button {
  padding: 6px 8px;
  border-color: #d64545;
  background: #d64545;
  font-size: 12px;
}

.empty-state {
  margin: 12px 0 0;
  color: #7b8794;
  font-size: 13px;
}

.empty-state[hidden] {
  display: none;
}
```

- [ ] **Step 4: Create popup behavior**

Create `src/popup.js`:

```javascript
(function runPopup() {
  const { STORAGE_KEY } = globalThis.ChromeWinSpoofConstants;
  const {
    addDomainRecord,
    removeDomainRecord,
    setDomainEnabled
  } = globalThis.ChromeWinSpoofDomainStore;

  const form = document.getElementById("domain-form");
  const input = document.getElementById("domain-input");
  const error = document.getElementById("domain-error");
  const list = document.getElementById("domain-list");
  const emptyState = document.getElementById("empty-state");

  let currentRecords = [];

  function loadRecords() {
    chrome.storage.local.get({ [STORAGE_KEY]: [] }, (result) => {
      currentRecords = Array.isArray(result[STORAGE_KEY])
        ? result[STORAGE_KEY]
        : [];
      render();
    });
  }

  function saveRecords(records) {
    chrome.storage.local.set({ [STORAGE_KEY]: records }, () => {
      currentRecords = records;
      render();
    });
  }

  function setError(message) {
    error.textContent = message || "";
  }

  function render() {
    list.textContent = "";
    emptyState.hidden = currentRecords.length > 0;

    for (const record of currentRecords) {
      const item = document.createElement("li");
      item.className = "domain-list__item";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = record.enabled !== false;
      checkbox.setAttribute("aria-label", `Enable ${record.domain}`);
      checkbox.addEventListener("change", () => {
        saveRecords(
          setDomainEnabled(currentRecords, record.domain, checkbox.checked)
        );
      });

      const domain = document.createElement("span");
      domain.textContent = record.domain;

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.textContent = "Remove";
      removeButton.addEventListener("click", () => {
        saveRecords(removeDomainRecord(currentRecords, record.domain));
      });

      item.append(checkbox, domain, removeButton);
      list.append(item);
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    setError("");

    const result = addDomainRecord(currentRecords, input.value);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    input.value = "";
    saveRecords(result.records);
  });

  loadRecords();
})();
```

- [ ] **Step 5: Run popup tests and commit**

Run: `npm test -- tests/popup-source.test.js`

Expected: PASS for popup source tests.

Commit:

```bash
git add popup.html styles/popup.css src/popup.js tests/popup-source.test.js
git commit -m "feat: add popup domain manager"
```

---

### Task 7: README and Full Automated Verification

**Files:**
- Create: `README.md`

- [ ] **Step 1: Add README**

Create `README.md`:

```markdown
# Chrome Windows Spoof

A local Chrome Manifest V3 extension for macOS Chrome. It lets you choose domains that should see the browser as Windows Chrome.

## What It Spoofs

For enabled domains, the extension changes:

- Request `User-Agent`
- Request `Sec-CH-UA-Platform`
- `navigator.userAgent`
- `navigator.platform`
- `navigator.vendor`
- `navigator.maxTouchPoints`
- `navigator.userAgentData.platform`
- Selected `navigator.userAgentData.getHighEntropyValues()` fields

Configured domains match the exact domain and all subdomains. For example, `example.com` matches `example.com`, `www.example.com`, and `app.example.com`.

## Install

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select this project directory.

## Use

1. Click the Windows Spoof extension icon.
2. Add a domain such as `example.com`.
3. Leave the checkbox enabled for domains that should be spoofed.
4. Reload pages that were already open.

## Verify

On a configured domain, open DevTools Console and run:

```javascript
navigator.platform
navigator.userAgent
navigator.userAgentData && navigator.userAgentData.platform
```

The values should show Windows-like Chrome identity data.

On an unconfigured domain, those values should stay unchanged.

## Test

```bash
npm test
```

## Limits

This is not a full anti-fingerprinting browser. Advanced systems may still detect macOS through Canvas, WebGL, fonts, GPU data, audio fingerprinting, rendering differences, timing, or other browser and device signals.
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`

Expected: PASS for every test file in `tests/`.

- [ ] **Step 3: Inspect git status and commit**

Run: `git status --short`

Expected: `README.md` is the only uncommitted file.

Commit:

```bash
git add README.md
git commit -m "docs: add extension usage guide"
```

---

### Task 8: Manual Extension Smoke Test

**Files:**
- No file changes expected.

- [ ] **Step 1: Run final automated verification**

Run: `npm test`

Expected: PASS for every test file in `tests/`.

- [ ] **Step 2: Validate manifest JSON parses**

Run: `node -e "JSON.parse(require('node:fs').readFileSync('manifest.json', 'utf8')); console.log('manifest ok')"`

Expected output:

```text
manifest ok
```

- [ ] **Step 3: Check repository status**

Run: `git status --short`

Expected: no output.

- [ ] **Step 4: Manual Chrome check**

Load the project directory in `chrome://extensions` with Developer mode enabled. Add a domain in the popup, open a page on that domain, and run:

```javascript
Promise.resolve(
  navigator.userAgentData
    ? navigator.userAgentData.getHighEntropyValues([
        "platform",
        "architecture",
        "bitness",
        "model",
        "platformVersion",
        "uaFullVersion"
      ])
    : {}
).then((uaData) => ({
  platform: navigator.platform,
  userAgent: navigator.userAgent,
  uaData
}));
```

Expected: `platform` is `Win32`, `userAgent` contains `Windows NT 10.0`, and `uaData.platform` is `Windows` on the configured domain. On an unconfigured domain, values remain the browser defaults.

## Self-Review

- Spec coverage: The plan covers popup domain management, exact and subdomain matching, request header spoofing through DNR, page-side `navigator` spoofing, local-only storage, README instructions, and known limits.
- Completeness scan: Tasks define concrete files, commands, and expected results without incomplete sections.
- Type consistency: Domain records consistently use `{ domain: string, enabled: boolean }`; storage consistently uses `STORAGE_KEY`; spoof values consistently come from the fixed Windows identity except for the self-contained page-world script.
