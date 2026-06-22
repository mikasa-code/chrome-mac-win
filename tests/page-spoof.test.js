const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const repoRoot = path.join(__dirname, "..");
const EXPECTED_BRANDS = [
  { brand: "Not/A)Brand", version: "8" },
  { brand: "Chromium", version: "126" },
  { brand: "Google Chrome", version: "126" },
];
const EXPECTED_FULL_VERSION_LIST = [
  { brand: "Not/A)Brand", version: "8.0.0.0" },
  { brand: "Chromium", version: "126.0.0.0" },
  { brand: "Google Chrome", version: "126.0.0.0" },
];

function readText(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

async function runPageSpoof(navigatorOverrides = {}) {
  const source = readText("src/page-spoof.js");
  const navigator = Object.assign(
    {
      userAgent: "Mac UA",
      platform: "MacIntel",
      vendor: "Apple Computer, Inc.",
      maxTouchPoints: 5,
    },
    navigatorOverrides,
  );
  const context = { navigator };

  vm.runInNewContext(source, context);

  return navigator;
}

test("page spoof overrides common navigator identity values", async () => {
  const navigator = await runPageSpoof();

  assert.equal(
    navigator.userAgent,
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  );
  assert.equal(navigator.platform, "Win32");
  assert.equal(navigator.vendor, "Google Inc.");
  assert.equal(navigator.maxTouchPoints, 0);
});

test("page spoof overrides userAgentData platform and requested high entropy values", async () => {
  const userAgentData = {
    platform: "macOS",
    mobile: false,
    brands: [{ brand: "Not A(Brand", version: "99" }],
    async getHighEntropyValues(hints) {
      return {
        platform: "macOS",
        architecture: "arm",
        bitness: "64",
        model: "Mac",
        platformVersion: "14.0.0",
        uaFullVersion: "126.1.2.3",
        fullVersionList: [{ brand: "Not A(Brand", version: "99.0.0.0" }],
        wow64: false,
        hints,
      };
    },
  };
  const navigator = await runPageSpoof({ userAgentData });

  assert.equal(navigator.userAgentData.platform, "Windows");
  assert.equal(navigator.userAgentData.mobile, false);
  assert.deepEqual(JSON.parse(JSON.stringify(navigator.userAgentData.brands)), EXPECTED_BRANDS);

  const values = await navigator.userAgentData.getHighEntropyValues([
    "platform",
    "architecture",
    "bitness",
    "model",
    "platformVersion",
    "uaFullVersion",
    "fullVersionList",
    "wow64",
  ]);

  assert.deepEqual(JSON.parse(JSON.stringify(values)), {
    platform: "Windows",
    architecture: "x86",
    bitness: "64",
    model: "",
    platformVersion: "15.0.0",
    uaFullVersion: "126.0.0.0",
    fullVersionList: EXPECTED_FULL_VERSION_LIST,
    wow64: false,
    hints: [
      "platform",
      "architecture",
      "bitness",
      "model",
      "platformVersion",
      "uaFullVersion",
      "fullVersionList",
      "wow64",
    ],
  });
});

test("page spoof does not throw when navigator properties cannot be overridden", () => {
  const source = readText("src/page-spoof.js");
  const navigator = {};

  Object.defineProperty(navigator, "platform", {
    value: "MacIntel",
    configurable: false,
  });

  assert.doesNotThrow(() => {
    vm.runInNewContext(source, { navigator });
  });
  assert.equal(navigator.platform, "MacIntel");
});
