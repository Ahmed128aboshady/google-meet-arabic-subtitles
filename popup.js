document.addEventListener("DOMContentLoaded", () => {
  const toggleExt = document.getElementById("toggle-extension");
  const targetLangSelect = document.getElementById("target-lang-select");
  const engineSelect = document.getElementById("engine-select");
  const apiKeyInput = document.getElementById("api-key-input");
  const fontSizeInput = document.getElementById("font-size-input");
  const btnSave = document.getElementById("btn-save-settings");
  const toast = document.getElementById("save-toast");
  const apiKeyGroup = document.getElementById("api-key-group");

  // Load existing settings
  chrome.storage.sync.get(["enabled", "targetLang", "engine", "apiKey", "fontSize"], (res) => {
    toggleExt.checked = res.enabled !== false;
    targetLangSelect.value = res.targetLang || "ar";
    engineSelect.value = res.engine || "fast";
    apiKeyInput.value = res.apiKey || "";
    fontSizeInput.value = res.fontSize || 22;

    toggleApiKeyVisibility();
  });

  engineSelect.addEventListener("change", toggleApiKeyVisibility);

  function toggleApiKeyVisibility() {
    if (engineSelect.value === "gemini") {
      apiKeyGroup.style.display = "block";
    } else {
      apiKeyGroup.style.display = "none";
    }
  }

  // Toggle enable/disable instantly
  toggleExt.addEventListener("change", () => {
    const isEnabled = toggleExt.checked;
    chrome.storage.sync.set({ enabled: isEnabled });

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].url.includes("meet.google.com")) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "toggleEnabled", enabled: isEnabled });
      }
    });
  });

  // Save settings button
  btnSave.addEventListener("click", () => {
    const settings = {
      enabled: toggleExt.checked,
      targetLang: targetLangSelect.value,
      engine: engineSelect.value,
      apiKey: apiKeyInput.value.trim(),
      fontSize: parseInt(fontSizeInput.value, 10) || 22
    };

    chrome.storage.sync.set(settings, () => {
      toast.style.display = "block";
      setTimeout(() => {
        toast.style.display = "none";
      }, 2000);

      // Notify content script of target language update
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].url.includes("meet.google.com")) {
          chrome.tabs.sendMessage(tabs[0].id, { action: "updateLanguage", targetLang: settings.targetLang });
        }
      });
    });
  });
});
