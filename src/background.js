importScripts("constants.js", "domain-utils.js", "rules.js");

var STORAGE_KEY = self.ChromeWinSpoofConstants.STORAGE_KEY;
var parseDomainInput = self.ChromeWinSpoofDomainUtils.parseDomainInput;
var buildDynamicRules = self.ChromeWinSpoofRules.buildDynamicRules;
var PAGE_SCRIPT_ID = "chrome-windows-spoof-page";
let refreshInFlight = false;
let refreshQueued = false;

async function getStoredDomains() {
  var stored = await chrome.storage.local.get({ [STORAGE_KEY]: [] });
  return Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : [];
}

function buildContentScriptMatches(records) {
  if (!Array.isArray(records)) {
    return [];
  }

  var seen = {};
  var matches = [];
  records.forEach(function (record) {
    if (!record || record.enabled === false) {
      return;
    }

    var parsed = parseDomainInput(record.domain);
    if (!parsed.ok || seen[parsed.domain]) {
      return;
    }

    seen[parsed.domain] = true;
    matches.push("*://" + parsed.domain + "/*");
    matches.push("*://*." + parsed.domain + "/*");
  });

  return matches;
}

async function unregisterPageSpoofScript() {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [PAGE_SCRIPT_ID] });
  } catch (_error) {
    // Chrome rejects when the dynamic content script is not currently registered.
  }
}

async function refreshRegisteredContentScripts(records) {
  var matches = buildContentScriptMatches(records);

  await unregisterPageSpoofScript();
  if (matches.length === 0) {
    return;
  }

  await chrome.scripting.registerContentScripts([
    {
      id: PAGE_SCRIPT_ID,
      matches,
      js: ["src/page-spoof.js"],
      runAt: "document_start",
      allFrames: true,
      world: "MAIN",
    },
  ]);
}

async function refreshDynamicRules(records) {
  var currentRules = await chrome.declarativeNetRequest.getDynamicRules();
  var removeRuleIds = currentRules.map(function (rule) {
    return rule.id;
  });

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules: buildDynamicRules(records),
  });
}

async function refreshSpoofing() {
  var records = await getStoredDomains();
  await refreshDynamicRules(records);
  await refreshRegisteredContentScripts(records);
}

async function drainRefreshQueue() {
  try {
    do {
      refreshQueued = false;
      await refreshSpoofing().catch((error) => {
        console.error("Failed to refresh dynamic rules", error);
      });
    } while (refreshQueued);
  } finally {
    refreshInFlight = false;
  }
}

function runRefreshDynamicRules() {
  if (refreshInFlight) {
    refreshQueued = true;
    return;
  }

  refreshInFlight = true;
  drainRefreshQueue();
}

chrome.runtime.onInstalled.addListener(runRefreshDynamicRules);
chrome.runtime.onStartup.addListener(runRefreshDynamicRules);
chrome.storage.onChanged.addListener(function (changes, areaName) {
  if (areaName === "local" && changes[STORAGE_KEY]) {
    runRefreshDynamicRules();
  }
});
