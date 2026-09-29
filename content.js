if (window.__HOMEWORK_AI_LOADED__) {
  // Already loaded.
} else {
  window.__HOMEWORK_AI_LOADED__ = true;

  let lastPageField = null;
  let chatHistory = [];

  const MODEL_OPTIONS = {
    openai: [
      {
        name: "GPT-5.6 Sol",
        id: "gpt-5.6-sol"
      },
      {
        name: "GPT-5.6 Terra",
        id: "gpt-5.6-terra"
      },
      {
        name: "GPT-5.6 Luna",
        id: "gpt-5.6-luna"
      },
      {
        name: "GPT-5.6",
        id: "gpt-5.6"
      }
    ],

    gemini: [
      {
        name: "Gemini 3.8 Flash",
        id: "gemini-3.8-flash"
      },
      {
        name: "Gemini 3.7 Flash",
        id: "gemini-3.7-flash"
      },
      {
        name: "Gemini 3.6 Flash",
        id: "gemini-3.6-flash"
      },
      {
        name: "Gemini 3.5 Flash",
        id: "gemini-3.5-flash"
      },
      {
        name: "Gemini 3.1 Pro Preview",
        id: "gemini-3.1-pro-preview"
      },
      {
        name: "Gemini 3.5 Flash-Lite",
        id: "gemini-3.5-flash-lite"
      },
      {
        name: "Gemini 3.1 Flash-Lite",
        id: "gemini-3.1-flash-lite"
      },
      {
        name: "Gemini 3 Flash Preview",
        id: "gemini-3-flash-preview"
      },
      {
        name: "Gemini 2.5 Pro",
        id: "gemini-2.5-pro"
      },
      {
        name: "Gemini 2.5 Flash",
        id: "gemini-2.5-flash"
      },
      {
        name: "Gemini 2.5 Flash-Lite",
        id: "gemini-2.5-flash-lite"
      }
    ],

    groq: [
      {
        name: "GPT-OSS 120B",
        id: "openai/gpt-oss-120b"
      },
      {
        name: "GPT-OSS 20B",
        id: "openai/gpt-oss-20b"
      },
      {
        name: "Llama 3.3 70B",
        id: "llama-3.3-70b-versatile"
      }
    ]
  };

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

  const shadow = root.attachShadow({
    mode: "open"
  });

  shadow.innerHTML = `
    <style>
      * {
        box-sizing: border-box;
      }

      .panel {
        width: 390px;
        max-height: 85vh;
        background: #111827;
        color: white;
        border-radius: 14px;
        box-shadow: 0 10px 40px rgba(0,0,0,.45);
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
        font-size: 22px;
        cursor: pointer;
        padding: 0;
      }

      .close:hover {
        color: white;
      }

      .tabs {
        display: flex;
        border-bottom: 1px solid #374151;
      }

      .tab {
        flex: 1;
        padding: 10px 5px;
        border: none;
        background: #111827;
        color: #9ca3af;
        cursor: pointer;
        font-size: 12px;
      }

      .tab:hover {
        color: white;
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
        font-family: inherit;
      }

      textarea:focus,
      input:focus,
      select:focus {
        border-color: #2563eb;
      }

      textarea {
        min-height: 100px;
        resize: vertical;
      }

      select {
        cursor: pointer;
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
        font-size: 14px;
      }

      button.action:hover {
        background: #1d4ed8;
      }

      button.secondary {
        background: #374151;
      }

      button.secondary:hover {
        background: #4b5563;
      }

      .answer {
        white-space: pre-wrap;
        background: #1f2937;
        padding: 12px;
        border-radius: 8px;
        margin-top: 10px;
        line-height: 1.5;
        max-height: 300px;
        overflow-y: auto;
      }

      .status {
        color: #9ca3af;
        font-size: 12px;
        margin-bottom: 8px;
        line-height: 1.4;
      }

      .chat {
        max-height: 280px;
        overflow-y: auto;
        margin-bottom: 10px;
      }

      .message {
        padding: 9px;
        margin-bottom: 8px;
        border-radius: 8px;
        white-space: pre-wrap;
        line-height: 1.4;
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

      .model-info {
        font-size: 11px;
        color: #9ca3af;
        margin-top: -5px;
        margin-bottom: 10px;
      }

      .saved {
        color: #86efac;
      }

      .error {
        color: #fca5a5;
      }
    </style>

    <div class="panel">

      <div class="header">
        <div class="title">
          Homework AI
        </div>

        <button
          class="close"
          id="close"
          title="Close"
        >
          ×
        </button>
      </div>

      <div class="tabs">

        <button
          class="tab active"
          data-tab="answer"
        >
          Answer / Write
        </button>

        <button
          class="tab"
          data-tab="ask"
        >
          Ask Homework
        </button>

        <button
          class="tab"
          data-tab="settings"
        >
          API Key
        </button>

      </div>

      <div class="body">

        <!-- ANSWER -->

        <section id="answer">

          <div
            class="status"
            id="answerStatus"
          >
            Enter a question or scan the page.
          </div>

          <textarea
            id="question"
            placeholder="Type your homework question..."
          ></textarea>

          <button
            class="action"
            id="scan"
          >
            Scan Page
          </button>

          <button
            class="action"
            id="answerBtn"
          >
            Answer
          </button>

          <button
            class="action secondary"
            id="writeBtn"
          >
            Write into page
          </button>

          <div
            class="answer"
            id="answerBox"
          ></div>

        </section>


        <!-- ASK -->

        <section
          id="ask"
          class="hidden"
        >

          <div
            class="chat"
            id="chat"
          ></div>

          <textarea
            id="askInput"
            placeholder="Ask anything about your homework..."
          ></textarea>

          <button
            class="action"
            id="askBtn"
          >
            Ask
          </button>

          <button
            class="action secondary"
            id="voiceBtn"
          >
            🎤 Voice Input
          </button>

        </section>


        <!-- SETTINGS -->

        <section
          id="settings"
          class="hidden"
        >

          <label for="provider">
            AI Provider
          </label>

          <select id="provider">

            <option value="openai">
              OpenAI
            </option>

            <option value="gemini">
              Google Gemini
            </option>

            <option value="groq">
              Groq
            </option>

          </select>


          <label for="model">
            AI Model
          </label>

          <select id="model"></select>

          <div
            class="model-info"
            id="modelInfo"
          ></div>


          <label for="apiKey">
            API Key
          </label>

          <input
            id="apiKey"
            type="password"
            placeholder="Paste your API key"
          />


          <button
            class="action"
            id="saveSettings"
          >
            Save Settings
          </button>

          <div
            class="status"
            id="settingsStatus"
          ></div>

        </section>

      </div>

    </div>
  `;


  /* =========================
     HELPER
  ========================= */

  const $ = (selector) => {
    return shadow.querySelector(selector);
  };


  /* =========================
     TRACK WEBPAGE TEXT BOX
  ========================= */

  function isEditable(element) {
    if (!element) {
      return false;
    }

    if (root.contains(element)) {
      return false;
    }

    if (
      element.matches?.(
        "textarea, input, [contenteditable='true']"
      )
    ) {
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


  /* =========================
     TABS
  ========================= */

  function showSection(name) {
    ["answer", "ask", "settings"].forEach(
      (id) => {
        const section = $("#" + id);

        if (id === name) {
          section.classList.remove("hidden");
        } else {
          section.classList.add("hidden");
        }
      }
    );

    shadow
      .querySelectorAll(".tab")
      .forEach((tab) => {
        tab.classList.toggle(
          "active",
          tab.dataset.tab === name
        );
      });
  }


  shadow
    .querySelectorAll(".tab")
    .forEach((tab) => {
      tab.addEventListener("click", () => {
        showSection(tab.dataset.tab);
      });
    });


  /* =========================
     CLOSE
  ========================= */

  $("#close").addEventListener(
    "click",
    () => {
      root.remove();
      window.__HOMEWORK_AI_LOADED__ = false;
    }
  );


  /* =========================
     FIND QUESTION ON PAGE
  ========================= */

  function findQuestionFromPage() {
    const elements = document.querySelectorAll(
      "h1, h2, h3, h4, h5, p, li, label, td, th"
    );

    const questions = [];

    for (const element of elements) {
      if (root.contains(element)) {
        continue;
      }

      const text = element.innerText?.trim();

      if (!text) {
        continue;
      }

      if (text.length < 10) {
        continue;
      }

      if (text.length > 1000) {
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

    return questions
      .slice(0, 5)
      .join("\n\n");
  }


  /* =========================
     AI REQUEST
  ========================= */

  async function askAI(prompt) {
    const response =
      await chrome.runtime.sendMessage({
        type: "AI_REQUEST",
        prompt,
        history: chatHistory
      });

    if (!response?.ok) {
      throw new Error(
        response?.error ||
        "AI request failed."
      );
    }

    return response.text;
  }


  /* =========================
     SCAN
  ========================= */

  $("#scan").addEventListener(
    "click",
    () => {
      const question =
        findQuestionFromPage();

      if (!question) {
        $("#answerStatus").textContent =
          "I couldn't find a question on this page.";

        return;
      }

      $("#question").value = question;

      $("#answerStatus").textContent =
        "Question found. Click Answer.";
    }
  );


  /* =========================
     ANSWER
  ========================= */

  $("#answerBtn").addEventListener(
    "click",
    async () => {
      const question =
        $("#question").value.trim();

      if (!question) {
        $("#answerStatus").textContent =
          "Enter a question first.";

        return;
      }

      $("#answerStatus").textContent =
        "Thinking...";

      $("#answerBox").textContent = "";

      try {
        const answer =
          await askAI(question);

        $("#answerBox").textContent =
          answer;

        $("#answerStatus").textContent =
          "Done.";
      } catch (error) {
        $("#answerStatus").textContent =
          error.message ||
          "Something went wrong.";
      }
    }
  );


  /* =========================
     WRITE INTO PAGE
  ========================= */

  function setNativeValue(
    element,
    value
  ) {
    const prototype =
      element.tagName === "TEXTAREA"
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;

    const descriptor =
      Object.getOwnPropertyDescriptor(
        prototype,
        "value"
      );

    if (descriptor?.set) {
      descriptor.set.call(
        element,
        value
      );
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


  function insertIntoEditable(
    element,
    text
  ) {
    if (!element) {
      return false;
    }

    if (
      element instanceof
        HTMLTextAreaElement ||
      element instanceof
        HTMLInputElement
    ) {
      setNativeValue(
        element,
        text
      );

      element.focus();

      return true;
    }


    if (element.isContentEditable) {
      element.focus();

      const selection =
        document.getSelection();

      if (
        selection &&
        selection.rangeCount
      ) {
        document.execCommand(
          "insertText",
          false,
          text
        );
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


  $("#writeBtn").addEventListener(
    "click",
    async () => {
      const question =
        $("#question").value.trim();

      if (!question) {
        $("#answerStatus").textContent =
          "Enter a question first.";

        return;
      }

      $("#answerStatus").textContent =
        "Writing...";

      try {
        const answer =
          await askAI(question);

        const inserted =
          insertIntoEditable(
            lastPageField,
            answer
          );

        if (inserted) {
          $("#answerStatus").textContent =
            "Answer written into the page.";
        } else {
          $("#answerBox").textContent =
            answer;

          $("#answerStatus").textContent =
            "I couldn't find a text box. The answer is shown above.";
        }
      } catch (error) {
        $("#answerStatus").textContent =
          error.message ||
          "Something went wrong.";
      }
    }
  );


  /* =========================
     CHAT
  ========================= */

  function addChatMessage(
    role,
    text
  ) {
    const message =
      document.createElement("div");

    message.className =
      `message ${role}`;

    message.textContent = text;

    $("#chat").appendChild(
      message
    );

    $("#chat").scrollTop =
      $("#chat").scrollHeight;
  }


  $("#askBtn").addEventListener(
    "click",
    async () => {
      const input =
        $("#askInput");

      const question =
        input.value.trim();

      if (!question) {
        return;
      }

      input.value = "";

      addChatMessage(
        "user",
        question
      );

      chatHistory.push({
        role: "user",
        content: question
      });

      chatHistory =
        chatHistory.slice(-20);

      try {
        const answer =
          await askAI(question);

        addChatMessage(
          "assistant",
          answer
        );

        chatHistory.push({
          role: "assistant",
          content: answer
        });

        chatHistory =
          chatHistory.slice(-20);

      } catch (error) {
        addChatMessage(
          "assistant",
          `Error: ${
            error.message ||
            "Request failed."
          }`
        );
      }
    }
  );


  /* =========================
     ENTER KEY FOR CHAT
  ========================= */

  $("#askInput").addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "Enter" &&
        !event.shiftKey
      ) {
        event.preventDefault();

        $("#askBtn").click();
      }
    }
  );


  /* =========================
     VOICE
  ========================= */

  $("#voiceBtn").addEventListener(
    "click",
    () => {
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

      const recognition =
        new SpeechRecognition();

      recognition.lang =
        "en-US";

      recognition.interimResults =
        false;

      recognition.continuous =
        false;

      recognition.onstart = () => {
        $("#voiceBtn").textContent =
          "🎤 Listening...";
      };

      recognition.onresult =
        (event) => {
          const text =
            event.results[0][0]
              .transcript;

          $("#askInput").value =
            text;
        };

      recognition.onerror =
        (event) => {
          addChatMessage(
            "assistant",
            `Voice error: ${event.error}`
          );
        };

      recognition.onend = () => {
        $("#voiceBtn").textContent =
          "🎤 Voice Input";
      };

      recognition.start();
    }
  );


  /* =========================
     MODEL DROPDOWN
  ========================= */

  function updateModelDropdown(
    selectedModel = ""
  ) {
    const provider =
      $("#provider").value;

    const models =
      MODEL_OPTIONS[provider] ||
      MODEL_OPTIONS.openai;

    const modelSelect =
      $("#model");

    modelSelect.innerHTML = "";

    models.forEach(
      (model) => {
        const option =
          document.createElement(
            "option"
          );

        option.value =
          model.id;

        option.textContent =
          model.name;

        modelSelect.appendChild(
          option
        );
      }
    );

    const selectedExists =
      models.some(
        (model) =>
          model.id ===
          selectedModel
      );

    if (selectedExists) {
      modelSelect.value =
        selectedModel;
    } else {
      modelSelect.value =
        models[0].id;
    }

    updateModelInfo();
  }


  function updateModelInfo() {
    const provider =
      $("#provider").value;

    const model =
      $("#model").value;

    const info =
      $("#modelInfo");

    if (provider === "gemini") {
      if (
        model ===
        "gemini-3.8-flash"
      ) {
        info.textContent =
          "Gemini 3.8 Flash";
      } else {
        info.textContent =
          "Google Gemini";
      }
    } else if (
      provider === "openai"
    ) {
      info.textContent =
        "OpenAI Responses API";
    } else if (
      provider === "groq"
    ) {
      info.textContent =
        "Groq API";
    } else {
      info.textContent = "";
    }
  }


  $("#provider").addEventListener(
    "change",
    () => {
      updateModelDropdown();
    }
  );


  $("#model").addEventListener(
    "change",
    () => {
      updateModelInfo();
    }
  );


  /* =========================
     SAVE SETTINGS
  ========================= */

  $("#saveSettings").addEventListener(
    "click",
    async () => {
      const provider =
        $("#provider").value;

      const apiKey =
        $("#apiKey").value.trim();

      const model =
        $("#model").value;

      if (!apiKey) {
        $("#settingsStatus").textContent =
          "Please enter an API key.";

        $("#settingsStatus").className =
          "status error";

        return;
      }

      await chrome.storage.local.set({
        provider,
        apiKey,
        model
      });

      $("#settingsStatus").textContent =
        "Settings saved.";

      $("#settingsStatus").className =
        "status saved";
    }
  );


  /* =========================
     LOAD SETTINGS
  ========================= */

  async function loadSettings() {
    const settings =
      await chrome.storage.local.get({
        provider: "openai",
        apiKey: "",
        model: ""
      });

    if (
      MODEL_OPTIONS[settings.provider]
    ) {
      $("#provider").value =
        settings.provider;
    } else {
      $("#provider").value =
        "openai";
    }

    $("#apiKey").value =
      settings.apiKey || "";

    updateModelDropdown(
      settings.model || ""
    );
  }


  /* =========================
     TOGGLE MESSAGE
  ========================= */

  chrome.runtime.onMessage.addListener(
    (message) => {
      if (
        message?.type ===
        "TOGGLE_HOMEWORK_AI"
      ) {
        const panel =
          $(".panel");

        if (
          panel.style.display ===
          "none"
        ) {
          panel.style.display = "";
        } else {
          panel.style.display =
            "none";
        }
      }
    }
  );


  /* =========================
     START
  ========================= */

  loadSettings();
}
