importScripts("constants.js", "domain-utils.js", "rules.js");

var STORAGE_KEY = self.ChromeWinSpoofConstants.STORAGE_KEY;
var buildDynamicRules = self.ChromeWinSpoofRules.buildDynamicRules;
let refreshInFlight = false;
let refreshQueued = false;

async function getStoredDomains() {
  var stored = await chrome.storage.local.get({ [STORAGE_KEY]: [] });
  return Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : [];
}

async function refreshDynamicRules() {
  var records = await getStoredDomains();
  var currentRules = await chrome.declarativeNetRequest.getDynamicRules();
  var removeRuleIds = currentRules.map(function (rule) {
    return rule.id;
  });

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules: buildDynamicRules(records),
  });
}

async function drainRefreshQueue() {
  try {
    do {
      refreshQueued = false;
      await refreshDynamicRules().catch((error) => {
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
