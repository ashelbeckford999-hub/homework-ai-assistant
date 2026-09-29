(() => {
  if (window.__HOMEWORK_AI_LOADED__) return;
  window.__HOMEWORK_AI_LOADED__ = true;

  /*
   * HOMEWORK AI ASSISTANT
   * Google Docs + Google Slides
   *
   * Existing tabs preserved:
   * 1. Answer
   * 2. Ask
   * 3. API Key
   *
   * The important changes are:
   * - Google Docs title is never selected as the write target.
   * - Google Slides title is avoided when possible.
   * - Scan collects document/slide text.
   * - Scan can ask Groq's vision model to read visible homework
   *   from the page.
   * - Write remembers the document/slide editing target.
   */

  const IS_DOCS =
    location.hostname === "docs.google.com" &&
    location.pathname.startsWith("/document/");

  const IS_SLIDES =
    location.hostname === "docs.google.com" &&
    location.pathname.startsWith("/presentation/");

  /*
   * Do not run this extension on normal websites.
   */
  if (!IS_DOCS && !IS_SLIDES) {
    window.__HOMEWORK_AI_LOADED__ = false;
    return;
  }

  let chatHistory = [];
  let lastPageField = null;
  let lastAnswer = "";

  let lastScanText = "";

  let isScanning = false;
  let isWriting = false;

  // =========================
  // BASIC HELPERS
  // =========================

  function clean(text) {
    return String(text || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function sleep(ms) {
    return new Promise(resolve => {
      setTimeout(resolve, ms);
    });
  }

  function isVisible(element) {
    if (!element) return false;

    const style =
      window.getComputedStyle(element);

    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0"
    ) {
      return false;
    }

    const rect =
      element.getBoundingClientRect();

    return (
      rect.width > 0 &&
      rect.height > 0
    );
  }

  function uniqueLines(text) {
    const seen = new Set();
    const lines = [];

    for (const line of String(text || "").split("\n")) {
      const trimmed = line.trim();

      if (!trimmed) continue;

      const key =
        trimmed.toLowerCase();

      if (!seen.has(key)) {
        seen.add(key);
        lines.push(trimmed);
      }
    }

    return lines.join("\n");
  }

  function getDocumentId() {
    if (!IS_DOCS) return null;

    const match =
      location.pathname.match(
        /\/document\/d\/([^/]+)/
      );

    return match ? match[1] : null;
  }

  function getPresentationId() {
    if (!IS_SLIDES) return null;

    const match =
      location.pathname.match(
        /\/presentation\/d\/([^/]+)/
      );

    return match ? match[1] : null;
  }

  // =========================
  // GOOGLE DOCS TITLE CHECK
  // =========================

  function isDocsTitleField(element) {
    if (!element) return false;

    const aria =
      (
        element.getAttribute("aria-label") ||
        ""
      ).toLowerCase();

    const name =
      (
        element.getAttribute("name") ||
        ""
      ).toLowerCase();

    const id =
      (
        element.id ||
        ""
      ).toLowerCase();

    const cls =
      String(
        element.className || ""
      ).toLowerCase();

    const combined =
      `${aria} ${name} ${id} ${cls}`;

    /*
     * These are deliberately broad because Google's internal
     * DOM changes between versions.
     */

    return (
      combined.includes("document title") ||
      combined.includes("title input") ||
      combined.includes("title") &&
      (
        combined.includes("docs") ||
        combined.includes("document")
      )
    );
  }

  // =========================
  // GOOGLE SLIDES TITLE CHECK
  // =========================

  function looksLikeSlidesTitle(element) {
    if (!element) return false;

    const aria =
      (
        element.getAttribute("aria-label") ||
        ""
      ).toLowerCase();

    const text =
      (
        element.innerText ||
        element.textContent ||
        ""
      ).toLowerCase();

    const combined =
      `${aria} ${text}`;

    return (
      combined.includes("title placeholder") ||
      combined.includes("title") ||
      combined.includes("subtitle")
    );
  }

  // =========================
  // REMEMBER TEXT BOXES
  // =========================

  document.addEventListener(
    "focusin",
    event => {
      const target =
        event.target;

      if (!target) return;

      /*
       * Never remember the Google Docs title.
       */

      if (
        IS_DOCS &&
        isDocsTitleField(target)
      ) {
        return;
      }

      /*
       * Never remember obvious Slides title elements.
       */

      if (
        IS_SLIDES &&
        looksLikeSlidesTitle(target)
      ) {
        return;
      }

      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable ||
        target.getAttribute?.("role") === "textbox"
      ) {
        lastPageField = target;
      }
    },
    true
  );

  // =========================
  // SCAN GOOGLE DOCS
  // =========================

  function scanGoogleDocs() {
    const textParts = [];

    /*
     * Accessibility text is often the most useful DOM source
     * for Google Docs.
     */

    document
      .querySelectorAll(
        "[role='textbox'], [contenteditable='true'], [aria-label]"
      )
      .forEach(element => {

        if (!isVisible(element)) {
          return;
        }

        if (
          isDocsTitleField(element)
        ) {
          return;
        }

        const role =
          (
            element.getAttribute("role") ||
            ""
          ).toLowerCase();

        /*
         * Ignore obvious UI controls.
         */

        if (
          role === "button" ||
          role === "menuitem" ||
          role === "toolbar"
        ) {
          return;
        }

        const value =
          element.value ||
          element.innerText ||
          element.textContent ||
          "";

        if (value) {
          textParts.push(value);
        }

        const aria =
          element.getAttribute(
            "aria-label"
          );

        if (
          aria &&
          !isDocsTitleField(element)
        ) {
          textParts.push(aria);
        }
      });

    /*
     * Also inspect the main application text, but remove obvious
     * Google Docs interface words.
     */

    if (document.body) {

      const bodyText =
        document.body.innerText || "";

      const lines =
        bodyText.split("\n");

      const filtered = [];

      const chromeWords = new Set([
        "File",
        "Edit",
        "View",
        "Insert",
        "Format",
        "Tools",
        "Extensions",
        "Help",
        "Share",
        "Comments",
        "Present",
        "Undo",
        "Redo",
        "Print",
        "Zoom"
      ]);

      for (const line of lines) {

        const trimmed =
          line.trim();

        if (!trimmed) continue;

        if (
          chromeWords.has(trimmed)
        ) {
          continue;
        }

        filtered.push(trimmed);
      }

      textParts.push(
        filtered.join("\n")
      );
    }

    const result =
      uniqueLines(
        clean(
          textParts.join("\n")
        )
      );

    return result.slice(
      0,
      50000
    );
  }

  // =========================
  // SCAN GOOGLE SLIDES
  // =========================

  function scanGoogleSlides() {
    const textParts = [];

    /*
     * Google Slides exposes a lot of its slide content through
     * accessibility labels.
     */

    document
      .querySelectorAll(
        "[role='textbox'], [contenteditable='true'], [aria-label]"
      )
      .forEach(element => {

        if (!isVisible(element)) {
          return;
        }

        if (
          element.closest(
            "#homework-ai-host"
          )
        ) {
          return;
        }

        if (
          looksLikeSlidesTitle(element)
        ) {
          /*
           * We don't want the presentation title to become the
           * homework question.
           */
          return;
        }

        const value =
          element.innerText ||
          element.textContent ||
          element.getAttribute(
            "aria-label"
          ) ||
          "";

        if (value) {
          textParts.push(value);
        }
      });

    /*
     * Body text fallback.
     */

    if (document.body) {

      const bodyText =
        document.body.innerText || "";

      const lines =
        bodyText.split("\n");

      const filtered = [];

      const chromeWords = new Set([
        "File",
        "Edit",
        "View",
        "Insert",
        "Slide",
        "Format",
        "Arrange",
        "Tools",
        "Extensions",
        "Help",
        "Present",
        "Share",
        "Comments",
        "Undo",
        "Redo",
        "Zoom"
      ]);

      for (const line of lines) {

        const trimmed =
          line.trim();

        if (!trimmed) continue;

        if (
          chromeWords.has(trimmed)
        ) {
          continue;
        }

        filtered.push(trimmed);
      }

      textParts.push(
        filtered.join("\n")
      );
    }

    const result =
      uniqueLines(
        clean(
          textParts.join("\n")
        )
      );

    return result.slice(
      0,
      50000
    );
  }

  // =========================
  // IMAGE DETECTION
  // =========================

  function findVisibleImages() {
    const images = [];

    document
      .querySelectorAll(
        "img, canvas"
      )
      .forEach(element => {

        if (!isVisible(element)) {
          return;
        }

        const rect =
          element.getBoundingClientRect();

        if (
          rect.width < 50 ||
          rect.height < 50
        ) {
          return;
        }

        /*
         * Ignore our extension panel.
         */

        if (
          element.closest(
            "#homework-ai-host"
          )
        ) {
          return;
        }

        images.push({
          width: rect.width,
          height: rect.height,
          area:
            rect.width *
            rect.height,
          alt:
            element.getAttribute(
              "alt"
            ) ||
            element.getAttribute(
              "aria-label"
            ) ||
            ""
        });
      });

    images.sort(
      (a, b) =>
        b.area - a.area
    );

    return images;
  }

  // =========================
  // SCAN CURRENT PAGE
  // =========================

  async function scanNormalPage() {

    if (isScanning) {
      return lastScanText;
    }

    isScanning = true;

    try {

      $("status").textContent =
        "Scanning Google " +
        (IS_DOCS ? "Docs" : "Slides") +
        "...";

      let text;

      if (IS_DOCS) {
        text = scanGoogleDocs();
      } else {
        text = scanGoogleSlides();
      }

      const images =
        findVisibleImages();

      /*
       * Tell the background worker to capture the visible
       * Google Docs/Slides page when the user is using Groq.
       *
       * This is what allows homework that is visually displayed
       * inside an image/canvas to be read.
       */

      let visionText = "";

      try {

        if (images.length > 0) {

          $("status").textContent =
            "Reading visible homework image...";

          const response =
            await send({
              type: "VISION_SCAN",
              pageType:
                IS_DOCS
                  ? "docs"
                  : "slides",
              documentId:
                getDocumentId(),
              presentationId:
                getPresentationId()
            });

          if (
            response?.text
          ) {
            visionText =
              clean(response.text);
          }
        }

      } catch (visionError) {

        console.warn(
          "Vision scan failed:",
          visionError
        );

        /*
         * Don't destroy the normal text scan just because image
         * scanning wasn't available.
         */

      }

      const combined =
        uniqueLines(
          clean(
            [
              text,
              visionText
            ]
              .filter(Boolean)
              .join("\n\n")
          )
        );

      lastScanText =
        combined.slice(
          0,
          50000
        );

      return lastScanText;

    } finally {

      isScanning = false;

    }
  }

  // =========================
  // WRITE TARGET DETECTION
  // =========================

  function isValidWriteTarget(target) {

    if (!target) {
      return false;
    }

    if (!document.contains(target)) {
      return false;
    }

    if (
      IS_DOCS &&
      isDocsTitleField(target)
    ) {
      return false;
    }

    if (
      IS_SLIDES &&
      looksLikeSlidesTitle(target)
    ) {
      return false;
    }

    return (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable ||
      target.getAttribute?.("role") === "textbox"
    );
  }

  function findDocsEditor() {

    /*
     * First use the remembered field if it is not the title.
     */

    if (
      isValidWriteTarget(
        lastPageField
      )
    ) {
      return lastPageField;
    }

    /*
     * Look for Google's actual text event target.
     *
     * Google Docs has used several versions of these internal
     * editor elements, so we check multiple patterns.
     */

    const selectors = [
      "textarea.docs-texteventtarget-iframe",
      "textarea.docs-texteventtarget",
      "textarea[aria-label*='document']",
      "textarea[aria-label*='Document']",
      "[contenteditable='true']",
      "[role='textbox']"
    ];

    for (
      const selector of selectors
    ) {

      const elements =
        document.querySelectorAll(
          selector
        );

      for (
        const element of elements
      ) {

        if (
          !isVisible(element) &&
          !(
            element.tagName ===
            "TEXTAREA"
          )
        ) {
          continue;
        }

        if (
          isDocsTitleField(
            element
          )
        ) {
          continue;
        }

        return element;
      }
    }

    return null;
  }

  function findSlidesEditor() {

    if (
      isValidWriteTarget(
        lastPageField
      )
    ) {
      return lastPageField;
    }

    const candidates =
      document.querySelectorAll(
        "[contenteditable='true'], [role='textbox'], textarea"
      );

    let best = null;
    let bestArea = 0;

    for (
      const element of candidates
    ) {

      if (
        !document.contains(
          element
        )
      ) {
        continue;
      }

      if (
        looksLikeSlidesTitle(
          element
        )
      ) {
        continue;
      }

      if (
        element.closest(
          "#homework-ai-host"
        )
      ) {
        continue;
      }

      const rect =
        element.getBoundingClientRect();

      const area =
        rect.width *
        rect.height;

      if (
        area > bestArea
      ) {
        bestArea = area;
        best = element;
      }
    }

    return best;
  }

  // =========================
  // TYPE LIKE NORMAL EDITOR
  // =========================

  async function insertTextIntoTarget(
    target,
    text
  ) {

    if (!target) {
      throw new Error(
        "No document text box was found."
      );
    }

    target.focus();

    await sleep(100);

    /*
     * Contenteditable.
     */

    if (
      target.isContentEditable
    ) {

      const selection =
        window.getSelection();

      const range =
        document.createRange();

      /*
       * Put the insertion point at the current cursor.
       * If no selection exists, append at the current position.
       */

      if (
        selection &&
        selection.rangeCount
      ) {
        /*
         * Keep the existing cursor/selection.
         */
      } else {
        range.selectNodeContents(
          target
        );

        range.collapse(false);

        selection.removeAllRanges();
        selection.addRange(
          range
        );
      }

      const inserted =
        document.execCommand(
          "insertText",
          false,
          text
        );

      if (!inserted) {

        const fragment =
          document.createTextNode(
            text
          );

        const currentSelection =
          window.getSelection();

        if (
          currentSelection &&
          currentSelection.rangeCount
        ) {

          const currentRange =
            currentSelection.getRangeAt(
              0
            );

          currentRange.deleteContents();

          currentRange.insertNode(
            fragment
          );

          currentRange.setStartAfter(
            fragment
          );

          currentRange.collapse(
            true
          );

          currentSelection.removeAllRanges();

          currentSelection.addRange(
            currentRange
          );

        } else {
          target.appendChild(
            fragment
          );
        }
      }

      target.dispatchEvent(
        new InputEvent(
          "input",
          {
            bubbles: true,
            inputType:
              "insertText",
            data: text
          }
        )
      );

      return true;
    }

    /*
     * Standard input / textarea.
     */

    const prototype =
      target.tagName === "TEXTAREA"
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;

    const valueSetter =
      Object.getOwnPropertyDescriptor(
        prototype,
        "value"
      )?.set;

    if (valueSetter) {
      valueSetter.call(
        target,
        text
      );
    } else {
      target.value = text;
    }

    target.dispatchEvent(
      new InputEvent(
        "input",
        {
          bubbles: true,
          inputType:
            "insertText",
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

    return true;
  }

  // =========================
  // WRITE INTO GOOGLE DOCS
  // =========================

  async function writeGoogleDocs(
    text
  ) {

    if (!text) {
      throw new Error(
        "There is no answer to write."
      );
    }

    /*
     * The biggest fix:
     *
     * NEVER use the document title.
     */

    let target =
      findDocsEditor();

    if (
      target &&
      isDocsTitleField(target)
    ) {
      target = null;
    }

    if (!target) {

      throw new Error(
        "Click inside the Google Docs document body first, then click Write into Page. Do not click the document title."
      );
    }

    await insertTextIntoTarget(
      target,
      text
    );

    return true;
  }

  // =========================
  // WRITE INTO GOOGLE SLIDES
  // =========================

  async function writeGoogleSlides(
    text
  ) {

    if (!text) {
      throw new Error(
        "There is no answer to write."
      );
    }

    let target =
      findSlidesEditor();

    if (
      target &&
      looksLikeSlidesTitle(
        target
      )
    ) {
      target = null;
    }

    if (!target) {

      throw new Error(
        "Click inside the slide text box where you want the answer, then click Write into Page."
      );
    }

    await insertTextIntoTarget(
      target,
      text
    );

    return true;
  }

  // =========================
  // WRITE ANSWER INTO PAGE
  // =========================

  async function writeNormalPage(
    text
  ) {

    if (!text) {
      throw new Error(
        "There is no answer to write."
      );
    }

    if (IS_DOCS) {

      await writeGoogleDocs(
        text
      );

      return;
    }

    if (IS_SLIDES) {

      await writeGoogleSlides(
        text
      );

      return;
    }

    throw new Error(
      "This extension only works on Google Docs and Google Slides."
    );
  }

  // =========================
  // CREATE EXTENSION PANEL
  // =========================

  const host =
    document.createElement(
      "div"
    );

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

  document.documentElement.appendChild(
    host
  );

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

  // =========================
  // HELPER
  // =========================

  const $ =
    id =>
      shadow.getElementById(id);

  // =========================
  // TABS
  // =========================

  shadow
    .querySelectorAll(".tab")
    .forEach(tab => {

      tab.addEventListener(
        "click",
        () => {

          shadow
            .querySelectorAll(".tab")
            .forEach(x =>
              x.classList.remove(
                "active"
              )
            );

          tab.classList.add(
            "active"
          );

          $("answerTab")
            .classList.add(
              "hidden"
            );

          $("askTab")
            .classList.add(
              "hidden"
            );

          $("keyTab")
            .classList.add(
              "hidden"
            );

          $(
            tab.dataset.tab +
            "Tab"
          ).classList.remove(
            "hidden"
          );
        }
      );
    });

  // =========================
  // CLOSE
  // =========================

  $("close").onclick = () => {

    host.remove();

    window.__HOMEWORK_AI_LOADED__ =
      false;

  };

  // =========================
  // SEND MESSAGE
  // =========================

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

  // =========================
  // ASK AI
  // =========================

  async function getAI(
    prompt
  ) {

    const response =
      await send({

        type:
          "AI_REQUEST",

        prompt,

        history:
          chatHistory

      });

    lastAnswer =
      response.text || "";

    return lastAnswer;
  }

  // =========================
  // SCAN BUTTON
  // =========================

  $("scanPage").onclick =
    async () => {

      if (isScanning) return;

      $("scanPage")
        .disabled = true;

      try {

        const text =
          await scanNormalPage();

        if (!text) {

          $("question")
            .value = "";

          $("status")
            .textContent =
              "No readable homework was found.";

          return;
        }

        $("question")
          .value = text;

        $("status")
          .textContent =
            `Scanned ${text.length.toLocaleString()} characters.`;

      } catch (error) {

        $("status")
          .textContent =
            "Scan error: " +
            error.message;

      } finally {

        $("scanPage")
          .disabled = false;

      }
    };

  // =========================
  // WRITE BUTTON
  // =========================

  $("writePage").onclick =
    async () => {

      if (isWriting) return;

      if (!lastAnswer) {

        $("status")
          .textContent =
            "Generate an answer first.";

        return;
      }

      isWriting = true;

      $("writePage")
        .disabled = true;

      try {

        /*
         * Google Docs:
         * writes to remembered document body,
         * never the title.
         *
         * Google Slides:
         * writes to remembered slide text box,
         * never the presentation title.
         */

        await writeNormalPage(
          lastAnswer
        );

        $("status")
          .textContent =
            IS_DOCS
              ? "Answer written into the Google Docs document."
              : "Answer written into the Google Slides text box.";

      } catch (error) {

        $("status")
          .textContent =
            "Write error: " +
            error.message;

      } finally {

        isWriting = false;

        $("writePage")
          .disabled = false;

      }
    };

  // =========================
  // ANSWER BUTTON
  // =========================

  $("answer").onclick =
    async () => {

      const prompt =
        $("question")
          .value
          .trim();

      if (!prompt) {

        $("status")
          .textContent =
            "Scan the page or type a question first.";

        return;
      }

      $("status")
        .textContent =
          "Thinking...";

      $("answer")
        .disabled = true;

      try {

        const text =
          await getAI(
            prompt
          );

        $("answerBox")
          .textContent =
            text;

        chatHistory.push({
          role:
            "user",
          content:
            prompt
        });

        chatHistory.push({
          role:
            "assistant",
          content:
            text
        });

        chatHistory =
          chatHistory.slice(
            -20
          );

        $("status")
          .textContent =
            "Answer ready.";

      } catch (error) {

        $("status")
          .textContent =
            "Error: " +
            error.message;

      } finally {

        $("answer")
          .disabled = false;

      }
    };

  // =========================
  // COPY
  // =========================

  $("copy").onclick =
    async () => {

      if (!lastAnswer) {

        $("status")
          .textContent =
            "There is no answer to copy.";

        return;
      }

      try {

        await navigator
          .clipboard
          .writeText(
            lastAnswer
          );

        $("status")
          .textContent =
            "Answer copied.";

      } catch {

        $("status")
          .textContent =
            "Could not copy the answer.";

      }
    };

  // =========================
  // ASK TAB
  // =========================

  $("askButton").onclick =
    async () => {

      const prompt =
        $("askInput")
          .value
          .trim();

      if (!prompt) {
        return;
      }

      $("chatBox")
        .textContent =
          "Thinking...";

      try {

        const text =
          await getAI(
            prompt
          );

        $("chatBox")
          .textContent =
            text;

        chatHistory.push({
          role:
            "user",
          content:
            prompt
        });

        chatHistory.push({
          role:
            "assistant",
          content:
            text
        });

        chatHistory =
          chatHistory.slice(
            -20
          );

        $("askInput")
          .value = "";

      } catch (error) {

        $("chatBox")
          .textContent =
            "Error: " +
            error.message;

      }
    };

  // =========================
  // LOAD SETTINGS
  // =========================

  chrome.storage.local.get(
    {
      provider:
        "openai",

      apiKey:
        "",

      model:
        ""
    },
    settings => {

      $("provider")
        .value =
          settings.provider;

      $("apiKey")
        .value =
          settings.apiKey;

      $("model")
        .value =
          settings.model;

    }
  );

  // =========================
  // SAVE SETTINGS
  // =========================

  $("save").onclick =
    () => {

      chrome.storage.local.set(
        {

          provider:
            $("provider")
              .value,

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

  // =========================
  // POPUP TOGGLE
  // =========================

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
