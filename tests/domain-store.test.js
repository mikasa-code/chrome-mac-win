const assert = require("node:assert/strict");
const test = require("node:test");

const {
  addDomainRecord,
  removeDomainRecord,
  setDomainEnabled,
} = require("../src/domain-store");

test("addDomainRecord normalizes URL-like input and adds enabled record", () => {
  const records = [{ domain: "example.com", enabled: false }];
  const result = addDomainRecord(records, "HTTP://App.Example.COM:8080/login");

  assert.deepEqual(result, {
    ok: true,
    records: [
      { domain: "example.com", enabled: false },
      { domain: "app.example.com", enabled: true },
    ],
  });
  assert.deepEqual(records, [{ domain: "example.com", enabled: false }]);
  assert.notEqual(result.records, records);
});

test("addDomainRecord invalid input returns ok false and preserves current records", () => {
  const records = [{ domain: "example.com", enabled: true }];
  const result = addDomainRecord(records, "localhost");

  assert.deepEqual(result, {
    ok: false,
    error: undefined,
    records,
  });
});

test("addDomainRecord duplicate input returns ok false with duplicate error", () => {
  const records = [{ domain: "example.com", enabled: true }];
  const result = addDomainRecord(records, "https://EXAMPLE.com/path");

  assert.deepEqual(result, {
    ok: false,
    error: "Domain already exists.",
    records,
  });
});

test("addDomainRecord rejects duplicates from non-canonical existing records", () => {
  for (const records of [
    [{ domain: "Example.COM", enabled: true }],
    [{ domain: "HTTP://Example.COM/path", enabled: true }],
  ]) {
    const result = addDomainRecord(records, "example.com");

    assert.deepEqual(result, {
      ok: false,
      error: "Domain already exists.",
      records,
    });
  }
});

test("removeDomainRecord removes only requested domain", () => {
  const records = [
    { domain: "example.com", enabled: true },
    { domain: "app.example.com", enabled: true },
    { domain: "other.example", enabled: false },
  ];
  const result = removeDomainRecord(records, "app.example.com");

  assert.deepEqual(result, [
    { domain: "example.com", enabled: true },
    { domain: "other.example", enabled: false },
  ]);
  assert.deepEqual(records, [
    { domain: "example.com", enabled: true },
    { domain: "app.example.com", enabled: true },
    { domain: "other.example", enabled: false },
  ]);
  assert.notEqual(result, records);
});

test("setDomainEnabled updates only requested domain", () => {
  const records = [
    { domain: "example.com", enabled: true },
    { domain: "app.example.com", enabled: true },
  ];
  const result = setDomainEnabled(records, "app.example.com", 0);

  assert.deepEqual(result, [
    { domain: "example.com", enabled: true },
    { domain: "app.example.com", enabled: false },
  ]);
  assert.deepEqual(records, [
    { domain: "example.com", enabled: true },
    { domain: "app.example.com", enabled: true },
  ]);
  assert.notEqual(result, records);
});

test("non-array records inputs are handled as empty arrays", () => {
  assert.deepEqual(addDomainRecord(null, "example.com"), {
    ok: true,
    records: [{ domain: "example.com", enabled: true }],
  });
  assert.deepEqual(removeDomainRecord({ domain: "example.com" }, "example.com"), []);
  assert.deepEqual(setDomainEnabled(undefined, "example.com", false), []);
});

test("CommonJS require also exposes domain store on globalThis", () => {
  delete globalThis.ChromeWinSpoofDomainStore;
  delete require.cache[require.resolve("../src/domain-store")];

  require("../src/domain-store");

  assert.equal(typeof globalThis.ChromeWinSpoofDomainStore.addDomainRecord, "function");
  assert.equal(typeof globalThis.ChromeWinSpoofDomainStore.removeDomainRecord, "function");
  assert.equal(typeof globalThis.ChromeWinSpoofDomainStore.setDomainEnabled, "function");
});
