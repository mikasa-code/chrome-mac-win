(function (global, factory) {
  var api = factory(global);
  global.ChromeWinSpoofDomainStore = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (global) {
  var domainUtils =
    typeof require === "function"
      ? require("./domain-utils")
      : global.ChromeWinSpoofDomainUtils;

  function addDomainRecord(records, input) {
    var currentRecords = Array.isArray(records) ? records : [];
    var parsed = domainUtils.parseDomainInput(input);

    if (!parsed.ok) {
      return { ok: false, error: parsed.error, records: currentRecords };
    }

    var duplicate = currentRecords.some(function (record) {
      if (!record) {
        return false;
      }

      var existing = domainUtils.parseDomainInput(record.domain);
      return existing.ok && existing.domain === parsed.domain;
    });
    if (duplicate) {
      return {
        ok: false,
        error: "Domain already exists.",
        records: currentRecords,
      };
    }

    return {
      ok: true,
      records: currentRecords.concat([{ domain: parsed.domain, enabled: true }]),
    };
  }

  function removeDomainRecord(records, domain) {
    var currentRecords = Array.isArray(records) ? records : [];
    return currentRecords.filter(function (record) {
      return !record || record.domain !== domain;
    });
  }

  function setDomainEnabled(records, domain, enabled) {
    var currentRecords = Array.isArray(records) ? records : [];
    return currentRecords.map(function (record) {
      if (!record || record.domain !== domain) {
        return record;
      }

      return Object.assign({}, record, { enabled: Boolean(enabled) });
    });
  }

  return {
    addDomainRecord,
    removeDomainRecord,
    setDomainEnabled,
  };
});
