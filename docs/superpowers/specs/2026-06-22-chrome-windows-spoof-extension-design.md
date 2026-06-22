# Chrome Windows Spoof Extension Design

## Goal

Build a local Chrome Manifest V3 extension that lets a user on macOS make selected websites see the browser as Windows Chrome. The user manages target domains from the extension popup. A configured domain matches both the exact domain and all subdomains.

## Confirmed Requirements

- The extension must support "full spoofing" for configured domains:
  - HTTP request headers visible to the server.
  - JavaScript-visible `navigator` properties visible to the page.
- Domain management must happen from the extension popup.
- A configured domain such as `example.com` must match:
  - `example.com`
  - `www.example.com`
  - `app.example.com`
  - any other subdomain under `example.com`
- The extension is local-first:
  - No remote service.
  - No analytics.
  - Domain settings stored only in `chrome.storage.local`.
- The extension should be directly loadable from `chrome://extensions` as an unpacked extension.

## Non-Goals

- Do not build a full anti-fingerprinting browser.
- Do not spoof Canvas, WebGL, font lists, audio fingerprinting, screen scaling, hardware concurrency, GPU strings, or system font rendering.
- Do not add sync, accounts, cloud storage, or remote rule delivery.
- Do not add a bundler unless the implementation proves it is needed.
- Do not support Firefox or Safari in this version.

## Recommended Approach

Use Manifest V3 with dynamic `declarativeNetRequest` rules for request headers and a page-world injected script for JavaScript-visible `navigator` values.

This approach is the best fit because it stays inside normal Chrome extension APIs, supports popup-driven domain changes, and covers both server-side and page-side common checks. It will not defeat strict anti-fraud systems that combine many browser and device signals.

## Alternatives Considered

### Content Script Only

This would override page-side JavaScript values but would leave HTTP request headers unchanged. It does not satisfy the full spoofing requirement.

### Local Proxy or Chrome Debugging Protocol

This would provide more control over traffic, but it is not a normal browser extension workflow. It would make installation and daily use more complex than needed for this project.

## Architecture

### `manifest.json`

Defines a Chrome Manifest V3 extension with:

- `storage` permission for saved domain settings.
- `declarativeNetRequestWithHostAccess` permission for request header modification.
- Host access for all URLs, with actual behavior restricted by the user-managed domain list.
- A browser action popup for domain management.
- A service worker background script.
- A content script that runs at `document_start`.
- A `web_accessible_resources` entry for `src/page-spoof.js`, so matching pages can load the injected page-world script.

### `src/domain-utils.js`

Owns domain parsing and matching:

- Normalize user input into a bare lowercase hostname.
- Strip protocol, path, query, hash, port, and trailing dot.
- Reject empty values, wildcards, spaces, and invalid hostnames.
- Match an active hostname against a configured domain.
- Generate URL filters for exact domain and subdomain coverage.

This module is shared by popup logic, background logic, content logic, and tests.

### `src/rules.js`

Builds dynamic Declarative Net Request rules from configured domains:

- One or more rules per domain for HTTP and HTTPS.
- Request header modifications for:
  - `User-Agent`
  - `Sec-CH-UA-Platform`
- Stable rule IDs derived from domain list order.

The rule builder stays separate from the service worker so it can be tested with Node.

### `src/background.js`

Runs as the Manifest V3 service worker:

- Reads configured domains from `chrome.storage.local`.
- Rebuilds dynamic DNR rules on install, startup, and storage changes.
- Removes old dynamic rules before adding the current rule set.

### `src/content.js`

Runs at `document_start` on all pages:

- Reads configured domains from `chrome.storage.local`.
- Checks whether `window.location.hostname` matches any configured domain.
- If matched, injects `src/page-spoof.js` into the page main world by appending a `<script>` element whose source is `chrome.runtime.getURL("src/page-spoof.js")`.

The content script does not spoof anything on non-matching domains.

### `src/page-spoof.js`

Runs in the page main world and changes JavaScript-visible browser identity values:

