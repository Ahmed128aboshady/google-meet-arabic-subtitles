// Content Script for Google Meet Live Captions & Subtitle HUD

(function () {
  console.log("تم تشغيل إضافة ترجمة اجتماعات جوجل للعربية على التاب الحالي.");

  let hudContainer = null;
  let transcriptDrawer = null;
  let isEnabled = true;
  let currentFontSize = 22;
  let showOriginalText = true;

  // Utterance State tracking
  let currentUtteranceText = "";
  let lastSpeaker = "";
  let lastTranslatedText = "";
  let debounceTimer = null;
  const DEBOUNCE_MS = 750; // Wait 750ms for speaker pause before translating

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
        <div class="original-text" id="hud-original-text">في انتظار بدء المحادثة... (تأكد من تفعيل الـ Captions في Google Meet)</div>
        <div class="arabic-translation" id="hud-arabic-text">شريط الترجمة العربية جاهز ومُنقّط بنجاح ✨</div>
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

  // Extract caption text & speaker cleanly from Google Meet elements
  function extractCaptionsFromDOM() {
    // Find speaker blocks in Google Meet
    const blocks = document.querySelectorAll(
      'div[jsname="ds319b"], div[jscontroller="k9t41b"], div[data-captions-container] > div'
    );

    let activeBlock = null;

    if (blocks.length > 0) {
      // Pick the LAST block (the currently spoken active utterance)
      activeBlock = blocks[blocks.length - 1];
    } else {
      // Fallback: pick last caption container
      const captionNodes = document.querySelectorAll('.a70Wyd, .T6426b');
      if (captionNodes.length > 0) {
        activeBlock = captionNodes[captionNodes.length - 1].parentElement;
      }
    }

    if (!activeBlock) return;

    // Extract speaker name
    let speakerName = "";
    const speakerElem = activeBlock.querySelector('[jsname="r4n84e"], .zsT38, .Vbk7vd');
    if (speakerElem && speakerElem.innerText) {
      speakerName = speakerElem.innerText.trim();
    }

    // Extract text content from text spans inside activeBlock
    let textElems = activeBlock.querySelectorAll('.a70Wyd, .T6426b, span[jsname]');
    let rawText = "";

    if (textElems.length > 0) {
      textElems.forEach(el => {
        const txt = el.innerText || el.textContent;
        if (txt && !txt.includes(speakerName)) {
          rawText += " " + txt.trim();
        }
      });
    } else {
      rawText = activeBlock.innerText || activeBlock.textContent || "";
    }

    // Remove speaker name if it got prepended inside rawText
    if (speakerName && rawText.startsWith(speakerName)) {
      rawText = rawText.substring(speakerName.length).trim();
    }

    // Clean UI artifacts & garbage
    rawText = cleanText(rawText);

    if (!rawText || rawText.length < 2) return;

    // Check if new content arrived
    if (rawText !== currentUtteranceText || speakerName !== lastSpeaker) {
      currentUtteranceText = rawText;
      if (speakerName) lastSpeaker = speakerName;

      // Update live original text instantly
      updateHUDOriginalText(currentUtteranceText, lastSpeaker);

      // Debounce & buffer sentence for complete translation
      scheduleTranslation(currentUtteranceText, lastSpeaker);
    }
  }

  function cleanText(str) {
    return str
      .replace(/closed_caption/gi, '')
      .replace(/closed caption/gi, '')
      .replace(/\[\s*closed_caption\s*\]/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function updateHUDOriginalText(text, speaker) {
    const origElem = document.getElementById("hud-original-text");
    const speakerTag = document.getElementById("hud-speaker");
    const speakerText = document.getElementById("speaker-name-text");

    if (origElem) origElem.textContent = text;
    if (speaker && speaker.trim()) {
      speakerTag.style.display = "inline-flex";
      speakerText.textContent = speaker === "You" ? "أنت" : speaker;
    }
  }

  // Schedule sentence translation with debouncing
  function scheduleTranslation(text, speaker) {
    if (debounceTimer) clearTimeout(debounceTimer);

    const endsWithPunctuation = /[.?!;:\n]$/.test(text);
    const delay = endsWithPunctuation ? 250 : DEBOUNCE_MS;

    const statusDot = document.getElementById("hud-status-dot");
    if (statusDot) statusDot.classList.add("translating");

    debounceTimer = setTimeout(() => {
      executeTranslation(text, speaker);
    }, delay);
  }

  // Send translation request to background worker
  function executeTranslation(text, speaker) {
    if (!text || text.trim().length === 0) return;
    if (text === lastTranslatedText) return;

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
          lastTranslatedText = text;
          renderArabicTranslation(response.arabicText);
          addTranscriptItem(text, response.arabicText, speaker);
        }
      }
    );
  }

  // Format and render Arabic translation with clean line breaks per sentence
  function renderArabicTranslation(arabicText) {
    const arElem = document.getElementById("hud-arabic-text");
    if (!arElem || !arabicText) return;

    // Clean any unwanted artifacts
    let cleanedAr = arabicText
      .replace(/ closed_caption/gi, '')
      .replace(/closed_caption/gi, '')
      .replace(/^أنت\s+/g, '') // remove redundant leading "أنت " if inserted by mistake
      .trim();

    // Format multiple sentences cleanly into distinct lines/paragraphs
    const sentences = cleanedAr.split(/(?<=[.؟!])\s+/);
    if (sentences.length > 1) {
      arElem.innerHTML = sentences.map(s => `<div class="ar-line">${s.trim()}</div>`).join('');
    } else {
      arElem.textContent = cleanedAr;
    }
  }

  // Add translated item to Sidebar Drawer
  function addTranscriptItem(origText, arText, speaker) {
    const drawerList = document.getElementById("drawer-items-list");
    if (!drawerList) return;

    const displaySpeaker = speaker === "You" ? "أنت" : (speaker || "متحدث");
    const timeStr = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    
    const itemElem = document.createElement("div");
    itemElem.className = "transcript-item";
    itemElem.innerHTML = `
      <div class="transcript-meta">
        <span>👤 ${displaySpeaker}</span>
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
      item: { speaker: displaySpeaker, time: timeStr, orig: origText, ar: arText }
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
