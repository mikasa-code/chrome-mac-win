(function (global, factory) {
  var api = factory();
  global.ChromeWinSpoofDomainUtils = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function parseDomainInput(input) {
    if (typeof input !== "string") {
      return { ok: false };
    }

    var value = input.trim().toLowerCase();
    if (!value || value.indexOf("*") !== -1 || /\s/.test(value)) {
      return { ok: false };
    }

    var withScheme = /^[a-z][a-z0-9+.-]*:\/\//.test(value)
      ? value
      : "https://" + value;
    var hostname;
    try {
      hostname = new URL(withScheme).hostname.toLowerCase();
    } catch (_error) {
      return { ok: false };
    }

    hostname = stripTrailingDot(hostname);
    if (!isValidHostname(hostname)) {
      return { ok: false };
    }

    return { ok: true, domain: hostname };
  }

  function domainMatches(hostname, configuredDomain) {
    if (typeof hostname !== "string" || typeof configuredDomain !== "string") {
      return false;
    }

    var normalizedHostname = stripTrailingDot(hostname.trim().toLowerCase());
    var normalizedDomain = stripTrailingDot(configuredDomain.trim().toLowerCase());
    return (
      normalizedHostname === normalizedDomain ||
      normalizedHostname.endsWith("." + normalizedDomain)
    );
  }

  function toDnrUrlFilter(domain) {
    return "||" + domain + "^";
  }

  function stripTrailingDot(value) {
    return value.endsWith(".") ? value.slice(0, -1) : value;
  }

  function isValidHostname(hostname) {
    if (
      !hostname ||
      hostname.length > 253 ||
      hostname === "localhost" ||
      /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)
    ) {
      return false;
    }

    var labels = hostname.split(".");
    if (labels.length < 2 || !/^[a-z]{2,63}$/.test(labels[labels.length - 1])) {
      return false;
    }

    return labels.every(function (label) {
      return (
        label.length > 0 &&
        label.length <= 63 &&
        /^[a-z0-9-]+$/.test(label) &&
        !label.startsWith("-") &&
        !label.endsWith("-")
      );
    });
  }

  return {
    parseDomainInput,
    domainMatches,
    toDnrUrlFilter,
  };
});
