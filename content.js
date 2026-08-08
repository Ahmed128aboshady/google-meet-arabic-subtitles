// Content Script for Google Meet Live Captions & Subtitle HUD

(function () {
  console.log("%c[Meet-Arabic-Subtitles] تم تشغيل الإضافة بنجاح على التاب الحالي! 🚀", "color: #818cf8; font-weight: bold; font-size: 14px;");

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
  const DEBOUNCE_MS = 650; // Wait 650ms pause before translating

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
        <div class="original-text" id="hud-original-text">في انتظار بدء المحادثة... (تأكد من تفعيل الـ Captions CC في Google Meet)</div>
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

  // 5. Multi-Strategy Google Meet Captions DOM Observer
  function startCaptionObserver() {
    // Scan DOM continuously with MutationObserver + fallback periodic polling
    const observer = new MutationObserver(() => {
      if (!isEnabled) return;
      extractCaptionsFromDOM();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });

    // Interval fallback to catch fast UI updates
    setInterval(() => {
      if (isEnabled) extractCaptionsFromDOM();
    }, 400);
  }

  // Multi-Strategy Caption Extractor
  function extractCaptionsFromDOM() {
    let rawText = "";
    let speakerName = "";

    // --- Strategy 1: Specific Google Meet Captions attributes & classes ---
    const knownBlocks = document.querySelectorAll(
      'div[jsname="ds319b"], div[jscontroller="k9t41b"], div[data-captions-container] > div, div[jsname="V21rUb"]'
    );

    if (knownBlocks.length > 0) {
      const activeBlock = knownBlocks[knownBlocks.length - 1];
      const speakerElem = activeBlock.querySelector('[jsname="r4n84e"], .zsT38, .Vbk7vd');
      if (speakerElem) speakerName = speakerElem.innerText.trim();

      const textElems = activeBlock.querySelectorAll('.a70Wyd, .T6426b, span[jsname]');
      if (textElems.length > 0) {
        textElems.forEach(el => {
          const txt = el.innerText || el.textContent;
          if (txt && !txt.includes(speakerName)) rawText += " " + txt.trim();
        });
      } else {
        rawText = activeBlock.innerText || activeBlock.textContent || "";
      }
    }

    // --- Strategy 2: ARIA Live Regions & Captions Labels (Universal Accessibillity) ---
    if (!rawText.trim()) {
      const ariaNodes = document.querySelectorAll(
        '[aria-live="polite"], [aria-live="assertive"], [aria-label*="caption" i], [aria-label*="tasmeyat" i], [aria-label*="تسميات" i]'
      );

      for (let i = ariaNodes.length - 1; i >= 0; i--) {
        const node = ariaNodes[i];
        if (node.id && node.id.includes("gmeet-ar")) continue;
        const text = node.innerText || node.textContent;
        if (text && text.trim().length > 1) {
          rawText = text.trim();
          break;
        }
      }
    }

    // --- Strategy 3: Heuristic scan for floating captions panel (Bottom-left Google Meet overlay) ---
    if (!rawText.trim()) {
      const allDivs = document.querySelectorAll('div');
      for (let i = allDivs.length - 1; i >= 0; i--) {
        const div = allDivs[i];
        if (div.id && div.id.includes("gmeet-ar")) continue;
        
        const txt = (div.innerText || "").trim();
        if (txt.length >= 2 && txt.length < 450) {
          const rect = div.getBoundingClientRect();
          // Check if located in bottom-left or bottom area of screen (where captions appear)
          if (rect.bottom > window.innerHeight * 0.4 && rect.left < window.innerWidth * 0.7 && rect.height > 15 && rect.height < 320) {
            // Exclude control bar buttons
            if (!div.querySelector('button, input, nav')) {
              // Extract lines
              const lines = txt.split('\n').map(l => l.trim()).filter(l => l.length > 0);
              if (lines.length >= 2 && (lines[0] === "You" || lines[0].length < 25)) {
                speakerName = lines[0];
                rawText = lines.slice(1).join(' ');
              } else {
                rawText = txt;
              }
              break;
            }
          }
        }
      }
    }

    // Clean speaker name from rawText if prepended
    if (speakerName && rawText.startsWith(speakerName)) {
      rawText = rawText.substring(speakerName.length).trim();
    }

    rawText = cleanText(rawText);

    if (!rawText || rawText.length < 2) return;

    // Check if new content arrived
    if (rawText !== currentUtteranceText || speakerName !== lastSpeaker) {
      currentUtteranceText = rawText;
      if (speakerName) lastSpeaker = speakerName;

      console.log("[Meet-Arabic-Subtitles] Captions detected:", { speaker: lastSpeaker, text: currentUtteranceText });

      // Update live original text instantly
      updateHUDOriginalText(currentUtteranceText, lastSpeaker);

      // Schedule translation
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
    const delay = endsWithPunctuation ? 200 : DEBOUNCE_MS;

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

    console.log("[Meet-Arabic-Subtitles] Requesting translation for:", text);

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
          console.log("[Meet-Arabic-Subtitles] Translation received:", response.arabicText);
          lastTranslatedText = text;
          renderArabicTranslation(response.arabicText);
          addTranscriptItem(text, response.arabicText, speaker);
        } else {
          console.error("[Meet-Arabic-Subtitles] Translation failed:", response ? response.error : "No response");
        }
      }
    );
  }

  // Format and render Arabic translation with clean line breaks per sentence
  function renderArabicTranslation(arabicText) {
    const arElem = document.getElementById("hud-arabic-text");
    if (!arElem || !arabicText) return;

    let cleanedAr = arabicText
      .replace(/ closed_caption/gi, '')
      .replace(/closed_caption/gi, '')
      .replace(/^أنت\s+/g, '')
      .trim();

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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
