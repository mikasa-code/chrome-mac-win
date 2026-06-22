(function (global, factory) {
  var api = factory();
  global.ChromeWinSpoofConstants = api;

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  var STORAGE_KEY = "spoofDomains";
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

  return {
    STORAGE_KEY,
    WINDOWS_IDENTITY,
  };
});
