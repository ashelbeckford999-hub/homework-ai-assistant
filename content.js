(() => {
  if (window.__HOMEWORK_AI_LOADED__) return;
  window.__HOMEWORK_AI_LOADED__ = true;

  let chatHistory = [];
  let lastPageField = null;
  let lastAnswer = "";

  function clean(text) {
    return String(text || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  // =========================
  // SCAN THE CURRENT WEB PAGE
  // =========================

  function scanNormalPage() {
    const textParts = [];

    // Get the visible text from the page
    if (document.body) {
      textParts.push(document.body.innerText || "");
    }

    // Also collect text from inputs, textareas and editable boxes
    document.querySelectorAll(
      "input, textarea, [contenteditable='true'], [role='textbox']"
    ).forEach(element => {
      if (element.value) {
        textParts.push(element.value);
      }

      if (element.innerText) {
        textParts.push(element.innerText);
      }

      if (element.textContent) {
        textParts.push(element.textContent);
      }

      const placeholder = element.getAttribute("placeholder");
      if (placeholder) {
        textParts.push(placeholder);
      }

      const ariaLabel = element.getAttribute("aria-label");
      if (ariaLabel) {
        textParts.push(ariaLabel);
      }

      const title = element.getAttribute("title");
      if (title) {
        textParts.push(title);
      }
    });

    const cleaned = clean(textParts.join("\n"));

    // Remove duplicate lines
    const seen = new Set();
    const lines = [];

    for (const line of cleaned.split("\n")) {
      const trimmed = line.trim();

      if (!trimmed) continue;

      const key = trimmed.toLowerCase();

      if (!seen.has(key)) {
        seen.add(key);
        lines.push(trimmed);
      }
    }

    return lines.join("\n").slice(0, 50000);
  }

  // =========================
  // REMEMBER TEXT BOXES
  // =========================

  document.addEventListener(
    "focusin",
    event => {
      const target = event.target;

      if (
        target &&
        (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable ||
          target.getAttribute?.("role") === "textbox"
        )
      ) {
        lastPageField = target;
      }
    },
    true
  );

  // =========================
  // WRITE ANSWER INTO PAGE
  // =========================

  function writeNormalPage(text) {
    if (!text) {
      throw new Error("There is no answer to write.");
    }

    let target = lastPageField;

    // Make sure remembered element still exists
    if (!target || !document.contains(target)) {
      target = null;
    }

    // Try the currently focused element
    if (!target) {
      const active = document.activeElement;

      if (
        active &&
        (
          active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          active.isContentEditable ||
          active.getAttribute?.("role") === "textbox"
        )
      ) {
        target = active;
      }
    }

    // Find a text box on the page
    if (!target) {
      target = document.querySelector(
        "textarea, input:not([type='hidden']), [contenteditable='true'], [role='textbox']"
      );
    }

    if (!target) {
      throw new Error(
        "Click inside the text box where you want the answer, then click Write into Page."
      );
    }

    target.focus();

    // =========================
    // CONTENTEDITABLE
    // =========================

    if (target.isContentEditable) {
      const selection = window.getSelection();
      const range = document.createRange();

      range.selectNodeContents(target);

      selection.removeAllRanges();
      selection.addRange(range);

      const inserted = document.execCommand(
        "insertText",
        false,
        text
      );

      if (!inserted) {
        target.textContent = text;
      }

      target.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          inputType: "insertText",
          data: text
        })
      );

      target.dispatchEvent(
        new Event("change", {
          bubbles: true
        })
      );

      return;
    }

    // =========================
    // INPUT / TEXTAREA
    // =========================

    const prototype =
      target.tagName === "TEXTAREA"
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;

    const valueSetter = Object.getOwnPropertyDescriptor(
      prototype,
      "value"
    )?.set;

    if (valueSetter) {
      valueSetter.call(target, text);
    } else {
      target.value = text;
    }

    // Tell React/Vue/other websites that the value changed
    target.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: text
      })
    );

    target.dispatchEvent(
      new Event("change", {
        bubbles: true
      })
    );

    target.focus();
  }

  // =========================
  // CREATE EXTENSION PANEL
  // =========================

  const host = document.createElement("div");

  host.id = "homework-ai-host";

  Object.assign(host.style, {
    position: "fixed",
    top: "20px",
    right: "20px",
    zIndex: "2147483647"
  });

  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({
    mode: "open"
  });

  shadow.innerHTML = `
    <style>

      * {
        box-sizing: border-box;
      }

      .panel {
        width: 410px;
        max-height: 88vh;
        background: #111827;
        color: white;
        border: 1px solid #374151;
        border-radius: 14px;
        box-shadow: 0 15px 50px rgba(0,0,0,.45);
        overflow: hidden;
        font-family: Arial, sans-serif;
        font-size: 14px;
      }

      .head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 13px 15px;
        background: #1f2937;
        font-weight: bold;
      }

      .close {
        background: transparent;
        border: 0;
        color: white;
        font-size: 21px;
        cursor: pointer;
      }

      .tabs {
        display: flex;
        background: #0f172a;
      }

      .tab {
        flex: 1;
        padding: 9px;
        border: 0;
        background: transparent;
        color: #9ca3af;
        cursor: pointer;
      }

      .tab.active {
        background: #1f2937;
        color: white;
      }

      .body {
        padding: 13px;
        overflow: auto;
        max-height: 74vh;
      }

      textarea,
      input,
      select {
        width: 100%;
        padding: 9px;
        border: 1px solid #4b5563;
        border-radius: 8px;
        background: #0f172a;
        color: white;
      }

      textarea {
        min-height: 105px;
        resize: vertical;
      }

      button.action {
        width: 100%;
        padding: 9px;
        margin-top: 7px;
        border: 0;
        border-radius: 8px;
        background: #2563eb;
        color: white;
        cursor: pointer;
        font-weight: bold;
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

      button:disabled {
        opacity: .6;
        cursor: not-allowed;
      }

      .status {
        margin-top: 9px;
        padding: 9px;
        background: #1f2937;
        border-radius: 8px;
        color: #d1d5db;
        white-space: pre-wrap;
        font-size: 12px;
      }

      .answer {
        margin-top: 10px;
        padding: 10px;
        background: #0f172a;
        border: 1px solid #374151;
        border-radius: 8px;
        white-space: pre-wrap;
        max-height: 280px;
        overflow: auto;
        line-height: 1.45;
      }

      label {
        display: block;
        margin: 9px 0 4px;
        font-size: 12px;
        color: #d1d5db;
      }

      .hidden {
        display: none;
      }

      .hint {
        font-size: 11px;
        color: #9ca3af;
        line-height: 1.4;
        margin-top: 7px;
      }

    </style>

    <div class="panel">

      <div class="head">
        <span>Homework AI</span>
        <button class="close" id="close">×</button>
      </div>

      <div class="tabs">

        <button
          class="tab active"
          data-tab="answer"
        >
          Answer
        </button>

        <button
          class="tab"
          data-tab="ask"
        >
          Ask
        </button>

        <button
          class="tab"
          data-tab="key"
        >
          API Key
        </button>

      </div>

      <div class="body">

        <!-- ANSWER TAB -->

        <section id="answerTab">

          <textarea
            id="question"
            placeholder="Scan the page or type a question..."
          ></textarea>

          <button
            class="action"
            id="scanPage"
          >
            Scan Page
          </button>

          <button
            class="action secondary"
            id="writePage"
          >
            Write into Page
          </button>

          <button
            class="action"
            id="answer"
          >
            Answer
          </button>

          <button
            class="action secondary"
            id="copy"
          >
            Copy Answer
          </button>

          <div
            class="status"
            id="status"
          >
            Ready.
          </div>

          <div
            class="answer"
            id="answerBox"
          ></div>

        </section>

        <!-- ASK TAB -->

        <section
          id="askTab"
          class="hidden"
        >

          <textarea
            id="askInput"
            placeholder="Ask Homework AI..."
          ></textarea>

          <button
            class="action"
            id="askButton"
          >
            Ask
          </button>

          <div
            class="answer"
            id="chatBox"
          ></div>

        </section>

        <!-- API KEY TAB -->

        <section
          id="keyTab"
          class="hidden"
        >

          <label>
            Provider
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

          <label>
            Model ID
          </label>

          <input
            id="model"
            placeholder="Enter the model ID"
          >

          <label>
            API Key
          </label>

          <input
            id="apiKey"
            type="password"
            placeholder="Paste API key"
          >

          <button
            class="action"
            id="save"
          >
            Save Settings
          </button>

          <div
            class="status"
            id="keyStatus"
          ></div>

        </section>

      </div>

    </div>
  `;

  // =========================
  // HELPER
  // =========================

  const $ = id => shadow.getElementById(id);

  // =========================
  // TABS
  // =========================

  shadow.querySelectorAll(".tab").forEach(tab => {

    tab.addEventListener("click", () => {

      shadow
        .querySelectorAll(".tab")
        .forEach(x => x.classList.remove("active"));

      tab.classList.add("active");

      $("answerTab").classList.add("hidden");
      $("askTab").classList.add("hidden");
      $("keyTab").classList.add("hidden");

      $(tab.dataset.tab + "Tab")
        .classList.remove("hidden");

    });

  });

  // =========================
  // CLOSE
  // =========================

  $("close").onclick = () => {

    host.remove();

    window.__HOMEWORK_AI_LOADED__ = false;

  };

  // =========================
  // SEND REQUEST TO BACKGROUND
  // =========================

  function send(message) {

    return new Promise((resolve, reject) => {

      chrome.runtime.sendMessage(
        message,
        response => {

          if (chrome.runtime.lastError) {

            reject(
              new Error(
                chrome.runtime.lastError.message
              )
            );

            return;
          }

          if (!response?.ok) {

            reject(
              new Error(
                response?.error ||
                "Request failed."
              )
            );

            return;
          }

          resolve(response);

        }
      );

    });

  }

  // =========================
  // ASK AI
  // =========================

  async function getAI(prompt) {

    const response = await send({

      type: "AI_REQUEST",

      prompt,

      history: chatHistory

    });

    lastAnswer = response.text || "";

    return lastAnswer;

  }

  // =========================
  // SCAN PAGE
  // =========================

  $("scanPage").onclick = () => {

    try {

      $("status").textContent =
        "Scanning page...";

      const text = scanNormalPage();

      if (!text) {

        $("question").value = "";

        $("status").textContent =
          "No readable text was found on this page.";

        return;

      }

      $("question").value = text;

      $("status").textContent =
        `Scanned ${text.length.toLocaleString()} characters.`;

    } catch (error) {

      $("status").textContent =
        "Scan error: " + error.message;

    }

  };

  // =========================
  // WRITE ANSWER INTO PAGE
  // =========================

  $("writePage").onclick = () => {

    try {

      if (!lastAnswer) {

        $("status").textContent =
          "Generate an answer first.";

        return;

      }

      writeNormalPage(lastAnswer);

      $("status").textContent =
        "Answer written into the page.";

    } catch (error) {

      $("status").textContent =
        "Write error: " + error.message;

    }

  };

  // =========================
  // ANSWER BUTTON
  // =========================

  $("answer").onclick = async () => {

    const prompt =
      $("question").value.trim();

    if (!prompt) {

      $("status").textContent =
        "Scan the page or type a question first.";

      return;

    }

    $("status").textContent =
      "Thinking...";

    $("answer").disabled = true;

    try {

      const text = await getAI(prompt);

      $("answerBox").textContent = text;

      chatHistory.push({
        role: "user",
        content: prompt
      });

      chatHistory.push({
        role: "assistant",
        content: text
      });

      chatHistory =
        chatHistory.slice(-20);

      $("status").textContent =
        "Answer ready.";

    } catch (error) {

      $("status").textContent =
        "Error: " + error.message;

    } finally {

      $("answer").disabled = false;

    }

  };

  // =========================
  // COPY
  // =========================

  $("copy").onclick = async () => {

    if (!lastAnswer) {

      $("status").textContent =
        "There is no answer to copy.";

      return;

    }

    try {

      await navigator.clipboard.writeText(
        lastAnswer
      );

      $("status").textContent =
        "Answer copied.";

    } catch {

      $("status").textContent =
        "Could not copy the answer.";

    }

  };

  // =========================
  // ASK TAB
  // =========================

  $("askButton").onclick = async () => {

    const prompt =
      $("askInput").value.trim();

    if (!prompt) return;

    $("chatBox").textContent =
      "Thinking...";

    try {

      const text =
        await getAI(prompt);

      $("chatBox").textContent =
        text;

      chatHistory.push({
        role: "user",
        content: prompt
      });

      chatHistory.push({
        role: "assistant",
        content: text
      });

      chatHistory =
        chatHistory.slice(-20);

      $("askInput").value = "";

    } catch (error) {

      $("chatBox").textContent =
        "Error: " + error.message;

    }

  };

  // =========================
  // LOAD SAVED SETTINGS
  // =========================

  chrome.storage.local.get(
    {
      provider: "openai",
      apiKey: "",
      model: ""
    },
    settings => {

      $("provider").value =
        settings.provider;

      $("apiKey").value =
        settings.apiKey;

      $("model").value =
        settings.model;

    }
  );

  // =========================
  // SAVE SETTINGS
  // =========================

  $("save").onclick = () => {

    chrome.storage.local.set(
      {
        provider:
          $("provider").value,

        apiKey:
          $("apiKey").value.trim(),

        model:
          $("model").value.trim()
      },
      () => {

        $("keyStatus").textContent =
          "Settings saved.";

      }
    );

  };

  // =========================
  // POPUP TOGGLE
  // =========================

  chrome.runtime.onMessage.addListener(
    message => {

      if (
        message?.type ===
        "TOGGLE_HOMEWORK_AI"
      ) {

        if (host.style.display === "none") {
          host.style.display = "block";
        } else {
          host.style.display = "none";
        }

      }

    }
  );

})();
