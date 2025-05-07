const chatsContainer = document.querySelector(".chats-container");
const promptForm = document.querySelector(".prompt-form");
const promptInput = document.querySelector(".prompt-input");
const voiceBtn = document.getElementById("voice-btn");

const API_KEY = "AIzaSyAOF0D9uVP_sKFX0B3MmXbxu5gdwc-9Su0"; // Replace with your actual Gemini API key
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;

let userMessage = "";
const chatHistory = [];
let currentUtterance = null;
let controller = null;

// Female voice speech
const speak = (text, lang = "en") => {
  const utterance = new SpeechSynthesisUtterance(text);
  const voices = window.speechSynthesis.getVoices();
  const femaleVoice = voices.find(v => v.lang.startsWith(lang) && v.name.toLowerCase().includes("female")) || voices.find(v => v.lang.startsWith(lang));
  utterance.voice = femaleVoice || null;
  utterance.lang = lang;
  window.speechSynthesis.speak(utterance);
  currentUtterance = utterance;
};

// Detect user language
const detectLanguage = async (text) => {
  const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=ld&q=${encodeURIComponent(text)}`);
  const data = await res.json();
  return data[2]; // returns language code (e.g. "hi", "en", etc.)
};

// Translate text to English
const translateText = async (text, targetLang = "en") => {
  const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`);
  const data = await res.json();
  return data[0].map(x => x[0]).join("");
};

// Create a message bubble
const createMsgElement = (content, ...classes) => {
  const div = document.createElement("div");
  div.classList.add("message", ...classes);
  div.innerHTML = content;
  return div;
};

const scrollToBottom = () => {
  chatsContainer.scrollTop = chatsContainer.scrollHeight;
};

// Generate Gemini response
const generateResponse = async (botMsgDiv, originalLang) => {
  const textElement = botMsgDiv.querySelector(".message-text");
  controller = new AbortController();

  chatHistory.push({ role: "user", parts: [{ text: userMessage }] });

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: chatHistory })
    });

    const data = await response.json();
    const botText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response.";
    textElement.textContent = botText.trim().replace(/\*\*([^*]+)\*\*/g, "$1");

    // Controls
    const controls = document.createElement("div");
    controls.style.marginTop = "8px";

    const speakBtn = document.createElement("button");
    speakBtn.textContent = "🔊 Speak";
    speakBtn.onclick = () => speak(botText, originalLang);

    const stopBtn = document.createElement("button");
    stopBtn.textContent = "⛔ Stop";
    stopBtn.onclick = () => {
      window.speechSynthesis.cancel();
      controller.abort();
      textElement.textContent = "[Stopped]";
    };

    controls.appendChild(speakBtn);
    controls.appendChild(stopBtn);
    textElement.parentElement.appendChild(controls);

    chatHistory.push({ role: "model", parts: [{ text: botText }] });
    botMsgDiv.classList.remove("loading");
    scrollToBottom();
  } catch (err) {
    if (err.name === "AbortError") return;
    console.error(err);
    textElement.textContent = "Error generating response.";
    botMsgDiv.classList.remove("loading");
  }
};

// Handle user prompt submit
const handleFormSubmit = async (e, spokenLang = "en") => {
  e.preventDefault();
  const inputText = promptInput.value.trim();
  if (!inputText) return;

  const detectedLang = await detectLanguage(inputText);
  userMessage = detectedLang !== "en" ? await translateText(inputText, "en") : inputText;

  const userMsgDiv = createMsgElement(`<p class="message-text">${inputText}</p>`, "user-message");
  chatsContainer.appendChild(userMsgDiv);

  promptInput.value = "";

  const botMsgDiv = createMsgElement(
    `<img src="gemini.svg" class="avatar"><p class="message-text">Thinking...</p>`,
    "bot-message", "loading"
  );
  chatsContainer.appendChild(botMsgDiv);
  scrollToBottom();

  generateResponse(botMsgDiv, detectedLang);
};

promptForm.addEventListener("submit", e => handleFormSubmit(e));

// Voice input
voiceBtn.addEventListener("click", () => {
  const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
  recognition.lang = "auto";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => voiceBtn.textContent = "graphic_eq";
  recognition.onend = () => voiceBtn.textContent = "mic";

  recognition.onresult = async (event) => {
    const voiceText = event.results[0][0].transcript;
    promptInput.value = voiceText;

    const lang = await detectLanguage(voiceText);
    handleFormSubmit(new Event("submit"), lang);
  };

  recognition.start();
});

// File upload support
const uploadBtn = document.createElement("input");
uploadBtn.type = "file";
uploadBtn.accept = ".txt,.pdf";
uploadBtn.style.display = "none";
document.body.appendChild(uploadBtn);

const uploadTrigger = document.createElement("button");
uploadTrigger.textContent = "📄";
uploadTrigger.title = "Upload File";
uploadTrigger.style.width = "45px";
uploadTrigger.style.height = "45px";
uploadTrigger.style.fontSize = "1.3rem";
uploadTrigger.style.border = "none";
uploadTrigger.style.background = "transparent";
uploadTrigger.style.cursor = "pointer";

const promptActions = document.querySelector(".prompt-form");
if (promptActions) {
  promptActions.insertBefore(uploadTrigger, promptActions.lastElementChild);
}

uploadTrigger.onclick = () => uploadBtn.click();

uploadBtn.onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  let text = "";

  if (file.type === "application/pdf") {
    const reader = new FileReader();
    reader.onload = async () => {
      const pdfData = new Uint8Array(reader.result);
      const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map(item => item.str).join(" ");
      }
      summarizeFile(text);
    };
    reader.readAsArrayBuffer(file);
  } else {
    const reader = new FileReader();
    reader.onload = () => summarizeFile(reader.result);
    reader.readAsText(file);
  }
};

async function summarizeFile(text) {
  userMessage = "Please summarize the following:\n\n" + text.slice(0, 4000);
  const userMsgDiv = createMsgElement(`<p class="message-text">[Uploaded file]</p>`, "user-message");
  chatsContainer.appendChild(userMsgDiv);

  const botMsgDiv = createMsgElement(
    `<img src="gemini.svg" class="avatar"><p class="message-text">Reading...</p>`,
    "bot-message", "loading"
  );
  chatsContainer.appendChild(botMsgDiv);
  scrollToBottom();

  generateResponse(botMsgDiv, "en");
}

// Preload voices
window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
