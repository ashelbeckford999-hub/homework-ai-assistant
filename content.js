if (window.__HOMEWORK_AI_LOADED__) {
  // Already loaded.
} else {
  window.__HOMEWORK_AI_LOADED__ = true;

  let lastPageField = null;
  let lastPageSelection = null;
  let chatHistory = [];

  const root = document.createElement("div");
  root.id = "homework-ai-extension-root";

  Object.assign(root.style, {
    position: "fixed",
    top: "20px",
    right: "20px",
    zIndex: "2147483647",
    fontFamily: "Arial, sans-serif"
  });

  document.documentElement.appendChild(root);

  const shadow = root.attachShadow({ mode: "open" });

  shadow.innerHTML = `
    <style>
      * {
        box-sizing: border-box;
      }

      .panel {
        width: 380px;
        max-height: 85vh;
        background: #111827;
        color: white;
        border-radius: 14px;
        box-shadow: 0 10px 40px rgba(0,0,0,.4);
        overflow: hidden;
        border: 1px solid #374151;
      }

      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 14px 16px;
        background: #1f2937;
      }

      .title {
        font-weight: bold;
        font-size: 16px;
      }

      .close {
        background: transparent;
        border: none;
        color: #aaa;
        font-size: 20px;
        cursor: pointer;
      }

      .tabs {
        display: flex;
        border-bottom: 1px solid #374151;
      }

      .tab {
        flex: 1;
        padding: 10px;
        border: none;
        background: #111827;
        color: #aaa;
        cursor: pointer;
      }

      .tab.active {
        color: white;
        background: #1f2937;
      }

      .body {
        padding: 14px;
        max-height: 70vh;
        overflow-y: auto;
      }

      textarea,
      input,
      select {
        width: 100%;
        padding: 10px;
        margin-bottom: 10px;
        border-radius: 8px;
        border: 1px solid #4b5563;
        background: #1f2937;
        color: white;
        outline: none;
      }

      textarea {
        min-height: 100px;
        resize: vertical;
      }

      button.action {
        width: 100%;
        padding: 10px;
        border: none;
        border-radius: 8px;
        background: #2563eb;
        color: white;
        cursor: pointer;
        margin-bottom: 8px;
      }

      button.action:hover {
        background: #1d4ed8;
      }

      button.secondary {
        background: #374151;
      }

      .answer {
        white-space: pre-wrap;
        background: #1f2937;
        padding: 12px;
        border-radius: 8px;
        margin-top: 10px;
        line-height: 1.5;
      }

      .status {
        color: #9ca3af;
        font-size: 12px;
        margin-bottom: 8px;
      }

      .chat {
        max-height: 250px;
        overflow-y: auto;
        margin-bottom: 10px;
      }

      .message {
        padding: 9px;
        margin-bottom: 8px;
        border-radius: 8px;
        white-space: pre-wrap;
      }

      .user {
        background: #1d4ed8;
      }

      .assistant {
        background: #374151;
      }

      .hidden {
        display: none;
      }

      label {
        display: block;
        margin-bottom: 5px;
        font-size: 13px;
        color: #d1d5db;
      }
    </style>

    <div class="panel">
      <div class="header">
        <div class="title">Homework AI</div>
        <button class="close" id="close">×</button>
      </div>

      <div class="tabs">
        <button class="tab active" data-tab="answer">Answer / Write</button>
        <button class="tab" data-tab="ask">Ask Homework</button>
        <button class="tab" data-tab="settings">API Key</button>
      </div>

      <div class="body">

        <section id="answer">
          <div class="status" id="answerStatus">
            Enter a question or scan the page.
          </div>

          <textarea
            id="question"
            placeholder="Type your homework question..."
          ></textarea>

          <button class="action" id="scan">
            Scan Page
          </button>

          <button class="action" id="answerBtn">
            Answer
          </button>

          <button class="action secondary" id="writeBtn">
            Write into page
          </button>

          <div class="answer" id="answerBox"></div>
        </section>

        <section id="ask" class="hidden">
          <div class="chat" id="chat"></div>

          <textarea
            id="askInput"
            placeholder="Ask anything about your homework..."
          ></textarea>

          <button class="action" id="askBtn">
            Ask
          </button>

          <button class="action secondary" id="voiceBtn">
            🎤 Voice Input
          </button>
        </section>

        <section id="settings" class="hidden">
          <label for="provider">AI Provider</label>

          <select id="provider">
            <option value="openai">OpenAI</option>
            <option value="gemini">Google Gemini</option>
            <option value="groq">Groq</option>
          </select>

          <label for="model">Model</label>

          <input
            id="model"
            placeholder="Leave blank for default"
          />

          <label for="apiKey">API Key</label>

          <input
            id="apiKey"
            type="password"
            placeholder="Paste your API key"
          />

          <button class="action" id="saveSettings">
            Save Settings
          </button>

          <div class="status" id="settingsStatus"></div>
        </section>

      </div>
    </div>
  `;

  const $ = (selector) => shadow.querySelector(selector);

  const panel = $(".panel");

  function isEditable(element) {
    if (!element) return false;

    if (element === root || root.contains(element)) {
      return false;
    }

    if (element.matches?.("textarea, input, [contenteditable='true']")) {
      return true;
    }

    return false;
  }

  document.addEventListener(
    "focusin",
    (event) => {
      if (isEditable(event.target)) {
        lastPageField = event.target;
      }
    },
    true
  );

  document.addEventListener(
    "selectionchange",
    () => {
      const selection = document.getSelection();

      if (!selection || !selection.rangeCount) {
        return;
      }

      const node = selection.anchorNode;

      if (!node) {
        return;
      }

      const element =
        node.nodeType === Node.ELEMENT_NODE
          ? node
          : node.parentElement;

      if (
        element &&
        !root.contains(element) &&
        selection.toString().trim()
      ) {
        lastPageSelection = selection.toString().trim();
      }
    },
    true
  );

  function showSection(name) {
    ["answer", "ask", "settings"].forEach((id) => {
      const section = $("#" + id);

      if (id === name) {
        section.classList.remove("hidden");
      } else {
        section.classList.add("hidden");
      }
    });

    shadow.querySelectorAll(".tab").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.tab === name);
    });
  }

  shadow.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      showSection(tab.dataset.tab);
    });
  });

  $("#close").addEventListener("click", () => {
    root.remove();
    window.__HOMEWORK_AI_LOADED__ = false;
  });

  function findQuestionFromPage() {
    const elements = document.querySelectorAll(
      "h1, h2, h3, h4, p, li, label, td, th"
    );

    const questions = [];

    for (const element of elements) {
      if (root.contains(element)) continue;

      const text = element.innerText?.trim();

      if (!text || text.length < 10 || text.length > 1000) {
        continue;
      }

      const looksLikeQuestion =
        text.includes("?") ||
        /^(what|why|how|when|where|who|which|explain|describe|calculate|solve|find|define|compare|identify)\b/i.test(
          text
        );

      if (looksLikeQuestion) {
        questions.push(text);
      }
    }

    return questions.slice(0, 5).join("\n\n");
  }

  async function askAI(prompt) {
    const response = await chrome.runtime.sendMessage({
      type: "AI_REQUEST",
      prompt,
      history: chatHistory
    });

    if (!response?.ok) {
      throw new Error(response?.error || "AI request failed.");
    }

    return response.text;
  }

  $("#scan").addEventListener("click", () => {
    const question = findQuestionFromPage();

    if (!question) {
      $("#answerStatus").textContent =
        "I couldn't find a question on this page.";
      return;
    }

    $("#question").value = question;
    $("#answerStatus").textContent =
      "Question found. Click Answer.";
  });

  $("#answerBtn").addEventListener("click", async () => {
    const question = $("#question").value.trim();

    if (!question) {
      $("#answerStatus").textContent =
        "Enter a question first.";
      return;
    }

    $("#answerStatus").textContent = "Thinking...";
    $("#answerBox").textContent = "";

    try {
      const answer = await askAI(question);

      $("#answerBox").textContent = answer;
      $("#answerStatus").textContent = "Done.";
    } catch (error) {
      $("#answerStatus").textContent =
        error.message || "Something went wrong.";
    }
  });

  function setNativeValue(element, value) {
    const prototype =
      element.tagName === "TEXTAREA"
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;

    const descriptor = Object.getOwnPropertyDescriptor(
      prototype,
      "value"
    );

    if (descriptor?.set) {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }

    element.dispatchEvent(
      new Event("input", {
        bubbles: true
      })
    );

    element.dispatchEvent(
      new Event("change", {
        bubbles: true
      })
    );
  }

  function insertIntoEditable(element, text) {
    if (!element) {
      return false;
    }

    if (
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLInputElement
    ) {
      setNativeValue(element, text);
      element.focus();
      return true;
    }

    if (element.isContentEditable) {
      element.focus();

      const selection = document.getSelection();

      if (selection && selection.rangeCount) {
        document.execCommand("insertText", false, text);
      } else {
        element.textContent += text;
      }

      element.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          inputType: "insertText",
          data: text
        })
      );

      return true;
    }

    return false;
  }

  $("#writeBtn").addEventListener("click", async () => {
    const question = $("#question").value.trim();

    if (!question) {
      $("#answerStatus").textContent =
        "Enter a question first.";
      return;
    }

    $("#answerStatus").textContent = "Writing...";

    try {
      const answer = await askAI(question);

      const inserted = insertIntoEditable(
        lastPageField,
        answer
      );

      if (inserted) {
        $("#answerStatus").textContent =
          "Answer written into the page.";
      } else {
        $("#answerBox").textContent = answer;
        $("#answerStatus").textContent =
          "I couldn't find a text box. The answer is shown above.";
      }
    } catch (error) {
      $("#answerStatus").textContent =
        error.message || "Something went wrong.";
    }
  });

  function addChatMessage(role, text) {
    const message = document.createElement("div");

    message.className = `message ${role}`;
    message.textContent = text;

    $("#chat").appendChild(message);
    $("#chat").scrollTop = $("#chat").scrollHeight;
  }

  $("#askBtn").addEventListener("click", async () => {
    const input = $("#askInput");
    const question = input.value.trim();

    if (!question) return;

    input.value = "";

    addChatMessage("user", question);

    chatHistory.push({
      role: "user",
      content: question
    });

    try {
      const answer = await askAI(question);

      addChatMessage("assistant", answer);

      chatHistory.push({
        role: "assistant",
        content: answer
      });

      chatHistory = chatHistory.slice(-20);
    } catch (error) {
      addChatMessage(
        "assistant",
        `Error: ${error.message || "Request failed."}`
      );
    }
  });

  $("#voiceBtn").addEventListener("click", () => {
    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      addChatMessage(
        "assistant",
        "Voice input isn't supported in this browser."
      );
      return;
    }

    const recognition = new SpeechRecognition();

    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      const text = event.results[0][0].transcript;
      $("#askInput").value = text;
    };

    recognition.onerror = (event) => {
      addChatMessage(
        "assistant",
        `Voice error: ${event.error}`
      );
    };

    recognition.start();
  });

  $("#saveSettings").addEventListener("click", async () => {
    const provider = $("#provider").value;
    const apiKey = $("#apiKey").value.trim();
    const model = $("#model").value.trim();

    await chrome.storage.local.set({
      provider,
      apiKey,
      model
    });

    $("#settingsStatus").textContent =
      "Settings saved.";
  });

  async function loadSettings() {
    const settings = await chrome.storage.local.get({
      provider: "openai",
      apiKey: "",
      model: ""
    });

    $("#provider").value = settings.provider;
    $("#apiKey").value = settings.apiKey;
    $("#model").value = settings.model;
  }

  loadSettings();

  // Allow the popup to toggle the panel.
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "TOGGLE_HOMEWORK_AI") {
      if (panel.style.display === "none") {
        panel.style.display = "";
      } else {
        panel.style.display = "none";
      }
    }
  });
}