- `navigator.platform` returns `Win32`.
- `navigator.userAgent` returns a Windows Chrome user agent.
- `navigator.vendor` returns `Google Inc.`
- `navigator.maxTouchPoints` returns `0`.
- `navigator.userAgentData.platform` returns `Windows` where available.
- `navigator.userAgentData.getHighEntropyValues()` returns Windows-like values for supported keys.

The script should preserve existing object shapes where practical and avoid throwing if a property cannot be overridden.

### `popup.html`, `src/popup.js`, `styles/popup.css`

Provides a compact management UI:

- Input for adding a domain.
- List of saved domains.
- Delete button per domain.
- Enabled checkbox per domain.
- Inline validation message for invalid or duplicate domains.

The popup stores a list of domain records:

```json
[
  {
    "domain": "example.com",
    "enabled": true
  }
]
```

## Spoofed Windows Values

Initial values:

```text
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36
navigator.platform: Win32
navigator.vendor: Google Inc.
navigator.maxTouchPoints: 0
navigator.userAgentData.platform: Windows
architecture: x86
bitness: 64
model:
platform: Windows
platformVersion: 15.0.0
uaFullVersion: 126.0.0.0
```

The Chrome version is intentionally fixed for the first version to keep the implementation simple and deterministic. A future version can derive it from the running browser if needed.

## Data Flow

1. The user opens the extension popup.
2. The user adds `example.com`.
3. The popup normalizes the input and stores `{ "domain": "example.com", "enabled": true }` in `chrome.storage.local`.
4. The background service worker sees the storage change.
5. The background service worker rebuilds dynamic DNR rules for enabled domains.
6. Future requests to `example.com` and subdomains receive Windows request headers.
7. On matching pages, `src/content.js` runs at `document_start`.
8. The content script appends a script element that loads `src/page-spoof.js` from the extension's web-accessible resources.
9. Page scripts see Windows values when reading common `navigator` identity fields.

## Validation Rules

Accepted input examples:

- `example.com`
- `www.example.com`
- `https://example.com/path`
- `HTTP://App.Example.COM:8080/login`

Stored values:

- `example.com`
- `www.example.com`
- `example.com`
- `app.example.com`

Rejected input examples:

- empty string
- `*`
- `*.example.com`
- `example .com`
- `http://`
- `localhost`
- IP addresses

`localhost` and IP addresses are excluded in the first version to keep domain matching focused on real website hostnames.

## Testing Strategy

Use Node's built-in test runner for pure logic tests. Keep Chrome API usage behind small boundaries so the critical logic can be tested without a browser.

Test coverage:

- Domain normalization:
  - Lowercases input.
  - Removes protocol, path, query, hash, port, and trailing dot.
  - Rejects invalid hostnames.
- Domain matching:
  - `example.com` matches `example.com`.
  - `app.example.com` matches `example.com`.
  - `badexample.com` does not match `example.com`.
  - `example.com.evil.com` does not match `example.com`.
- Rule generation:
  - Enabled domains produce DNR rules.
  - Disabled domains produce no DNR rules.
  - Header names and values match the agreed Windows identity.
- Popup storage helpers:
  - Adding a valid domain creates one enabled record.
  - Adding a duplicate domain returns a validation error.
  - Deleting a domain removes only that record.
  - Toggling enabled state updates only that record.

Manual verification:

- Load the unpacked extension in Chrome on macOS.
- Add a test domain in the popup.
- Open a page on that domain.
- Confirm `navigator.platform`, `navigator.userAgent`, and `navigator.userAgentData.platform` show Windows values.
- Confirm a request inspection endpoint sees a Windows `User-Agent` and `Sec-CH-UA-Platform`.
- Confirm an unconfigured domain still shows the normal macOS values.

## Success Criteria

- The extension loads as an unpacked Chrome extension without a build step.
- The popup can add, delete, and toggle configured domains.
- Configured domains affect both exact hostnames and subdomains.
- Non-configured domains are not spoofed.
- Logic tests pass with Node.
- README explains installation, domain management, verification, and known limits.

## Known Limits

- Strict anti-fraud or anti-bot systems may still detect macOS through advanced fingerprinting.
- Chrome may restrict or normalize some Client Hints behavior internally.
- Existing page scripts that run before the injection can observe original values.
- Fixed Chrome version strings may diverge from the installed browser version over time.
