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

  function quoteHeaderValue(value) {
    return "\"" + value + "\"";
  }

  function formatBrandList(brands) {
    return brands
      .map(function (brand) {
        return quoteHeaderValue(brand.brand) + ";v=" + quoteHeaderValue(brand.version);
      })
      .join(", ");
  }

  function buildRequestHeaders() {
    var identity = constants.WINDOWS_IDENTITY;
    var uaData = identity.uaData;

    return [
      {
        header: "User-Agent",
        operation: "set",
        value: identity.userAgent,
      },
      {
        header: "Sec-CH-UA",
        operation: "set",
        value: formatBrandList(uaData.brands),
      },
      {
        header: "Sec-CH-UA-Platform",
        operation: "set",
        value: quoteHeaderValue(uaData.platform),
      },
      {
        header: "Sec-CH-UA-Arch",
        operation: "set",
        value: quoteHeaderValue(uaData.architecture),
      },
      {
        header: "Sec-CH-UA-Bitness",
        operation: "set",
        value: quoteHeaderValue(uaData.bitness),
      },
      {
        header: "Sec-CH-UA-Model",
        operation: "set",
        value: quoteHeaderValue(uaData.model),
      },
      {
        header: "Sec-CH-UA-Platform-Version",
        operation: "set",
        value: quoteHeaderValue(uaData.platformVersion),
      },
      {
        header: "Sec-CH-UA-Full-Version",
        operation: "set",
        value: quoteHeaderValue(uaData.uaFullVersion),
      },
      {
        header: "Sec-CH-UA-Full-Version-List",
        operation: "set",
        value: formatBrandList(uaData.fullVersionList),
      },
    ];
  }

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
          requestHeaders: buildRequestHeaders(),
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
