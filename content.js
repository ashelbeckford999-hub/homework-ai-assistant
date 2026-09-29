(() => {
  if (window.__HOMEWORK_AI_LOADED__) return;
  window.__HOMEWORK_AI_LOADED__ = true;

  // ============================================================
  // GOOGLE DOCS / GOOGLE SLIDES ONLY
  // ============================================================

  const isGoogleDocs =
    location.hostname === "docs.google.com" &&
    location.pathname.startsWith("/document/");

  const isGoogleSlides =
    location.hostname === "docs.google.com" &&
    location.pathname.startsWith("/presentation/");

  const isSupportedPage =
    isGoogleDocs || isGoogleSlides;

  if (!isSupportedPage) {
    window.__HOMEWORK_AI_LOADED__ = false;
    return;
  }

  let chatHistory = [];
  let lastAnswer = "";

  // This is deliberately NOT the Google Docs title input.
  let lastEditorTarget = null;

  // ============================================================
  // HELPERS
  // ============================================================

  function clean(text) {
    return String(text || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function isExtensionElement(element) {
    if (!element) return false;

    return (
      element === host ||
      host?.contains(element)
    );
  }

  function isTitleField(element) {
    if (!element) return false;

    const values = [
      element.id,
      element.getAttribute?.("aria-label"),
      element.getAttribute?.("data-tooltip"),
      element.getAttribute?.("data-placeholder"),
      element.getAttribute?.("name"),
      element.className
    ]
      .map(value => String(value || "").toLowerCase())
      .join(" ");

    return (
      values.includes("document title") ||
      values.includes("presentation title") ||
      values.includes("untitled document") ||
      values.includes("untitled presentation") ||
      values.includes("docs-title") ||
      values.includes("docs-title-input") ||
      values.includes("document name")
    );
  }

  function isEditableElement(element) {
    if (!element) return false;

    if (isExtensionElement(element)) {
      return false;
    }

    if (isTitleField(element)) {
      return false;
    }

    if (
      element.tagName === "TEXTAREA" ||
      element.tagName === "INPUT" ||
      element.isContentEditable ||
      element.getAttribute?.("role") === "textbox"
    ) {
      return true;
    }

    return false;
  }

  // ============================================================
  // FIND GOOGLE DOCS EDITOR
  // ============================================================

  function findGoogleDocsEditor() {
    if (!isGoogleDocs) {
      return null;
    }

    const selectors = [
      "textarea.docs-texteventtarget-iframe",
      "textarea.docs-texteventtarget",
      "textarea[aria-label*='document']",
      "textarea[aria-label*='Document']",
      "textarea"
    ];

    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);

      for (const element of elements) {
        if (!element) continue;
        if (isExtensionElement(element)) continue;
        if (isTitleField(element)) continue;

        const rect = element.getBoundingClientRect();

        /*
         * Google Docs often keeps its real editing textarea
         * hidden/off-screen. We therefore don't require it to
         * have a visible rectangle.
         */

        if (
          element.tagName === "TEXTAREA" &&
          !isTitleField(element)
        ) {
          return element;
        }
      }
    }

    /*
     * Search inside same-origin iframes where possible.
     */
    const frames = document.querySelectorAll("iframe");

    for (const frame of frames) {
      try {
        const frameDocument =
          frame.contentDocument;

        if (!frameDocument) continue;

        const textareas =
          frameDocument.querySelectorAll("textarea");

        for (const textarea of textareas) {
          if (!isTitleField(textarea)) {
            return textarea;
          }
        }
      } catch {
        // Cross-origin iframe. Ignore it.
      }
    }

    return null;
  }

  // ============================================================
  // FIND GOOGLE SLIDES EDITOR
  // ============================================================

  function findGoogleSlidesEditor() {
    if (!isGoogleSlides) {
      return null;
    }

    const candidates = [];

    document
      .querySelectorAll(
        "textarea, input, [contenteditable='true'], [role='textbox']"
      )
      .forEach(element => {
        if (!element) return;
        if (isExtensionElement(element)) return;
        if (isTitleField(element)) return;

        candidates.push(element);
      });

    /*
     * Prefer the currently focused editable element.
     */
    const active = document.activeElement;

    if (
      active &&
      isEditableElement(active)
    ) {
      return active;
    }

    /*
     * Otherwise use the first non-title editor candidate.
     */
    return candidates[0] || null;
  }

  // ============================================================
  // REMEMBER EDITOR FOCUS
  // ============================================================

  document.addEventListener(
    "focusin",
    event => {
      const target = event.target;

      if (!target) return;

      if (isExtensionElement(target)) {
        return;
      }

      /*
       * VERY IMPORTANT:
       * Never remember the Google Docs/Slides title.
       */
      if (isTitleField(target)) {
        return;
      }

      if (isEditableElement(target)) {
        lastEditorTarget = target;
      }
    },
    true
  );

  document.addEventListener(
    "mousedown",
    event => {
      const target = event.target;

      if (!target) return;

      if (isExtensionElement(target)) {
        return;
      }

      if (isTitleField(target)) {
        return;
      }

      /*
       * If Google exposes an editable element under the mouse,
       * remember it.
       */
      if (isEditableElement(target)) {
        lastEditorTarget = target;
      }

      /*
       * Google Docs uses a special editor target.
       * If the click occurs somewhere in the document area,
       * try to locate that editor after the click.
       */
      if (isGoogleDocs) {
        setTimeout(() => {
          const editor =
            findGoogleDocsEditor();

          if (editor && !isTitleField(editor)) {
            lastEditorTarget = editor;
          }
        }, 100);
      }

      if (isGoogleSlides) {
        setTimeout(() => {
          const editor =
            findGoogleSlidesEditor();

          if (editor && !isTitleField(editor)) {
            lastEditorTarget = editor;
          }
        }, 100);
      }
    },
    true
  );

  // ============================================================
  // SCAN GOOGLE DOCS / SLIDES TEXT
  // ============================================================

  function scanWorkspaceText() {
    const textParts = [];

    if (document.body) {
      textParts.push(
        document.body.innerText || ""
      );
    }

    document
      .querySelectorAll(
        "input, textarea, [contenteditable='true'], [role='textbox']"
      )
      .forEach(element => {
        if (isExtensionElement(element)) {
          return;
        }

        if (isTitleField(element)) {
          return;
        }

        if (element.value) {
          textParts.push(element.value);
        }

        if (element.innerText) {
          textParts.push(element.innerText);
        }

        if (element.textContent) {
          textParts.push(element.textContent);
        }
      });

    const cleaned =
      clean(textParts.join("\n"));

    const seen = new Set();
    const lines = [];

    for (const line of cleaned.split("\n")) {
      const trimmed = line.trim();

      if (!trimmed) continue;

      const key =
        trimmed.toLowerCase();

      if (!seen.has(key)) {
        seen.add(key);
        lines.push(trimmed);
      }
    }

    return lines
      .join("\n")
      .slice(0, 50000);
  }

  // ============================================================
  // WRITE INTO GOOGLE DOCS
  // ============================================================

  function writeGoogleDocs(text) {
    if (!text) {
      throw new Error(
        "There is no answer to write."
      );
    }

    /*
     * First use the target we remembered.
     */
    let target = lastEditorTarget;

    /*
     * Make sure it still exists.
     */
    if (
      !target ||
      (!document.contains(target) &&
        !isTitleField(target))
    ) {
      target = null;
    }

    /*
     * Never write into a title.
     */
    if (target && isTitleField(target)) {
      target = null;
    }

    /*
     * Try the actual Google Docs editor.
     */
    if (!target) {
      target =
        findGoogleDocsEditor();
    }

    if (!target) {
      throw new Error(
        "Google Docs editor could not be detected. Click inside the document text once, wait a moment, then click Write into Page."
      );
    }

    if (isTitleField(target)) {
      throw new Error(
        "The Google Docs title was detected instead of the document body. Click inside the document text, not the title."
      );
    }

    /*
     * Focus the Google editor.
     */
    try {
      target.focus();
    } catch {}

    /*
     * Google Docs uses a hidden textarea as a text event target.
     *
     * execCommand("insertText") is useful here because it sends
     * an editing command rather than simply changing the title
     * field's value.
     */
    try {
      const selection =
        window.getSelection();

      if (selection) {
        selection.removeAllRanges();
      }
    } catch {}

    let inserted = false;

    try {
      inserted =
        document.execCommand(
          "insertText",
          false,
          text
        );
    } catch {
      inserted = false;
    }

    /*
     * Some Google Docs versions expose the editor as a textarea.
     */
    if (!inserted && target.tagName === "TEXTAREA") {
      const prototype =
        HTMLTextAreaElement.prototype;

      const setter =
        Object.getOwnPropertyDescriptor(
          prototype,
          "value"
        )?.set;

      if (setter) {
        setter.call(target, text);
      } else {
        target.value = text;
      }

      target.dispatchEvent(
        new InputEvent(
          "input",
          {
            bubbles: true,
            inputType: "insertText",
            data: text
          }
        )
      );

      inserted = true;
    }

    if (!inserted) {
      throw new Error(
        "Google Docs accepted the editor focus but did not accept the inserted text. Click inside the document body and try again."
      );
    }

    lastEditorTarget = target;

    return true;
  }

  // ============================================================
  // WRITE INTO GOOGLE SLIDES
  // ============================================================

  function writeGoogleSlides(text) {
    if (!text) {
      throw new Error(
        "There is no answer to write."
      );
    }

    let target =
      lastEditorTarget;

    if (
      !target ||
      (!document.contains(target) &&
        !isTitleField(target))
    ) {
      target = null;
    }

    if (target && isTitleField(target)) {
      target = null;
    }

    if (!target) {
      target =
        findGoogleSlidesEditor();
    }

    if (!target) {
      throw new Error(
        "Google Slides editor could not be detected. Click inside the text box where you want the answer, then click Write into Page."
      );
    }

    if (isTitleField(target)) {
      throw new Error(
        "The Slides title was detected instead of the selected text box."
      );
    }

    target.focus();

    let inserted = false;

    try {
      inserted =
        document.execCommand(
          "insertText",
          false,
          text
        );
    } catch {
      inserted = false;
    }

    if (
      !inserted &&
      (
        target.tagName === "TEXTAREA" ||
        target.tagName === "INPUT"
      )
    ) {
      const prototype =
        target.tagName === "TEXTAREA"
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;

      const setter =
        Object.getOwnPropertyDescriptor(
          prototype,
          "value"
        )?.set;

      if (setter) {
        setter.call(target, text);
      } else {
        target.value = text;
      }

      target.dispatchEvent(
        new InputEvent(
          "input",
          {
            bubbles: true,
            inputType: "insertText",
            data: text
          }
        )
      );

      target.dispatchEvent(
        new Event(
          "change",
          {
            bubbles: true
          }
        )
      );

      inserted = true;
    }

    if (!inserted) {
      throw new Error(
        "Google Slides did not accept the inserted text. Click directly inside the text box and try again."
      );
    }

    lastEditorTarget = target;

    return true;
  }

  // ============================================================
  // WRITE INTO PAGE
  // ============================================================

  function writeIntoWorkspace(text) {
    if (isGoogleDocs) {
      return writeGoogleDocs(text);
    }

    if (isGoogleSlides) {
      return writeGoogleSlides(text);
    }

    throw new Error(
      "This extension only works in Google Docs and Google Slides."
    );
  }

  // ============================================================
  // CREATE PANEL
  // ============================================================

  const host =
    document.createElement("div");

  host.id =
    "homework-ai-host";

  Object.assign(
    host.style,
    {
      position: "fixed",
      top: "20px",
      right: "20px",
      zIndex: "2147483647"
    }
  );

  document.documentElement.appendChild(host);

  const shadow =
    host.attachShadow({
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

        <button
          class="close"
          id="close"
        >
          ×
        </button>
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

  // ============================================================
  // HELPERS
  // ============================================================

  const $ =
    id => shadow.getElementById(id);

  // ============================================================
  // TABS
  // ============================================================

  shadow
    .querySelectorAll(".tab")
    .forEach(tab => {

      tab.addEventListener(
        "click",
        () => {

          shadow
            .querySelectorAll(".tab")
            .forEach(x =>
              x.classList.remove("active")
            );

          tab.classList.add("active");

          $("answerTab")
            .classList.add("hidden");

          $("askTab")
            .classList.add("hidden");

          $("keyTab")
            .classList.add("hidden");

          $(
            tab.dataset.tab + "Tab"
          ).classList.remove("hidden");

        }
      );

    });

  // ============================================================
  // CLOSE
  // ============================================================

  $("close").onclick = () => {

    host.remove();

    window.__HOMEWORK_AI_LOADED__ =
      false;

  };

  // ============================================================
  // SEND MESSAGE
  // ============================================================

  function send(message) {

    return new Promise(
      (resolve, reject) => {

        chrome.runtime.sendMessage(
          message,
          response => {

            if (
              chrome.runtime.lastError
            ) {

              reject(
                new Error(
                  chrome.runtime
                    .lastError
                    .message
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

      }
    );

  }

  // ============================================================
  // AI
  // ============================================================

  async function getAI(prompt) {

    const response =
      await send({

        type: "AI_REQUEST",

        prompt,

        history:
          chatHistory

      });

    lastAnswer =
      response.text || "";

    return lastAnswer;
  }

  // ============================================================
  // SCAN
  // ============================================================

  $("scanPage").onclick =
    async () => {

      $("scanPage").disabled =
        true;

      try {

        $("status").textContent =
          "Scanning Google Docs/Slides...";

        const localText =
          scanWorkspaceText();

        /*
         * Ask the background service worker to capture
         * the visible Docs/Slides page and run Groq vision
         * OCR on it.
         */
        let visualText = "";

        try {

          /*
           * Hide our own panel so Groq does not see
           * the Homework AI panel in the screenshot.
           */
          host.style.display =
            "none";

          await new Promise(
            resolve =>
              setTimeout(
                resolve,
                150
              )
          );

          const visionResponse =
            await send({
              type:
                "GROQ_VISION_SCAN"
            });

          visualText =
            visionResponse.text ||
            "";

        } catch (visionError) {

          visualText = "";

          console.warn(
            "Visual scan failed:",
            visionError
          );

        } finally {

          host.style.display =
            "block";

        }

        const combined =
          clean(
            [
              localText,
              visualText
            ]
              .filter(Boolean)
              .join("\n\n")
          );

        if (!combined) {

          $("question").value =
            "";

          $("status").textContent =
            "No readable homework text was found. Put the homework in the visible Docs/Slides area and try Scan Page again.";

          return;
        }

        $("question").value =
          combined.slice(
            0,
            50000
          );

        $("status").textContent =
          `Scan complete. Found approximately ${combined.length.toLocaleString()} characters.`;

      } catch (error) {

        host.style.display =
          "block";

        $("status").textContent =
          "Scan error: " +
          error.message;

      } finally {

        $("scanPage").disabled =
          false;

      }

    };

  // ============================================================
  // WRITE
  // ============================================================

  $("writePage").onclick =
    () => {

      if (!lastAnswer) {

        $("status").textContent =
          "Generate an answer first.";

        return;

      }

      try {

        $("status").textContent =
          "Finding the Google Docs/Slides editing position...";

        writeIntoWorkspace(
          lastAnswer
        );

        $("status").textContent =
          "Answer written into the document.";

      } catch (error) {

        $("status").textContent =
          "Write error: " +
          error.message;

      }

    };

  // ============================================================
  // ANSWER
  // ============================================================

  $("answer").onclick =
    async () => {

      const prompt =
        $("question")
          .value
          .trim();

      if (!prompt) {

        $("status").textContent =
          "Scan the page or type a question first.";

        return;

      }

      $("status").textContent =
        "Thinking...";

      $("answer").disabled =
        true;

      try {

        const text =
          await getAI(prompt);

        $("answerBox")
          .textContent =
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

        $("status").textContent =
          "Answer ready.";

      } catch (error) {

        $("status").textContent =
          "Error: " +
          error.message;

      } finally {

        $("answer").disabled =
          false;

      }

    };

  // ============================================================
  // COPY
  // ============================================================

  $("copy").onclick =
    async () => {

      if (!lastAnswer) {

        $("status").textContent =
          "There is no answer to copy.";

        return;

      }

      try {

        await navigator.clipboard
          .writeText(lastAnswer);

        $("status").textContent =
          "Answer copied.";

      } catch {

        $("status").textContent =
          "Could not copy the answer.";

      }

    };

  // ============================================================
  // ASK
  // ============================================================

  $("askButton").onclick =
    async () => {

      const prompt =
        $("askInput")
          .value
          .trim();

      if (!prompt) return;

      $("chatBox").textContent =
        "Thinking...";

      try {

        const text =
          await getAI(prompt);

        $("chatBox")
          .textContent =
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

        $("askInput").value =
          "";

      } catch (error) {

        $("chatBox")
          .textContent =
          "Error: " +
          error.message;

      }

    };

  // ============================================================
  // SETTINGS
  // ============================================================

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

  $("save").onclick =
    () => {

      chrome.storage.local.set(
        {
          provider:
            $("provider").value,

          apiKey:
            $("apiKey")
              .value
              .trim(),

          model:
            $("model")
              .value
              .trim()
        },
        () => {

          $("keyStatus")
            .textContent =
            "Settings saved.";

        }
      );

    };

  // ============================================================
  // TOGGLE
  // ============================================================

  chrome.runtime.onMessage
    .addListener(
      message => {

        if (
          message?.type ===
          "TOGGLE_HOMEWORK_AI"
        ) {

          if (
            host.style.display ===
            "none"
          ) {

            host.style.display =
              "block";

          } else {

            host.style.display =
              "none";

          }

        }

      }
    );

})();
