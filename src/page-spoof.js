(function () {
  var WINDOWS_IDENTITY = {
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
      brands: [
        { brand: "Not/A)Brand", version: "8" },
        { brand: "Chromium", version: "126" },
        { brand: "Google Chrome", version: "126" },
      ],
      fullVersionList: [
        { brand: "Not/A)Brand", version: "8.0.0.0" },
        { brand: "Chromium", version: "126.0.0.0" },
        { brand: "Google Chrome", version: "126.0.0.0" },
      ],
    },
  };
  var highEntropyKeys = WINDOWS_IDENTITY.uaData;

  function defineGetter(target, key, value) {
    try {
      Object.defineProperty(target, key, {
        configurable: true,
        get: function () {
          return value;
        },
      });
    } catch (_error) {
      // Some Navigator properties are non-configurable in hardened contexts.
    }
  }

  defineGetter(navigator, "userAgent", WINDOWS_IDENTITY.userAgent);
  defineGetter(navigator, "platform", WINDOWS_IDENTITY.platform);
  defineGetter(navigator, "vendor", WINDOWS_IDENTITY.vendor);
  defineGetter(navigator, "maxTouchPoints", WINDOWS_IDENTITY.maxTouchPoints);

  if (navigator.userAgentData) {
    var userAgentData = navigator.userAgentData;
    var originalGetHighEntropyValues = userAgentData.getHighEntropyValues;

    defineGetter(userAgentData, "platform", WINDOWS_IDENTITY.uaData.platform);
    defineGetter(userAgentData, "brands", WINDOWS_IDENTITY.uaData.brands);

    try {
      Object.defineProperty(userAgentData, "getHighEntropyValues", {
        configurable: true,
        value: function (hints) {
          var requestedHints = Array.isArray(hints) ? hints : [];
          var originalValues =
            typeof originalGetHighEntropyValues === "function"
              ? originalGetHighEntropyValues.call(userAgentData, hints)
              : {};

          return Promise.resolve(originalValues).then(function (values) {
            var result = Object.assign({}, values);
            requestedHints.forEach(function (hint) {
              if (Object.prototype.hasOwnProperty.call(highEntropyKeys, hint)) {
                result[hint] = highEntropyKeys[hint];
              }
            });
            return result;
          });
        },
      });
    } catch (_error) {
      // Ignore non-configurable userAgentData methods.
    }
  }
})();
