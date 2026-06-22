const assert = require("node:assert/strict");
const test = require("node:test");

const {
  parseDomainInput,
  domainMatches,
  toDnrUrlFilter,
} = require("../src/domain-utils");

test("parseDomainInput normalizes URL-like input to lowercase hostname", () => {
  assert.deepEqual(parseDomainInput("HTTP://App.Example.COM:8080/login?q=1#hash"), {
    ok: true,
    domain: "app.example.com",
  });
});

test("parseDomainInput normalizes bare domains and strips trailing dot", () => {
  assert.deepEqual(parseDomainInput(" Example.COM. "), {
    ok: true,
    domain: "example.com",
  });
});

test("parseDomainInput rejects unsupported hostnames", () => {
  for (const input of [
    "",
    "*",
    "*.example.com",
    "example .com",
    "http://",
    "localhost",
    "127.0.0.1",
    "example",
    "example.c",
    "a.b",
    "-example.com",
    "example-.com",
  ]) {
    assert.equal(parseDomainInput(input).ok, false, input);
  }
});

test("parseDomainInput rejects hostnames exceeding DNS length limits", () => {
  assert.equal(parseDomainInput(`${"a".repeat(64)}.com`).ok, false);
  assert.equal(parseDomainInput(`example.${"a".repeat(64)}`).ok, false);
  assert.equal(
    parseDomainInput(`${"a".repeat(63)}.${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(61)}.com`).ok,
    false,
  );
});

test("domainMatches matches exact hostnames and subdomains only", () => {
  assert.equal(domainMatches("example.com", "example.com"), true);
  assert.equal(domainMatches("app.example.com", "example.com"), true);
  assert.equal(domainMatches("deep.app.example.com", "example.com"), true);
  assert.equal(domainMatches("badexample.com", "example.com"), false);
  assert.equal(domainMatches("example.com.evil.com", "example.com"), false);
});

test("toDnrUrlFilter builds a declarativeNetRequest domain filter", () => {
  assert.equal(toDnrUrlFilter("example.com"), "||example.com^");
});

test("CommonJS require also exposes domain utilities on globalThis", () => {
  delete globalThis.ChromeWinSpoofDomainUtils;
  delete require.cache[require.resolve("../src/domain-utils")];

  require("../src/domain-utils");

  assert.equal(typeof globalThis.ChromeWinSpoofDomainUtils.parseDomainInput, "function");
  assert.equal(typeof globalThis.ChromeWinSpoofDomainUtils.domainMatches, "function");
  assert.equal(typeof globalThis.ChromeWinSpoofDomainUtils.toDnrUrlFilter, "function");
});
