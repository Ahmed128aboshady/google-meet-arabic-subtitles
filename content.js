// Content Script for Google Meet Live Captions & Subtitle HUD

(function () {
  console.log("تم تشغيل إضافة ترجمة اجتماعات جوجل للعربية على التاب الحالي.");

  let hudContainer = null;
  let transcriptDrawer = null;
  let isEnabled = true;
  let currentFontSize = 22;
  let showOriginalText = true;

  // Debounce & Sentence Buffer State
  let sentenceBuffer = "";
  let lastSpeaker = "";
  let debounceTimer = null;
  let isTranslating = false;
  const DEBOUNCE_MS = 850; // Wait 850ms pause before translating full sentence

  // Initialize UI & Observers on page load
  function init() {
    createSubtitleHUD();
    createTranscriptDrawer();
    loadSettings();
    startCaptionObserver();
  }

  // 1. Create HUD Overlay Container
  function createSubtitleHUD() {
    if (document.getElementById("gmeet-ar-subtitle-hud")) return;

    hudContainer = document.createElement("div");
    hudContainer.id = "gmeet-ar-subtitle-hud";
    hudContainer.innerHTML = `
      <div class="hud-header" id="hud-drag-handle">
        <div class="hud-title">
          <span class="status-indicator" id="hud-status-dot"></span>
          <span>الترجمة الفورية للعربية</span>
          <span class="hud-badge">AI</span>
        </div>
        <div class="hud-actions">
          <button class="hud-btn" id="hud-btn-history" title="سجل المحادثة">📋</button>
          <button class="hud-btn" id="hud-btn-font-down" title="تصغير الخط">A-</button>
          <button class="hud-btn" id="hud-btn-font-up" title="تكبير الخط">A+</button>
          <button class="hud-btn" id="hud-btn-toggle-orig" title="إظهار/إخفاء النص الأصلي">👁️</button>
          <button class="hud-btn" id="hud-btn-minimize" title="تصغير/توسيع">_</button>
        </div>
      </div>
      <div class="hud-content-box" id="hud-content">
        <div class="speaker-tag" id="hud-speaker" style="display: none;">
          <span>👤</span> <span id="speaker-name-text">المتحدث</span>
        </div>
        <div class="original-text" id="hud-original-text">في انتظار بدء المحادثة أو تفعيل الـ Captions...</div>
        <div class="arabic-translation" id="hud-arabic-text">شريط الترجمة العربية جاهز ويعمل الآن ✨</div>
      </div>
    `;

    document.body.appendChild(hudContainer);

    makeElementDraggable(hudContainer, document.getElementById("hud-drag-handle"));
    setupHUDButtons();
  }

  // 2. Create Transcript Drawer Sidebar
  function createTranscriptDrawer() {
    if (document.getElementById("gmeet-ar-transcript-drawer")) return;

    transcriptDrawer = document.createElement("div");
    transcriptDrawer.id = "gmeet-ar-transcript-drawer";
    transcriptDrawer.innerHTML = `
      <div class="drawer-header">
        <h3>📋 سجل محادثات الاجتماع والترجمة</h3>
        <button class="hud-btn" id="drawer-btn-close">✕</button>
      </div>
      <div class="drawer-body" id="drawer-items-list">
        <!-- Transcript items populated dynamically -->
      </div>
      <div class="drawer-footer">
        <button class="btn-primary" id="btn-export-transcript">📥 تحميل السجل (TXT)</button>
      </div>
    `;

    document.body.appendChild(transcriptDrawer);

    document.getElementById("drawer-btn-close").addEventListener("click", () => {
      transcriptDrawer.classList.remove("open");
    });

    document.getElementById("btn-export-transcript").addEventListener("click", exportTranscript);
  }

  // 3. Set up Buttons & Controls
  function setupHUDButtons() {
    const minimizeBtn = document.getElementById("hud-btn-minimize");
    minimizeBtn.addEventListener("click", () => {
      hudContainer.classList.toggle("minimized");
      minimizeBtn.textContent = hudContainer.classList.contains("minimized") ? "+" : "_";
    });

    document.getElementById("hud-btn-history").addEventListener("click", () => {
      transcriptDrawer.classList.toggle("open");
    });

    document.getElementById("hud-btn-font-up").addEventListener("click", () => {
      if (currentFontSize < 36) {
        currentFontSize += 2;
        updateFontSize();
      }
    });

    document.getElementById("hud-btn-font-down").addEventListener("click", () => {
      if (currentFontSize > 14) {
        currentFontSize -= 2;
        updateFontSize();
      }
    });

    document.getElementById("hud-btn-toggle-orig").addEventListener("click", () => {
      showOriginalText = !showOriginalText;
      document.getElementById("hud-original-text").style.display = showOriginalText ? "block" : "none";
      chrome.storage.sync.set({ showOriginal: showOriginalText });
    });
  }

  function updateFontSize() {
    const arElem = document.getElementById("hud-arabic-text");
    if (arElem) arElem.style.fontSize = `${currentFontSize}px`;
    chrome.storage.sync.set({ fontSize: currentFontSize });
  }

  function loadSettings() {
    chrome.storage.sync.get(["fontSize", "showOriginal", "enabled"], (res) => {
      if (res.fontSize) {
        currentFontSize = res.fontSize;
        updateFontSize();
      }
      if (res.showOriginal !== undefined) {
        showOriginalText = res.showOriginal;
        document.getElementById("hud-original-text").style.display = showOriginalText ? "block" : "none";
      }
      if (res.enabled !== undefined) {
        isEnabled = res.enabled;
        hudContainer.style.display = isEnabled ? "block" : "none";
      }
    });
  }

  // 4. Drag & Drop Functionality
  function makeElementDraggable(elmnt, dragHandle) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    dragHandle.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
      if (e.target.classList.contains("hud-btn")) return;
      e.preventDefault();
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.onmouseup = closeDragElement;
      document.onmousemove = elementDrag;
      elmnt.classList.add("dragging");
    }

    function elementDrag(e) {
      e.preventDefault();
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;
      elmnt.style.top = (elmnt.offsetTop - pos2) + "px";
      elmnt.style.left = (elmnt.offsetLeft - pos1) + "px";
      elmnt.style.bottom = "auto";
      elmnt.style.transform = "none";
    }

    function closeDragElement() {
      document.onmouseup = null;
      document.onmousemove = null;
      elmnt.classList.remove("dragging");
    }
  }

  // 5. Google Meet Captions DOM Observer
  function startCaptionObserver() {
    // Observer looking for caption container insertions
    const observer = new MutationObserver(() => {
      if (!isEnabled) return;
      extractCaptionsFromDOM();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  // Extract caption text & speaker from Google Meet elements
  function extractCaptionsFromDOM() {
    // Selectors matching Google Meet's live caption containers across various Google Meet versions
    const captionNodes = document.querySelectorAll(
      'div[jsname="ds319b"], div[jscontroller="k9t41b"], .a70Wyd, .T6426b, div[data-captions-container] div'
    );

    let latestSpeaker = "";
    let fullRawCaption = "";

    // Try finding speaker and text block
    captionNodes.forEach((node) => {
      const text = node.innerText || node.textContent;
      if (!text || text.trim().length === 0) return;

      // Check if this node or a child is a speaker name tag
      const speakerElem = node.querySelector('.zsT38, .Vbk7vd, [jsname="r4n84e"]') || node.previousElementSibling;
      if (speakerElem && speakerElem.innerText) {
        latestSpeaker = speakerElem.innerText.trim();
      }

      fullRawCaption += " " + text.trim();
    });

    // Fallback: search general caption regions if specific classes differ
    if (!fullRawCaption.trim()) {
      const generalCaptions = document.querySelectorAll('[aria-label*="captions" i], [aria-label*="تفريغ" i]');
      generalCaptions.forEach(el => {
        fullRawCaption += " " + el.innerText.trim();
      });
    }

    fullRawCaption = cleanText(fullRawCaption);

    if (fullRawCaption && fullRawCaption !== sentenceBuffer) {
      sentenceBuffer = fullRawCaption;
      if (latestSpeaker) lastSpeaker = latestSpeaker;

      // Update live original display instantly
      updateHUDOriginalText(sentenceBuffer, lastSpeaker);

      // Debounce & buffer sentence for complete translation
      scheduleTranslation(sentenceBuffer, lastSpeaker);
    }
  }

  function cleanText(str) {
    return str.replace(/\s+/g, ' ').trim();
  }

  function updateHUDOriginalText(text, speaker) {
    const origElem = document.getElementById("hud-original-text");
    const speakerTag = document.getElementById("hud-speaker");
    const speakerText = document.getElementById("speaker-name-text");

    if (origElem) origElem.textContent = text;
    if (speaker && speaker.trim()) {
      speakerTag.style.display = "inline-flex";
      speakerText.textContent = speaker;
    }
  }

  // Schedule sentence translation with debouncing
  function scheduleTranslation(text, speaker) {
    if (debounceTimer) clearTimeout(debounceTimer);

    // If text ends with punctuation or pause, translate immediately
    const endsWithPunctuation = /[.?!;:\n]$/.test(text);
    const delay = endsWithPunctuation ? 300 : DEBOUNCE_MS;

    const statusDot = document.getElementById("hud-status-dot");
    if (statusDot) statusDot.classList.add("translating");

    debounceTimer = setTimeout(() => {
      executeTranslation(text, speaker);
    }, delay);
  }

  // Send translation request to background worker
  function executeTranslation(text, speaker) {
    if (!text || text.trim().length === 0) return;

    chrome.runtime.sendMessage(
      {
        action: "translateText",
        text: text,
        speaker: speaker
      },
      (response) => {
        const statusDot = document.getElementById("hud-status-dot");
        if (statusDot) statusDot.classList.remove("translating");

        if (response && response.success) {
          renderArabicTranslation(response.arabicText);
          addTranscriptItem(text, response.arabicText, speaker);
        }
      }
    );
  }

  function renderArabicTranslation(arabicText) {
    const arElem = document.getElementById("hud-arabic-text");
    if (arElem && arabicText) {
      arElem.textContent = arabicText;
    }
  }

  // Add translated item to Sidebar Drawer
  function addTranscriptItem(origText, arText, speaker) {
    const drawerList = document.getElementById("drawer-items-list");
    if (!drawerList) return;

    const timeStr = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    const itemElem = document.createElement("div");
    itemElem.className = "transcript-item";
    itemElem.innerHTML = `
      <div class="transcript-meta">
        <span>👤 ${speaker || "متحدث"}</span>
        <span>⏱️ ${timeStr}</span>
      </div>
      <div class="transcript-orig">${origText}</div>
      <div class="transcript-ar">${arText}</div>
    `;

    drawerList.appendChild(itemElem);
    drawerList.scrollTop = drawerList.scrollHeight;

    // Save to local storage via background worker
    chrome.runtime.sendMessage({
      action: "saveTranscriptItem",
      item: { speaker: speaker || "متحدث", time: timeStr, orig: origText, ar: arText }
    });
  }

  // Export full transcript as TXT
  function exportTranscript() {
    chrome.storage.local.get({ transcriptHistory: [] }, (res) => {
      const history = res.transcriptHistory;
      if (history.length === 0) {
        alert("لا يوجد سجل محادثات متاح للتحميل حتى الآن.");
        return;
      }

      let content = "=== سجل ترجمة اجتماع Google Meet ===\n\n";
      history.forEach((item) => {
        content += `[${item.time}] ${item.speaker}:\n`;
        content += `النص الأصلي: ${item.orig}\n`;
        content += `الترجمة العربية: ${item.ar}\n`;
        content += `----------------------------------------\n`;
      });

      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Meeting-Transcript-${new Date().toISOString().slice(0, 10)}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // Listen for setting changes from popup
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "toggleEnabled") {
      isEnabled = msg.enabled;
      if (hudContainer) hudContainer.style.display = isEnabled ? "block" : "none";
    }
  });

  // Run on initial load
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
