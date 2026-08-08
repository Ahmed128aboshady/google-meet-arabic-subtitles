// Service Worker with Multi-Engine Translation & Error Guard

chrome.runtime.onInstalled.addListener(() => {
  console.log("إضافة ترجمة اجتماعات جوجل مثبتة بنجاح!");
  chrome.storage.sync.get(["engine", "targetLang", "fontSize", "showOriginal"], (data) => {
    if (!data.engine) chrome.storage.sync.set({ engine: "fast" });
    if (!data.targetLang) chrome.storage.sync.set({ targetLang: "ar" });
    if (!data.fontSize) chrome.storage.sync.set({ fontSize: 24 });
    if (data.showOriginal === undefined) chrome.storage.sync.set({ showOriginal: true });
  });
});

// Listen for messages from content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "translateText") {
    handleTranslation(request.text, request.speaker, request.targetLang)
      .then((translatedText) => {
        sendResponse({ success: true, arabicText: translatedText, speaker: request.speaker });
      })
      .catch((err) => {
        console.error("خطأ أثناء الترجمة:", err);
        sendResponse({ success: false, error: err.toString() });
      });
    return true;
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

async function handleTranslation(text, speaker, requestedLang) {
  if (!text || text.trim().length === 0) return "";

  const storage = await chrome.storage.sync.get(["apiKey", "engine", "targetLang"]);
  const apiKey = storage.apiKey;
  const engine = storage.engine || "fast";
  const targetLang = requestedLang || storage.targetLang || "ar";

  // If Gemini selected and key present
  if (engine === "gemini" && apiKey && apiKey.trim().length > 5) {
    try {
      return await translateWithGemini(text, apiKey, targetLang);
    } catch (err) {
      console.warn("فشلت ترجمة Gemini، جاري الانتقال لمجموع المحركات المفتوحة السريعة:", err);
      return await fallbackMultiEngineTranslation(text, targetLang);
    }
  }

  return await fallbackMultiEngineTranslation(text, targetLang);
}

const langNames = {
  ar: "اللغة العربية الفصيحة البسيطة",
  en: "English",
  fr: "French",
  de: "German",
  es: "Spanish",
  tr: "Turkish",
  it: "Italian",
  ru: "Russian",
  zh: "Chinese"
};

// Gemini AI Contextual Translation
async function translateWithGemini(text, apiKey, targetLang) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey.trim()}`;
  const targetLangName = langNames[targetLang] || "اللغة العربية الفصيحة البسيطة";
  
  const systemInstruction = `أنت مترجم احترافي. ترجم النص المعطى فورياً إلى ${targetLangName} بأسلوب طبيعي ومفهوم بدون ترجمة حرفية. اكتب الترجمة فقط بدون مقدمات.`;

  const bodyData = {
    contents: [
      {
        role: "user",
        parts: [{ text: `${systemInstruction}\n\nالنص المطلوب ترجمته:\n"${text}"` }]
      }
    ],
    generationConfig: {
      temperature: 0.15,
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
    return cleanTranslationOutput(rawTranslation.trim());
  }

  throw new Error("لم يتم إرجاع نتيجة من Gemini API");
}

// 4 Multi-Engine Fallback Translator
async function fallbackMultiEngineTranslation(text, targetLang = "ar") {
  let resultText = "";

  // Engine 1: Google Translate GTX Primary
  try {
    const url1 = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;
    const res1 = await fetch(url1);
    if (res1.ok) {
      const data1 = await res1.json();
      let str1 = "";
      if (data1 && data1[0]) {
        data1[0].forEach(item => { if (item[0]) str1 += item[0]; });
      }
      if (str1.trim()) resultText = str1.trim();
    }
  } catch (e) {
    console.warn("[Engine 1: Google GTX Failed]:", e);
  }

  // Engine 2: Lingva Free Open-Source API
  if (!resultText) {
    try {
      const url2 = `https://lingva.ml/api/v1/auto/${targetLang}/${encodeURIComponent(text)}`;
      const res2 = await fetch(url2);
      if (res2.ok) {
        const data2 = await res2.json();
        if (data2 && data2.translation) {
          resultText = data2.translation.trim();
        }
      }
    } catch (e) {
      console.warn("[Engine 2: Lingva Failed]:", e);
    }
  }

  // Engine 3: MyMemory Translation API
  if (!resultText) {
    try {
      const url3 = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=auto|${targetLang}`;
      const res3 = await fetch(url3);
      if (res3.ok) {
        const data3 = await res3.json();
        if (data3 && data3.responseData && data3.responseData.translatedText) {
          resultText = data3.responseData.translatedText.trim();
        }
      }
    } catch (e) {
      console.warn("[Engine 3: MyMemory Failed]:", e);
    }
  }

  return cleanTranslationOutput(resultText || text);
}

function cleanTranslationOutput(str) {
  if (!str) return "";
  return str
    .replace(/^["'«]/, '')
    .replace(/["'»]$/, '')
    .replace(/\boff_\b/gi, '')
    .replace(/\smic_off\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}
