(() => {
  if (window.__HOMEWORK_AI_LOADED__) return;
  window.__HOMEWORK_AI_LOADED__ = true;

  let lastPageField = null;
  let lastScannedText = "";
  let chatHistory = [];

  const isGoogleSlides =
    location.hostname === "docs.google.com" &&
    location.pathname.includes("/presentation/");

  /* =========================================================
     TEXT EXTRACTION
  ========================================================= */

  function cleanText(text) {
    return String(text || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function collectShadowText(root, output) {
    if (!root) return;

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_ELEMENT
    );

    let node;

    while ((node = walker.nextNode())) {
      const el = node;

      if (el.shadowRoot) {
        const shadowText = el.shadowRoot.innerText;

        if (shadowText) {
          output.push(shadowText);
        }

        collectShadowText(el.shadowRoot, output);
      }
    }
  }

  function collectAccessibilityText() {
    const output = [];

    const elements = document.querySelectorAll(
      "[aria-label], [aria-labelledby], [title], [data-tooltip]"
    );

    for (const el of elements) {
      const values = [
        el.getAttribute("aria-label"),
        el.getAttribute("title"),
        el.getAttribute("data-tooltip")
      ];

      for (const value of values) {
        if (value && value.trim()) {
          output.push(value.trim());
        }
      }
    }

    return output;
  }

  function scanPageText() {
    const parts = [];

    /*
     * Normal webpage text.
     */
    if (document.body) {
      parts.push(document.body.innerText || "");
    }

    /*
     * Accessibility labels.
     * This is particularly important for Google Slides.
     */
    parts.push(collectAccessibilityText());

    /*
     * Shadow DOM text.
     */
    const shadowParts = [];
    collectShadowText(document, shadowParts);
    parts.push(shadowParts);

    /*
     * Inputs and textareas.
     */
    const inputs = document.querySelectorAll(
      "input, textarea, [contenteditable='true']"
    );

    for (const input of inputs) {
      if (input.value) {
        parts.push(input.value);
      }

      if (input.textContent) {
        parts.push(input.textContent);
      }

      if (input.getAttribute("aria-label")) {
        parts.push(input.getAttribute("aria-label"));
      }
    }

    let text = parts
      .flat(Infinity)
      .filter(Boolean)
      .join("\n");

    text = cleanText(text);

    /*
     * Remove repeated lines.
     */
    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const unique = [];
    const seen = new Set();

    for (const line of lines) {
      const key = line.toLowerCase();

      if (!seen.has(key)) {
        seen.add(key);
        unique.push(line);
      }
    }

    text = unique.join("\n");

    /*
     * Don't allow a gigantic page to overwhelm the model.
     */
    const MAX_SCAN = 30000;

    if (text.length > MAX_SCAN) {
      text = text.slice(0, MAX_SCAN) +
        "\n\n[Page text truncated after 30,000 characters.]";
    }

    lastScannedText = text;

    return text;
  }

  /* =========================================================
     GOOGLE SLIDES EXTRA TEXT
  ========================================================= */

  function scanGoogleSlides() {
    const parts = [];

    /*
     * Google Slides uses an accessibility layer in addition
     * to its visual editor. Look for labels and text exposed
     * through the accessibility tree.
     */
    const selectors = [
      "[aria-label]",
      "[role='textbox']",
      "[role='button']",
      "[role='document']",
      "[role='group']",
      "[contenteditable='true']",
      "textarea",
      "input"
    ];

    for (const selector of selectors) {
      let elements;

      try {
        elements = document.querySelectorAll(selector);
      } catch {
        continue;
      }

      for (const el of elements) {
        const values = [
          el.getAttribute("aria-label"),
          el.getAttribute("data-tooltip"),
          el.getAttribute("title"),
          el.value,
          el.innerText,
          el.textContent
        ];

        for (const value of values) {
          if (value && String(value).trim()) {
            parts.push(String(value).trim());
          }
        }
      }
    }

    /*
     * Include normal page text too.
     */
    if (document.body) {
      parts.push(document.body.innerText || "");
    }

    /*
     * Accessibility labels.
     */
    parts.push(collectAccessibilityText());

    const result = cleanText(parts.join("\n"));

    /*
     * Deduplicate lines.
     */
    const seen = new Set();
    const lines = [];

    for (const line of result.split("\n")) {
      const clean = line.trim();

      if (!clean) continue;

      const key = clean.toLowerCase();

      if (!seen.has(key)) {
        seen.add(key);
        lines.push(clean);
      }
    }

    let finalText = lines.join("\n");

    if (finalText.length > 30000) {
      finalText =
        finalText.slice(0, 30000) +
        "\n\n[Google Slides text truncated after 30,000 characters.]";
    }

    lastScannedText = finalText;

    return finalText;
  }

  function scanCurrentPage() {
    if (isGoogleSlides) {
      return scanGoogleSlides();
    }

    return scanPageText();
  }

  /* =========================================================
     EDITABLE FIELD DETECTION
  ========================================================= */

  function findEditableField() {
    const active = document.activeElement;

    if (
      active &&
      (
        active.tagName === "TEXTAREA" ||
        active.tagName === "INPUT" ||
        active.isContentEditable
      )
    ) {
      return active;
    }

    const candidates = [
      "textarea",
      "input:not([type='hidden'])",
      "[contenteditable='true']",
      "[role='textbox']"
    ];

    for (const selector of candidates) {
      const elements = document.querySelectorAll(selector);

      for (const element of elements) {
        const rect = element.getBoundingClientRect();

        if (
          rect.width > 0 &&
          rect.height > 0 &&
          getComputedStyle(element).visibility !== "hidden"
        ) {
          return element;
        }
      }
    }

    return null;
  }

  document.addEventListener(
    "focusin",
    (event) => {
      const target = event.target;

      if (
        target &&
        (
          target.tagName === "TEXTAREA" ||
          target.tagName === "INPUT" ||
          target.isContentEditable ||
          target.getAttribute?.("role") === "textbox"
        )
      ) {
        lastPageField = target;
      }
    },
    true
  );

  function setNativeValue(element, value) {
    if (!element) return false;

    /*
     * Normal input / textarea.
     */
    if (
      element.tagName === "INPUT" ||
      element.tagName === "TEXTAREA"
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

      return true;
    }

    /*
     * Contenteditable.
     */
    if (element.isContentEditable) {
      element.focus();

      const selection = window.getSelection();

      if (selection) {
        selection.removeAllRanges();

        const range = document.createRange();

        range.selectNodeContents(element);

        selection.addRange(range);
      }

      try {
        document.execCommand(
          "insertText",
          false,
          value
        );

        element.dispatchEvent(
          new InputEvent("input", {
            bubbles: true,
            inputType: "insertText",
            data: value
          })
        );

        return true;
      } catch {
        element.textContent = value;

        element.dispatchEvent(
          new Event("input", {
            bubbles: true
          })
        );

        return true;
      }
    }

    return false;
  }

  /* =========================================================
     WRITE INTO GOOGLE SLIDES
  ========================================================= */

  async function writeIntoPage(text) {
    if (!text) {
      throw new Error("There is no answer to write.");
    }

    /*
     * Prefer the field that the user last clicked.
     */
    let target = lastPageField;

    /*
     * If that disappeared, look for an active editor.
     */
    if (!target || !document.contains(target)) {
      target = findEditableField();
    }

    if (target) {
      const success = setNativeValue(target, text);

      if (success) {
        return true;
      }
    }

    /*
     * Google Slides can have an editor that isn't exposed
     * as a normal input. Try the currently active element.
     */
    const active = document.activeElement;

    if (
      active &&
      active !== document.body &&
      (
        active.isContentEditable ||
        active.tagName === "TEXTAREA" ||
        active.tagName === "INPUT"
      )
    ) {
      if (setNativeValue(active, text)) {
        return true;
      }
    }

    /*
     * Last resort:
     * put the answer on the clipboard so it can be pasted
     * directly into the selected Google Slides text box.
     */
    try {
      await navigator.clipboard.writeText(text);

      throw new Error(
        "Google Slides did not expose its text editor. " +
        "Click inside a text box on the slide first, then click " +
        "\"Write into page\" again. The answer has been copied to your clipboard, so Ctrl+V will paste it."
      );
    } catch (clipboardError) {
      if (clipboardError.message.includes("Google Slides")) {
        throw clipboardError;
      }

      throw new Error(
        "Could not find a writable text box. Click inside the Google Slides text box first."
      );
    }
  }

  /* =========================================================
     AI REQUEST
  ========================================================= */

  function askAI(prompt) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: "AI_REQUEST",
          prompt,
          history: chatHistory
        },
        (response) => {
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
                "AI request failed."
              )
            );
            return;
          }

          resolve(response.text || "");
        }
      );
    });
  }

  /* =========================================================
     UI
  ========================================================= */

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
        width: 390px;
        max-height: 85vh;
        background: #111827;
        color: white;
        border: 1px solid #374151;
        border-radius: 14px;
        box-shadow: 0 15px 50px rgba(0,0,0,.45);
        overflow: hidden;
        font-family: Arial, sans-serif;
      }

      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 16px;
        background: #1f2937;
      }

      .title {
        font-weight: bold;
        font-size: 16px;
      }

      .close {
        border: 0;
        background: transparent;
        color: white;
        font-size: 20px;
        cursor: pointer;
      }

      .tabs {
        display: flex;
        background: #0f172a;
      }

      .tab {
        flex: 1;
        border: 0;
        padding: 10px;
        background: transparent;
        color: #9ca3af;
        cursor: pointer;
      }

      .tab.active {
        color: white;
        background: #1f2937;
      }

      .body {
        padding: 14px;
        overflow-y: auto;
        max-height: 70vh;
      }

      textarea,
      input,
      select {
        width: 100%;
        padding: 10px;
        border-radius: 8px;
        border: 1px solid #4b5563;
        background: #0f172a;
        color: white;
        outline: none;
      }

      textarea {
        min-height: 100px;
        resize: vertical;
      }

      button.action {
        width: 100%;
        margin-top: 8px;
        padding: 10px;
        border: 0;
        border-radius: 8px;
        background: #2563eb;
        color: white;
        cursor: pointer;
        font-weight: bold;
      }

      button.secondary {
        background: #374151;
      }

      button.danger {
        background: #991b1b;
      }

      .status {
        margin-top: 10px;
        padding: 9px;
        border-radius: 8px;
        background: #1f2937;
        color: #d1d5db;
        white-space: pre-wrap;
        font-size: 12px;
      }

      .answer {
        margin-top: 12px;
        padding: 12px;
        background: #0f172a;
        border: 1px solid #374151;
        border-radius: 8px;
        white-space: pre-wrap;
        line-height: 1.45;
        max-height: 300px;
        overflow-y: auto;
      }

      .hidden {
        display: none;
      }

      label {
        display: block;
        margin: 10px 0 5px;
        font-size: 12px;
        color: #d1d5db;
      }

      .small {
        font-size: 11px;
        color: #9ca3af;
        margin-top: 6px;
        line-height: 1.4;
      }
    </style>

    <div class="panel">
      <div class="header">
        <div class="title">Homework AI</div>
        <button class="close" id="close">×</button>
      </div>

      <div class="tabs">
        <button class="tab active" data-tab="answer">Answer</button>
        <button class="tab" data-tab="ask">Ask</button>
        <button class="tab" data-tab="key">API Key</button>
      </div>

      <div class="body">

        <div id="answerTab">

          <textarea
            id="question"
            placeholder="Type a question or scan the page..."
          ></textarea>

          <button class="action" id="scan">
            Scan Page
          </button>

          <button class="action" id="answer">
            Answer
          </button>

          <button class="action secondary" id="write">
            Write into page
          </button>

          <button class="action secondary" id="copy">
            Copy Answer
          </button>

          <div class="status" id="scanStatus">
            Ready.
          </div>

          <div class="answer" id="answerBox"></div>

        </div>

        <div id="askTab" class="hidden">

          <textarea
            id="askInput"
            placeholder="Ask Homework AI anything..."
          ></textarea>

          <button class="action" id="askButton">
            Ask
          </button>

          <div class="answer" id="chatBox"></div>

        </div>

        <div id="keyTab" class="hidden">

          <label>Provider</label>

          <select id="provider">
            <option value="openai">OpenAI</option>
            <option value="gemini">Google Gemini</option>
            <option value="groq">Groq</option>
          </select>

          <label>Model</label>

          <input
            id="model"
            placeholder="Enter the model ID"
          />

          <label>API Key</label>

          <input
            id="apiKey"
            type="password"
            placeholder="Paste API key"
          />

          <button class="action" id="saveKey">
            Save Settings
          </button>

          <div class="small">
            Your API key is stored in Chrome's local extension storage.
            Do not put your API key in GitHub.
          </div>

          <div class="status" id="keyStatus"></div>

        </div>

      </div>
    </div>
  `;

  const $ = (id) => shadow.getElementById(id);

  /* =========================================================
     TABS
  ========================================================= */

  shadow.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      shadow.querySelectorAll(".tab").forEach((t) => {
        t.classList.remove("active");
      });

      tab.classList.add("active");

      $("answerTab").classList.add("hidden");
      $("askTab").classList.add("hidden");
      $("keyTab").classList.add("hidden");

      const name = tab.dataset.tab;

      if (name === "answer") {
        $("answerTab").classList.remove("hidden");
      }

      if (name === "ask") {
        $("askTab").classList.remove("hidden");
      }

      if (name === "key") {
        $("keyTab").classList.remove("hidden");
      }
    });
  });

  /* =========================================================
     CLOSE
  ========================================================= */

  $("close").addEventListener("click", () => {
    host.remove();
    window.__HOMEWORK_AI_LOADED__ = false;
  });

  /* =========================================================
     SCAN
  ========================================================= */

  $("scan").addEventListener("click", () => {
    try {
      const text = scanCurrentPage();

      if (!text) {
        $("scanStatus").textContent =
          "No readable text was found on this page.";
        return;
      }

      $("question").value = text;

      $("scanStatus").textContent =
        `Scanned ${text.length.toLocaleString()} characters` +
        (isGoogleSlides
          ? " from Google Slides."
          : " from the page.");
    } catch (error) {
      $("scanStatus").textContent =
        "Scan error: " + error.message;
    }
  });

  /* =========================================================
     ANSWER
  ========================================================= */

  $("answer").addEventListener("click", async () => {
    const question = $("question").value.trim();

    if (!question) {
      $("scanStatus").textContent =
        "Enter a question or scan the page first.";
      return;
    }

    $("scanStatus").textContent =
      "Thinking...";

    $("answer").disabled = true;

    try {
      const text = await askAI(question);

      $("answerBox").textContent = text;

      chatHistory.push({
        role: "user",
        content: question
      });

      chatHistory.push({
        role: "assistant",
        content: text
      });

      chatHistory = chatHistory.slice(-20);

      $("scanStatus").textContent =
        "Answer ready.";
    } catch (error) {
      $("scanStatus").textContent =
        "Error: " + error.message;
    } finally {
      $("answer").disabled = false;
    }
  });

  /* =========================================================
     WRITE
  ========================================================= */

  $("write").addEventListener("click", async () => {
    const text = $("answerBox").textContent.trim();

    if (!text) {
      $("scanStatus").textContent =
        "Generate an answer first.";
      return;
    }

    $("scanStatus").textContent =
      "Writing...";

    try {
      await writeIntoPage(text);

      $("scanStatus").textContent =
        isGoogleSlides
          ? "Answer written into the selected text box."
          : "Answer written into the page.";
    } catch (error) {
      $("scanStatus").textContent =
        error.message;
    }
  });

  /* =========================================================
     COPY
  ========================================================= */

  $("copy").addEventListener("click", async () => {
    const text = $("answerBox").textContent.trim();

    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);

      $("scanStatus").textContent =
        "Answer copied.";
    } catch {
      $("scanStatus").textContent =
        "Could not copy the answer.";
    }
  });

  /* =========================================================
     ASK TAB
  ========================================================= */

  $("askButton").addEventListener("click", async () => {
    const prompt = $("askInput").value.trim();

    if (!prompt) return;

    $("askButton").disabled = true;

    $("chatBox").textContent =
      "Thinking...";

    try {
      const text = await askAI(prompt);

      $("chatBox").textContent = text;

      chatHistory.push({
        role: "user",
        content: prompt
      });

      chatHistory.push({
        role: "assistant",
        content: text
      });

      chatHistory = chatHistory.slice(-20);

      $("askInput").value = "";
    } catch (error) {
      $("chatBox").textContent =
        "Error: " + error.message;
    } finally {
      $("askButton").disabled = false;
    }
  });

  /* =========================================================
     API SETTINGS
  ========================================================= */

  chrome.storage.local.get(
    {
      provider: "openai",
      apiKey: "",
      model: ""
    },
    (settings) => {
      $("provider").value =
        settings.provider || "openai";

      $("apiKey").value =
        settings.apiKey || "";

      $("model").value =
        settings.model || "";
    }
  );

  $("saveKey").addEventListener("click", () => {
    const provider =
      $("provider").value;

    const apiKey =
      $("apiKey").value.trim();

    const model =
      $("model").value.trim();

    chrome.storage.local.set(
      {
        provider,
        apiKey,
        model
      },
      () => {
        $("keyStatus").textContent =
          "Settings saved.";
      }
    );
  });

  /* =========================================================
     TOGGLE MESSAGE
  ========================================================= */

  chrome.runtime.onMessage.addListener(
    (message) => {
      if (
        message?.type ===
        "TOGGLE_HOMEWORK_AI"
      ) {
        host.style.display =
          host.style.display === "none"
            ? "block"
            : "none";
      }
    }
  );

  /*
   * Initial scan for pages where the user opens the
   * assistant after loading the extension.
   */
  setTimeout(() => {
    try {
      if (isGoogleSlides) {
        scanGoogleSlides();
      }
    } catch {}
  }, 1500);
})();
