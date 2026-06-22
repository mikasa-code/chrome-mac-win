# Chrome Windows Spoof

Chrome Windows Spoof is a Chrome Manifest V3 extension that makes selected
domains see macOS Chrome as Windows Chrome.

## What It Spoofs

- Request headers via Declarative Net Request:
  - `User-Agent`
  - `Sec-CH-UA`
  - `Sec-CH-UA-Platform`
  - `Sec-CH-UA-Arch`
  - `Sec-CH-UA-Bitness`
  - `Sec-CH-UA-Model`
  - `Sec-CH-UA-Platform-Version`
  - `Sec-CH-UA-Full-Version`
  - `Sec-CH-UA-Full-Version-List`
- JavaScript `navigator` fields on configured pages:
  - `navigator.userAgent`
  - `navigator.platform`
  - `navigator.vendor`
  - `navigator.maxTouchPoints`
  - `navigator.userAgentData.platform`
  - `navigator.userAgentData.brands`
  - selected `navigator.userAgentData.getHighEntropyValues()` hints

The background service worker builds dynamic DNR rules for request headers and
registers `src/page-spoof.js` as a dynamic content script in the page's `MAIN`
world at `document_start` for all frames on configured domains.

## Domain Matching

Adding `example.com` applies spoofing to `example.com` and subdomains such as
`www.example.com` or `app.example.com`. Other domains are not affected.

## Install

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this extension directory.

## Use

1. Click the extension icon.
2. Enter a domain such as `example.com` and click **Add**.
3. Use the checkbox to enable or disable spoofing for a domain.
4. Click **Remove** to delete a domain.
5. Reload already open pages after adding, enabling, disabling, or removing a
   domain so the page script and request rules apply to the next load.

## Verify

On a configured domain, open DevTools Console and run:

```js
await navigator.userAgentData.getHighEntropyValues([
  "platform",
  "architecture",
  "bitness",
  "platformVersion",
  "uaFullVersion",
  "fullVersionList",
]);
({
  userAgent: navigator.userAgent,
  platform: navigator.platform,
  vendor: navigator.vendor,
  maxTouchPoints: navigator.maxTouchPoints,
  uaDataPlatform: navigator.userAgentData && navigator.userAgentData.platform,
  uaDataBrands: navigator.userAgentData && navigator.userAgentData.brands,
});
```

The values should report a Windows Chrome identity. A request-inspection
endpoint, such as an HTTP headers echo service, can verify the spoofed request
headers.

## Test

```sh
npm test
```

## Limits

This is not a full anti-fingerprinting browser. It does not spoof Canvas,
WebGL, fonts, GPU details, audio, rendering behavior, timing behavior, installed
extensions, browser internals, or every possible fingerprinting surface. It
aligns common User-Agent, UA-CH, and selected `navigator` values for configured
domains only.
