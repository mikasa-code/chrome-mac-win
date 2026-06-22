const assert = require("node:assert/strict");
const test = require("node:test");

const { STORAGE_KEY, WINDOWS_IDENTITY } = require("../src/constants");
const { buildDynamicRules } = require("../src/rules");

const EXPECTED_RESOURCE_TYPES = [
  "main_frame",
  "sub_frame",
  "xmlhttprequest",
  "script",
  "image",
  "stylesheet",
  "font",
  "media",
  "websocket",
  "webtransport",
  "webbundle",
  "ping",
  "csp_report",
  "object",
  "other",
];

test("exports storage key and Windows identity constants", () => {
  assert.equal(STORAGE_KEY, "spoofDomains");
  assert.deepEqual(WINDOWS_IDENTITY, {
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
      uaFullVersion: "126.0.0.0",
    },
  });
});

test("non-array stored records produce no dynamic rules", () => {
  assert.deepEqual(buildDynamicRules(null), []);
  assert.deepEqual(buildDynamicRules({ domain: "example.com" }), []);
});

test("enabled domains produce sequential modifyHeaders rules and disabled records are ignored", () => {
  const rules = buildDynamicRules([
    { domain: "example.com", enabled: true },
    { domain: "disabled.example", enabled: false },
    { domain: "HTTP://App.Example.COM/path", enabled: true },
  ]);

  assert.equal(rules.length, 2);
  assert.deepEqual(
    rules.map((rule) => rule.id),
    [1, 2],
  );
  assert.deepEqual(
    rules.map((rule) => rule.condition.urlFilter),
    ["||example.com^", "||app.example.com^"],
  );
  assert.deepEqual(
    rules.map((rule) => rule.action.type),
    ["modifyHeaders", "modifyHeaders"],
  );
});

test("generated rules explicitly cover the complete Chrome DNR resource types list", () => {
  const rules = buildDynamicRules([
    { domain: "example.com" },
    { domain: "app.example.com" },
  ]);

  for (const rule of rules) {
    assert.deepEqual(rule.condition.resourceTypes, EXPECTED_RESOURCE_TYPES);
  }
});

test("request headers exactly match Windows identity constants", () => {
  const rules = buildDynamicRules([{ domain: "example.com" }]);

  assert.deepEqual(rules[0].action.requestHeaders, [
    {
      header: "User-Agent",
      operation: "set",
      value: WINDOWS_IDENTITY.userAgent,
    },
    {
      header: "Sec-CH-UA-Platform",
      operation: "set",
      value: "\"Windows\"",
    },
  ]);
});

test("invalid stored records are ignored", () => {
  const rules = buildDynamicRules([
    null,
    {},
    { domain: "" },
    { domain: "localhost" },
    { domain: "*.example.com" },
    { domain: "valid.example" },
  ]);

  assert.equal(rules.length, 1);
  assert.equal(rules[0].id, 1);
  assert.equal(rules[0].condition.urlFilter, "||valid.example^");
});

test("CommonJS require also exposes constants and rules on globalThis", () => {
  delete globalThis.ChromeWinSpoofConstants;
  delete globalThis.ChromeWinSpoofRules;
  delete require.cache[require.resolve("../src/constants")];
  delete require.cache[require.resolve("../src/rules")];

  require("../src/constants");
  require("../src/rules");

  assert.equal(globalThis.ChromeWinSpoofConstants.STORAGE_KEY, "spoofDomains");
  assert.equal(
    globalThis.ChromeWinSpoofConstants.WINDOWS_IDENTITY.uaData.platform,
    "Windows",
  );
  assert.equal(typeof globalThis.ChromeWinSpoofRules.buildDynamicRules, "function");
});
