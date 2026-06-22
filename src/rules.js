(function (global, factory) {
  var api = factory(global);
  global.ChromeWinSpoofRules = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function (global) {
  var constants =
    typeof require === "function"
      ? require("./constants")
      : global.ChromeWinSpoofConstants;
  var domainUtils =
    typeof require === "function"
      ? require("./domain-utils")
      : global.ChromeWinSpoofDomainUtils;
  var SPOOF_RESOURCE_TYPES = [
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

  function buildDynamicRules(records) {
    if (!Array.isArray(records)) {
      return [];
    }

    var nextId = 1;
    var rules = [];

    records.forEach(function (record) {
      if (!record || record.enabled === false) {
        return;
      }

      var parsed = domainUtils.parseDomainInput(record.domain);
      if (!parsed.ok) {
        return;
      }

      rules.push({
        id: nextId,
        priority: 1,
        action: {
          type: "modifyHeaders",
          requestHeaders: [
            {
              header: "User-Agent",
              operation: "set",
              value: constants.WINDOWS_IDENTITY.userAgent,
            },
            {
              header: "Sec-CH-UA-Platform",
              operation: "set",
              value: "\"Windows\"",
            },
          ],
        },
        condition: {
          urlFilter: domainUtils.toDnrUrlFilter(parsed.domain),
          resourceTypes: SPOOF_RESOURCE_TYPES,
        },
      });
      nextId += 1;
    });

    return rules;
  }

  return {
    buildDynamicRules,
  };
});
