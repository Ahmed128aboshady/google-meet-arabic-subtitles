// Content Script for Google Meet Live Subtitle HUD - Leaf-Node Master Extractor

(function () {
  console.log("%c[Meet-Arabic-Subtitles] تم تشغيل الإضافة بنجاح على التاب الحالي! 🚀", "color: #818cf8; font-weight: bold; font-size: 14px;");

  let hudContainer = null;
  let transcriptDrawer = null;
  let isEnabled = true;
  let currentFontSize = 22;
  let showOriginalText = true;
  let targetLang = "ar";

  const langBadgeNames = {
    ar: "العربية 🇸🇦",
    en: "English 🇬🇧",
    fr: "Français 🇫🇷",
    de: "Deutsch 🇩🇪",
    es: "Español 🇪🇸",
    tr: "Türkçe 🇹🇷",
    it: "Italiano 🇮🇹",
    ru: "Русский 🇷🇺",
    zh: "中文 🇨🇳"
  };

  // Utterance State tracking
  let currentUtteranceText = "";
  let lastSpeaker = "";
  let lastTranslatedText = "";
  let debounceTimer = null;
  const DEBOUNCE_MS = 500;

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
          <span id="hud-title-text">الترجمة الفورية</span>
          <span class="hud-badge" id="hud-lang-badge">العربية 🇸🇦</span>
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
        <div class="arabic-translation" id="hud-arabic-text">شريط الترجمة جاهز ومُنقّط بنجاح ✨</div>
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

  function updateHUDLanguageTitle() {
    const badgeElem = document.getElementById("hud-lang-badge");
    if (badgeElem) {
      badgeElem.textContent = langBadgeNames[targetLang] || targetLang.toUpperCase();
    }
  }

  function loadSettings() {
    chrome.storage.sync.get(["fontSize", "showOriginal", "enabled", "targetLang"], (res) => {
      if (chrome.runtime.lastError) return;
      if (res.fontSize) {
        currentFontSize = res.fontSize;
        updateFontSize();
      }
      targetLang = res.targetLang || "ar";
      updateHUDLanguageTitle();

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

  // Strict Filter to exclude Google Meet system banners, PiP messages & UI buttons
  function isSystemNotification(text) {
    if (!text) return true;
    const lower = text.toLowerCase();
    const systemPhrases = [
      "jump to bottom",
      "arrow_downward",
      "перейти вниз",
      "presentation was added",
      "main screen",
      "you are presenting",
      "stop presenting",
      "joined the call",
      "left the call",
      "waiting for",
      "waiting to be connected",
      "avoid an infinity mirror",
      "share just a tab",
      "show my screen anyway",
      "picture-in-picture",
      "screen sharing",
      "bring the call back here",
      "change automatic",
      "closed_caption",
      "closed caption",
      "строка субтитров",
      "المحادثة"
    ];
    return systemPhrases.some(phrase => lower.includes(phrase));
  }

  // 5. Multi-Strategy Google Meet Captions DOM Observer
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

    setInterval(() => {
      if (isEnabled) extractCaptionsFromDOM();
    }, 350);
  }

  // Leaf-Node Master Extractor Strategy (Immune to PiP and Screen Sharing Banners)
  function extractCaptionsFromDOM() {
    let rawText = "";
    let speakerName = "";

    // --- Strategy A: Standard Google Meet selectors ---
    const knownBlocks = document.querySelectorAll(
      'div[jsname="ds319b"], div[jscontroller="k9t41b"], div[data-captions-container] > div, div[jsname="V21rUb"]'
    );

    if (knownBlocks.length > 0) {
      for (let i = knownBlocks.length - 1; i >= 0; i--) {
        const activeBlock = knownBlocks[i];
        const speakerElem = activeBlock.querySelector('[jsname="r4n84e"], .zsT38, .Vbk7vd');
        let tempSpeaker = speakerElem ? speakerElem.innerText.trim() : "";

        const textElems = activeBlock.querySelectorAll('.a70Wyd, .T6426b, span[jsname]');
        let tempText = "";
        if (textElems.length > 0) {
          textElems.forEach(el => {
            const txt = el.innerText || el.textContent;
            if (txt && !txt.includes(tempSpeaker)) tempText += " " + txt.trim();
          });
        } else {
          tempText = activeBlock.innerText || activeBlock.textContent || "";
        }

        if (tempText && !isSystemNotification(tempText)) {
          rawText = tempText;
          speakerName = tempSpeaker;
          break;
        }
      }
    }

    // --- Strategy B: Leaf-Node Bottom Region Scanner (Master Strategy for PiP & Screen Share) ---
    if (!rawText.trim()) {
      const candidates = [];
      const elements = document.querySelectorAll('div, span, p');

      for (let i = elements.length - 1; i >= 0; i--) {
        const el = elements[i];

        if (el.closest('#gmeet-ar-subtitle-hud, #gmeet-ar-transcript-drawer')) continue;
        if (el.children.length > 2) continue; // Target leaf/small text nodes

        const txt = (el.innerText || el.textContent || "").trim();
        if (!txt || txt.length < 2 || txt.length > 350) continue;
        if (isSystemNotification(txt)) continue;

        const rect = el.getBoundingClientRect();
        if (rect.height === 0 || rect.width === 0) continue;

        // Positioned in lower 65% of viewport
        if (rect.top > window.innerHeight * 0.35) {
          if (!el.closest('button, input, select, nav, [role="button"]')) {
            candidates.push({ el, txt, rect });
          }
        }
      }

      if (candidates.length > 0) {
        // Sort by lowest vertical position on screen
        candidates.sort((a, b) => b.rect.bottom - a.rect.bottom);

        const lowestBottom = candidates[0].rect.bottom;
        const validNodes = [];

        for (const c of candidates) {
          if (Math.abs(c.rect.bottom - lowestBottom) < 180 && !validNodes.includes(c.txt)) {
            validNodes.push(c.txt);
          }
        }

        if (validNodes.length > 0) {
          validNodes.reverse();
          if (validNodes.length >= 2 && validNodes[0].length < 35) {
            speakerName = validNodes[0];
            rawText = validNodes.slice(1).join(" ");
          } else {
            rawText = validNodes.join(" ");
          }
        }
      }
    }

    // Clean text
    if (speakerName && rawText.startsWith(speakerName)) {
      rawText = rawText.substring(speakerName.length).trim();
    }

    rawText = cleanText(rawText);

    if (!rawText || rawText.length < 2 || isSystemNotification(rawText)) return;

    if (rawText !== currentUtteranceText || speakerName !== lastSpeaker) {
      currentUtteranceText = rawText;
      if (speakerName) lastSpeaker = speakerName;

      console.log("[Meet-Arabic-Subtitles] Captions detected:", { speaker: lastSpeaker, text: currentUtteranceText });

      updateHUDOriginalText(currentUtteranceText, lastSpeaker);
      scheduleTranslation(currentUtteranceText, lastSpeaker);
    }
  }

  function cleanText(str) {
    return str
      .replace(/arrow_downward/gi, '')
      .replace(/jump to bottom/gi, '')
      .replace(/перейти вниз/gi, '')
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

  function scheduleTranslation(text, speaker) {
    if (debounceTimer) clearTimeout(debounceTimer);

    const endsWithPunctuation = /[.?!;:\n]$/.test(text);
    const delay = endsWithPunctuation ? 150 : DEBOUNCE_MS;

    const statusDot = document.getElementById("hud-status-dot");
    if (statusDot) statusDot.classList.add("translating");

    debounceTimer = setTimeout(() => {
      executeTranslation(text, speaker);
    }, delay);
  }

  // Send translation request with target language safely to background worker
  function executeTranslation(text, speaker) {
    if (!text || text.trim().length === 0 || isSystemNotification(text)) return;
    if (text === lastTranslatedText) return;

    console.log(`[Meet-Arabic-Subtitles] Requesting translation (${targetLang}) for:`, text);

    try {
      chrome.runtime.sendMessage(
        {
          action: "translateText",
          text: text,
          speaker: speaker,
          targetLang: targetLang
        },
        (response) => {
          const statusDot = document.getElementById("hud-status-dot");
          if (statusDot) statusDot.classList.remove("translating");

          if (chrome.runtime.lastError) {
            console.warn("[Meet-Arabic-Subtitles] Communication warning:", chrome.runtime.lastError.message);
            return;
          }

          if (response && response.success) {
            console.log("[Meet-Arabic-Subtitles] Translation received:", response.arabicText);
            lastTranslatedText = text;
            renderArabicTranslation(response.arabicText);
            addTranscriptItem(text, response.arabicText, speaker);
          }
        }
      );
    } catch (err) {
      console.warn("[Meet-Arabic-Subtitles] Communication exception:", err);
    }
  }

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

    try {
      chrome.runtime.sendMessage({
        action: "saveTranscriptItem",
        item: { speaker: displaySpeaker, time: timeStr, orig: origText, ar: arText }
      }, () => {
        if (chrome.runtime.lastError) { /* ignore */ }
      });
    } catch (e) { /* ignore */ }
  }

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
        content += `الترجمة: ${item.ar}\n`;
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

  // Listen for setting changes from popup safely
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "toggleEnabled") {
      isEnabled = msg.enabled;
      if (hudContainer) hudContainer.style.display = isEnabled ? "block" : "none";
      sendResponse({ status: "ok" });
    }
    if (msg.action === "updateLanguage") {
      targetLang = msg.targetLang;
      updateHUDLanguageTitle();
      sendResponse({ status: "ok" });
    }
    return true;
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
