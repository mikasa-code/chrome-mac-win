(function () {
  var STORAGE_KEY = ChromeWinSpoofConstants.STORAGE_KEY;
  var addDomainRecord = ChromeWinSpoofDomainStore.addDomainRecord;
  var removeDomainRecord = ChromeWinSpoofDomainStore.removeDomainRecord;
  var setDomainEnabled = ChromeWinSpoofDomainStore.setDomainEnabled;

  var currentRecords = [];
  var isLoaded = false;
  var form = document.getElementById("domain-form");
  var input = document.getElementById("domain-input");
  var submitButton = form.querySelector('button[type="submit"]');
  var error = document.getElementById("domain-error");
  var list = document.getElementById("domain-list");
  var emptyState = document.getElementById("empty-state");

  function setError(message) {
    error.textContent = message || "";
  }

  function setFormEnabled(enabled) {
    input.disabled = !enabled;
    submitButton.disabled = !enabled;
  }

  function saveRecords(records) {
    currentRecords = records;
    renderRecords();
    chrome.storage.local.set({ [STORAGE_KEY]: records });
  }

  function renderRecords() {
    var validRecords = currentRecords.filter(function (record) {
      return record && record.domain;
    });

    list.replaceChildren();
    emptyState.hidden = validRecords.length > 0;

    validRecords.forEach(function (record) {
      var item = document.createElement("li");
      var checkbox = document.createElement("input");
      var domain = document.createElement("span");
      var removeButton = document.createElement("button");

      item.className = "domain-item";
      checkbox.type = "checkbox";
      checkbox.checked = record.enabled !== false;
      checkbox.setAttribute("aria-label", "Enable spoofing for " + record.domain);
      domain.className = "domain-name";
      domain.textContent = record.domain;
      removeButton.type = "button";
      removeButton.className = "remove-button";
      removeButton.textContent = "Remove";
      removeButton.setAttribute("aria-label", "Remove " + record.domain);

      checkbox.addEventListener("change", function () {
        saveRecords(setDomainEnabled(currentRecords, record.domain, checkbox.checked));
      });
      removeButton.addEventListener("click", function () {
        saveRecords(removeDomainRecord(currentRecords, record.domain));
      });

      item.append(checkbox, domain, removeButton);
      list.append(item);
    });
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (!isLoaded) {
      return;
    }

    setError("");

    var result = addDomainRecord(currentRecords, input.value);
    if (!result.ok) {
      setError(result.error || "Enter a valid domain.");
      return;
    }

    input.value = "";
    saveRecords(result.records);
  });

  setFormEnabled(false);

  chrome.storage.local.get({ [STORAGE_KEY]: [] }, function (items) {
    var storedRecords = items && items[STORAGE_KEY];
    currentRecords = Array.isArray(storedRecords) ? storedRecords : [];
    renderRecords();
    isLoaded = true;
    setFormEnabled(true);
  });
})();
