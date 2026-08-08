// Service Worker for handling AI & Fast Translation requests

chrome.runtime.onInstalled.addListener(() => {
  console.log("إضافة ترجمة اجتماعات جوجل للعربية مثبتة بنجاح!");
  chrome.storage.sync.get(["engine", "fontSize", "showOriginal"], (data) => {
    if (!data.engine) chrome.storage.sync.set({ engine: "fast" }); // Default to fast free engine
    if (!data.fontSize) chrome.storage.sync.set({ fontSize: 22 });
    if (data.showOriginal === undefined) chrome.storage.sync.set({ showOriginal: true });
  });
});

// Listen for messages from content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "translateText") {
    handleTranslation(request.text, request.speaker)
      .then((translatedArabic) => {
        sendResponse({ success: true, arabicText: translatedArabic, speaker: request.speaker });
      })
      .catch((err) => {
        console.error("خطأ أثناء الترجمة:", err);
        sendResponse({ success: false, error: err.toString() });
      });
    return true; // Asynchronous response
  }

  if (request.action === "saveTranscriptItem") {
    chrome.storage.local.get({ transcriptHistory: [] }, (res) => {
      const history = res.transcriptHistory;
      history.push(request.item);
      if (history.length > 300) history.shift();
      chrome.storage.local.set({ transcriptHistory: history });
    });
  }
});

async function handleTranslation(text, speaker) {
  if (!text || text.trim().length === 0) return "";

  const storage = await chrome.storage.sync.get(["apiKey", "engine"]);
  const apiKey = storage.apiKey;
  const engine = storage.engine || "gemini";

  // If Gemini selected and key present
  if (engine === "gemini" && apiKey && apiKey.trim().length > 5) {
    try {
      return await translateWithGemini(text, apiKey);
    } catch (err) {
      console.warn("فشلت ترجمة Gemini، جاري الانتقال للمحرك السريع الاحتياطي:", err);
      return await fallbackFastTranslation(text);
    }
  }

  // Otherwise use fast Google Translate
  return await fallbackFastTranslation(text);
}

// Gemini AI Contextual Translation
async function translateWithGemini(text, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey.trim()}`;
  
  const systemInstruction = "أنت مترجم احترافي لاجتماعات ومحادثات متعددة اللغات. ترجم النص المعطى (من أي لغة إلى العربية) بأسلوب عربي فصيح وبسيط وسلس بدون ترجمة حرفية. اكتب الترجمة فقط بدون مقدمات أو علامات اقتباس.";

  const bodyData = {
    contents: [
      {
        role: "user",
        parts: [{ text: `${systemInstruction}\n\nالنص المطلوب ترجمته:\n"${text}"` }]
      }
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 256
    }
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyData)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API Error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const rawTranslation = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (rawTranslation) {
    return rawTranslation.trim().replace(/^["']|["']$/g, '');
  }

  throw new Error("لم يتم إرجاع نتيجة من Gemini API");
}

// Fast Free Fallback Translation (Multiple Backup Endpoints)
async function fallbackFastTranslation(text) {
  // Endpoint 1: Google Translate GTX
  try {
    const url1 = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ar&dt=t&q=${encodeURIComponent(text)}`;
    const response = await fetch(url1);
    if (response.ok) {
      const data = await response.json();
      let translatedStr = "";
      if (data && data[0]) {
        data[0].forEach((item) => {
          if (item[0]) translatedStr += item[0];
        });
      }
      if (translatedStr.trim()) return translatedStr.trim();
    }
  } catch (e) {
    console.warn("Primary fast translation failed, trying backup:", e);
  }

  // Endpoint 2: MyMemory Translation API fallback
  try {
    const url2 = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=auto|ar`;
    const response2 = await fetch(url2);
    if (response2.ok) {
      const data2 = await response2.json();
      if (data2 && data2.responseData && data2.responseData.translatedText) {
        return data2.responseData.translatedText;
      }
    }
  } catch (e) {
    console.warn("Secondary fast translation failed:", e);
  }

  return text; // Return original if all endpoints fail
}
