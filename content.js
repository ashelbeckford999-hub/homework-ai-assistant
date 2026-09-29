(() => {
  "use strict";

  /*
   * HOMEWORK AI ASSISTANT
   * Google Docs + Google Slides only
   *
   * IMPORTANT:
   * - Google Docs title is NOT used for writing.
   * - Google Slides title placeholders are avoided when possible.
   * - Answers are inserted as normal document/slide text.
   * - Scanning collects normal text and image information.
   * - OCR can be connected through the OCR function below.
   */

  const HOST = location.hostname;
  const PATH = location.pathname;

  const IS_GOOGLE_DOCS =
    HOST === "docs.google.com" &&
    PATH.startsWith("/document/");

  const IS_GOOGLE_SLIDES =
    HOST === "docs.google.com" &&
    PATH.startsWith("/presentation/");

  const IS_SUPPORTED =
    IS_GOOGLE_DOCS || IS_GOOGLE_SLIDES;

  if (!IS_SUPPORTED) {
    return;
  }

  // Prevent duplicate injection.
  if (window.__HOMEWORK_AI_ASSISTANT__) {
    return;
  }

  window.__HOMEWORK_AI_ASSISTANT__ = true;

  /* ============================================================
     STATE
     ============================================================ */

  const state = {
    app: IS_GOOGLE_DOCS ? "docs" : "slides",
    scanning: false,
    writing: false,
    panelOpen: false,
    lastScan: "",
    lastAnswer: "",
    lastImages: [],
    selectedSlideId: null,
    presentationId: null
  };

  /* ============================================================
     BASIC HELPERS
     ============================================================ */

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function cleanText(text) {
    return String(text || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{4,}/g, "\n\n")
      .trim();
  }

  function uniqueStrings(items) {
    const seen = new Set();
    const result = [];

    for (const item of items) {
      const value = cleanText(item);

      if (!value) {
        continue;
      }

      const key = value.toLowerCase();

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      result.push(value);
    }

    return result;
  }

  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, response => {
        if (chrome.runtime.lastError) {
          reject(
            new Error(
              chrome.runtime.lastError.message ||
              "Extension communication failed."
            )
          );
          return;
        }

        if (!response) {
          reject(new Error("No response from background worker."));
          return;
        }

        if (response.error) {
          reject(new Error(response.error));
          return;
        }

        resolve(response);
      });
    });
  }

  function notify(message, type = "info") {
    let box = document.getElementById(
      "homework-ai-notification"
    );

    if (!box) {
      box = document.createElement("div");
      box.id = "homework-ai-notification";

      Object.assign(box.style, {
        position: "fixed",
        left: "50%",
        bottom: "24px",
        transform: "translateX(-50%)",
        zIndex: "2147483647",
        padding: "10px 16px",
        borderRadius: "10px",
        fontFamily: "Arial, sans-serif",
        fontSize: "13px",
        color: "#fff",
        background: "#1f2937",
        boxShadow: "0 8px 30px rgba(0,0,0,.25)",
        maxWidth: "420px",
        textAlign: "center"
      });

      document.body.appendChild(box);
    }

    box.textContent = message;

    if (type === "error") {
      box.style.background = "#b91c1c";
    } else if (type === "success") {
      box.style.background = "#15803d";
    } else {
      box.style.background = "#1f2937";
    }

    clearTimeout(box.__timer);

    box.__timer = setTimeout(() => {
      box.remove();
    }, 3500);
  }

  /* ============================================================
     PRESENTATION / DOCUMENT IDS
     ============================================================ */

  function getPresentationId() {
    const match = location.pathname.match(
      /\/presentation\/d\/([^/]+)/
    );

    return match ? match[1] : null;
  }

  function getDocumentId() {
    const match = location.pathname.match(
      /\/document\/d\/([^/]+)/
    );

    return match ? match[1] : null;
  }

  /* ============================================================
     UI
     ============================================================ */

  function createPanel() {
    if (document.getElementById("homework-ai-panel")) {
      return;
    }

    const panel = document.createElement("div");

    panel.id = "homework-ai-panel";

    Object.assign(panel.style, {
      position: "fixed",
      top: "72px",
      right: "18px",
      width: "360px",
      maxHeight: "calc(100vh - 100px)",
      zIndex: "2147483646",
      background: "#111827",
      color: "#fff",
      borderRadius: "14px",
      boxShadow: "0 18px 60px rgba(0,0,0,.35)",
      fontFamily: "Arial, sans-serif",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column"
    });

    panel.innerHTML = `
      <div id="homework-ai-header"
        style="
          padding:14px 16px;
          display:flex;
          align-items:center;
          justify-content:space-between;
          background:#0f172a;
          border-bottom:1px solid #374151;
        ">

        <div>
          <div style="font-size:16px;font-weight:700;">
            Homework AI
          </div>

          <div id="homework-ai-mode"
            style="
              margin-top:3px;
              font-size:11px;
              color:#9ca3af;
            ">
            ${IS_GOOGLE_DOCS ? "Google Docs" : "Google Slides"}
          </div>
        </div>

        <button id="homework-ai-close"
          style="
            border:0;
            background:transparent;
            color:#9ca3af;
            font-size:20px;
            cursor:pointer;
          ">
          ×
        </button>
      </div>

      <div style="padding:14px;overflow:auto;">

        <div style="display:flex;gap:7px;margin-bottom:10px;">

          <button id="homework-ai-scan"
            style="
              flex:1;
              padding:10px;
              border:0;
              border-radius:8px;
              background:#2563eb;
              color:white;
              cursor:pointer;
              font-weight:600;
            ">
            Scan
          </button>

          <button id="homework-ai-answer"
            style="
              flex:1;
              padding:10px;
              border:0;
              border-radius:8px;
              background:#16a34a;
              color:white;
              cursor:pointer;
              font-weight:600;
            ">
            Answer
          </button>

        </div>

        <button id="homework-ai-ask"
          style="
            width:100%;
            padding:9px;
            border:0;
            border-radius:8px;
            background:#7c3aed;
            color:white;
            cursor:pointer;
            margin-bottom:10px;
            font-weight:600;
          ">
          Ask Homework
        </button>

        <textarea
          id="homework-ai-question"
          placeholder="Ask something about the homework..."
          style="
            width:100%;
            min-height:70px;
            box-sizing:border-box;
            resize:vertical;
            padding:10px;
            border:1px solid #374151;
            border-radius:8px;
            background:#1f2937;
            color:#fff;
            outline:none;
            margin-bottom:10px;
          "
        ></textarea>

        <div
          style="
            font-size:12px;
            color:#9ca3af;
            margin-bottom:6px;
          ">
          Scan result
        </div>

        <textarea
          id="homework-ai-scan-result"
          readonly
          style="
            width:100%;
            min-height:100px;
            max-height:180px;
            box-sizing:border-box;
            resize:vertical;
            padding:10px;
            border:1px solid #374151;
            border-radius:8px;
            background:#0b1220;
            color:#e5e7eb;
            outline:none;
            margin-bottom:10px;
          "
        ></textarea>

        <div
          style="
            font-size:12px;
            color:#9ca3af;
            margin-bottom:6px;
          ">
          Answer
        </div>

        <textarea
          id="homework-ai-answer-result"
          style="
            width:100%;
            min-height:140px;
            box-sizing:border-box;
            resize:vertical;
            padding:10px;
            border:1px solid #374151;
            border-radius:8px;
            background:#0b1220;
            color:#e5e7eb;
            outline:none;
          "
        ></textarea>

        <button id="homework-ai-write"
          style="
            width:100%;
            margin-top:10px;
            padding:11px;
            border:0;
            border-radius:8px;
            background:#f59e0b;
            color:#111827;
            cursor:pointer;
            font-weight:700;
          ">
          Write Into ${IS_GOOGLE_DOCS ? "Document" : "Slide"}
        </button>

        <div
          id="homework-ai-status"
          style="
            margin-top:10px;
            font-size:11px;
            color:#9ca3af;
            line-height:1.4;
          ">
          Ready.
        </div>

      </div>
    `;

    document.body.appendChild(panel);

    document
      .getElementById("homework-ai-close")
      .addEventListener("click", closePanel);

    document
      .getElementById("homework-ai-scan")
      .addEventListener("click", scanCurrentPage);

    document
      .getElementById("homework-ai-answer")
      .addEventListener("click", answerHomework);

    document
      .getElementById("homework-ai-ask")
      .addEventListener("click", askHomework);

    document
      .getElementById("homework-ai-write")
      .addEventListener("click", writeAnswer);

    state.panelOpen = true;
  }

  function closePanel() {
    const panel = document.getElementById(
      "homework-ai-panel"
    );

    if (panel) {
      panel.remove();
    }

    state.panelOpen = false;
  }

  function setStatus(message) {
    const element = document.getElementById(
      "homework-ai-status"
    );

    if (element) {
      element.textContent = message;
    }
  }

  function setScanResult(text) {
    const element = document.getElementById(
      "homework-ai-scan-result"
    );

    if (element) {
      element.value = text || "";
    }
  }

  function setAnswer(text) {
    const element = document.getElementById(
      "homework-ai-answer-result"
    );

    if (element) {
      element.value = text || "";
    }
  }

  /* ============================================================
     GOOGLE DOCS SCANNING
     ============================================================ */

  function scanGoogleDocsText() {
    const chunks = [];

    /*
     * Google Docs does not expose the entire editor as a normal
     * textarea. It renders much of the document through its editor
     * structure.
     *
     * We intentionally avoid:
     * - title inputs
     * - search boxes
     * - toolbar buttons
     * - menus
     */

    const selectors = [
      '[role="textbox"]',
      '[contenteditable="true"]',
      '[aria-label*="Document content"]',
      '[aria-label*="document content"]'
    ];

    for (const selector of selectors) {
      const nodes = document.querySelectorAll(selector);

      for (const node of nodes) {
        if (!isDocsTitleElement(node)) {
          const text = cleanText(
            node.innerText ||
            node.textContent ||
            ""
          );

          if (text) {
            chunks.push(text);
          }
        }
      }
    }

    /*
     * Google Docs accessibility tree can expose document text
     * through many spans/divs. Collect visible text while excluding
     * obvious application chrome.
     */

    const candidates = document.querySelectorAll(
      '[data-tooltip], [aria-label]'
    );

    for (const node of candidates) {
      if (!isVisible(node)) {
        continue;
      }

      if (isDocsChrome(node)) {
        continue;
      }

      if (isDocsTitleElement(node)) {
        continue;
      }

      const text = cleanText(
        node.innerText ||
        node.textContent ||
        ""
      );

      if (text && text.length > 2) {
        chunks.push(text);
      }
    }

    return uniqueStrings(chunks);
  }

  function isDocsTitleElement(element) {
    if (!element) {
      return false;
    }

    const aria = (
      element.getAttribute("aria-label") || ""
    ).toLowerCase();

    const name = (
      element.getAttribute("name") || ""
    ).toLowerCase();

    const cls = (
      element.className || ""
    ).toString().toLowerCase();

    const id = (
      element.id || ""
    ).toLowerCase();

    const combined =
      `${aria} ${name} ${cls} ${id}`;

    return (
      combined.includes("document title") ||
      combined.includes("untitled document") ||
      combined.includes("title input") ||
      combined.includes("title")
    );
  }

  function isDocsChrome(element) {
    if (!element) {
      return true;
    }

    const role = (
      element.getAttribute("role") || ""
    ).toLowerCase();

    if (
      role === "button" ||
      role === "menu" ||
      role === "menuitem" ||
      role === "toolbar"
    ) {
      return true;
    }

    const text = cleanText(
      element.innerText ||
      element.textContent ||
      ""
    );

    /*
     * Ignore very small UI elements.
     */

    if (
      text &&
      text.length < 2 &&
      element.children.length === 0
    ) {
      return true;
    }

    return false;
  }

  /* ============================================================
     GOOGLE SLIDES SCANNING
     ============================================================ */

  function scanGoogleSlidesText() {
    const chunks = [];

    const selectors = [
      '[role="textbox"]',
      '[contenteditable="true"]',
      '[aria-label]'
    ];

    for (const selector of selectors) {
      const nodes = document.querySelectorAll(selector);

      for (const node of nodes) {
        if (!isVisible(node)) {
          continue;
        }

        const text = cleanText(
          node.innerText ||
          node.textContent ||
          node.getAttribute("aria-label") ||
          ""
        );

        if (!text) {
          continue;
        }

        if (
          text.length > 1 &&
          !looksLikeSlidesChrome(text)
        ) {
          chunks.push(text);
        }
      }
    }

    /*
     * Slides' accessibility tree frequently contains useful
     * presentation text even when the visual canvas itself is
     * rendered differently.
     */

    const all = document.querySelectorAll(
      "[aria-label]"
    );

    for (const node of all) {
      if (!isVisible(node)) {
        continue;
      }

      const label = cleanText(
        node.getAttribute("aria-label") || ""
      );

      if (
        label &&
        label.length > 2 &&
        !looksLikeSlidesChrome(label)
      ) {
        chunks.push(label);
      }
    }

    return uniqueStrings(chunks);
  }

  function looksLikeSlidesChrome(text) {
    const value = text.toLowerCase();

    const chromeWords = [
      "file",
      "edit",
      "view",
      "insert",
      "slide",
      "format",
      "arrange",
      "tools",
      "extensions",
      "help",
      "present",
      "share",
      "comments",
      "zoom",
      "undo",
      "redo"
    ];

    if (value.length < 3) {
      return true;
    }

    if (
      value.length < 25 &&
      chromeWords.includes(value)
    ) {
      return true;
    }

    return false;
  }

  /* ============================================================
     IMAGE DISCOVERY
     ============================================================ */

  function findPageImages() {
    const images = [];

    const elements = document.querySelectorAll(
      "img, image, canvas"
    );

    for (const element of elements) {
      if (!isVisible(element)) {
        continue;
      }

      const rect = element.getBoundingClientRect();

      if (
        rect.width < 40 ||
        rect.height < 40
      ) {
        continue;
      }

      images.push({
        element,
        width: rect.width,
        height: rect.height,
        area: rect.width * rect.height,
        alt:
          element.getAttribute("alt") ||
          element.getAttribute("aria-label") ||
          ""
      });
    }

    images.sort((a, b) => b.area - a.area);

    return images;
  }

  /* ============================================================
     OCR
     ============================================================ */

  async function ocrImageElement(imageInfo) {
    /*
     * This function intentionally does NOT pretend Groq can read
     * images. Groq receives text.
     *
     * If Tesseract is installed in your extension, this function
     * will use it.
     *
     * If Tesseract is not installed, the image is still detected
     * and reported so the scanner doesn't silently pretend that
     * there was no image.
     */

    const element = imageInfo.element;

    /*
     * If the image already has useful alt/accessibility text,
     * return that first.
     */

    const alt = cleanText(imageInfo.alt);

    if (alt) {
      return alt;
    }

    /*
     * Look for a bundled OCR implementation.
     */

    if (
      window.Tesseract &&
      typeof window.Tesseract.recognize === "function"
    ) {
      try {
        let source = element;

        if (element.tagName.toLowerCase() === "canvas") {
          source = element;
        }

        const result =
          await window.Tesseract.recognize(
            source,
            "eng"
          );

        return cleanText(
          result?.data?.text || ""
        );
      } catch (error) {
        console.error(
          "Homework AI OCR error:",
          error
        );
      }
    }

    return "";
  }

  async function scanImages() {
    const images = findPageImages();

    state.lastImages = images;

    if (!images.length) {
      return [];
    }

    const results = [];

    /*
     * Do not OCR dozens of UI images. Limit this to the largest
     * visible images, which are much more likely to contain
     * homework screenshots.
     */

    const targets = images.slice(0, 12);

    for (let index = 0; index < targets.length; index++) {
      setStatus(
        `Reading image ${index + 1} of ${targets.length}...`
      );

      const text =
        await ocrImageElement(targets[index]);

      if (text) {
        results.push(
          `IMAGE ${index + 1}:\n${text}`
        );
      }
    }

    return results;
  }

  /* ============================================================
     COMPLETE SCAN
     ============================================================ */

  async function scanCurrentPage() {
    if (state.scanning) {
      return;
    }

    state.scanning = true;

    try {
      setStatus("Scanning document...");

      let textParts = [];

      if (IS_GOOGLE_DOCS) {
        textParts = scanGoogleDocsText();
      } else {
        textParts = scanGoogleSlidesText();
      }

      const imageText =
        await scanImages();

      const combined = uniqueStrings([
        ...textParts,
        ...imageText
      ]);

      const result = combined.join("\n\n");

      state.lastScan = result;

      setScanResult(result);

      if (!result) {
        notify(
          "I couldn't find readable homework text on this page.",
          "error"
        );
        setStatus(
          "Nothing readable was found."
        );
      } else {
        notify(
          "Scan complete.",
          "success"
        );

        setStatus(
          `Found ${result.length.toLocaleString()} characters.`
        );
      }

      return result;

    } catch (error) {
      console.error(error);

      notify(
        error.message ||
        "Scan failed.",
        "error"
      );

      setStatus(
        error.message ||
        "Scan failed."
      );

      throw error;

    } finally {
      state.scanning = false;
    }
  }

  /* ============================================================
     AI REQUEST
     ============================================================ */

  async function requestAI(prompt, history = []) {
    const response =
      await sendMessage({
        type: "AI_REQUEST",
        prompt,
        history
      });

    return cleanText(
      response.text ||
      response.answer ||
      ""
    );
  }

  async function answerHomework() {
    try {
      let scan = state.lastScan;

      if (!scan) {
        scan = await scanCurrentPage();
      }

      if (!scan) {
        return;
      }

      setStatus(
        "Sending homework to your selected AI..."
      );

      const prompt = `
You are helping a student with homework.

Use the homework content below.

Give the answer directly and clearly.
Show useful working when the question requires it.
Do not mention that you are an AI.
Do not add unnecessary introductions.
Do not invent information that is not supported by the question.

HOMEWORK:
${scan}
`;

      const answer =
        await requestAI(prompt);

      state.lastAnswer = answer;

      setAnswer(answer);

      setStatus(
        "Answer generated."
      );

      notify(
        "Answer ready.",
        "success"
      );

    } catch (error) {
      console.error(error);

      notify(
        error.message ||
        "Could not generate answer.",
        "error"
      );

      setStatus(
        error.message ||
        "Could not generate answer."
      );
    }
  }

  async function askHomework() {
    try {
      const question =
        document
          .getElementById("homework-ai-question")
          ?.value
          .trim();

      if (!question) {
        notify(
          "Type a question first.",
          "error"
        );
        return;
      }

      let scan = state.lastScan;

      if (!scan) {
        scan = await scanCurrentPage();
      }

      setStatus(
        "Thinking..."
      );

      const prompt = `
Answer the student's question using the homework/document
context below.

STUDENT QUESTION:
${question}

HOMEWORK CONTEXT:
${scan}

Give a clear, useful answer.
`;

      const answer =
        await requestAI(prompt);

      state.lastAnswer = answer;

      setAnswer(answer);

      setStatus(
        "Answer ready."
      );

    } catch (error) {
      console.error(error);

      notify(
        error.message ||
        "Ask failed.",
        "error"
      );

      setStatus(
        error.message ||
        "Ask failed."
      );
    }
  }

  /* ============================================================
     GOOGLE DOCS WRITING
     ============================================================ */

  function findDocsEditor() {
    /*
     * The title must NEVER be returned by this function.
     */

    const candidates = [];

    const selectors = [
      '[contenteditable="true"]',
      '[role="textbox"]',
      'textarea'
    ];

    for (const selector of selectors) {
      const nodes =
        document.querySelectorAll(selector);

      for (const node of nodes) {
        if (!isVisible(node)) {
          continue;
        }

        if (isDocsTitleElement(node)) {
          continue;
        }

        const aria = (
          node.getAttribute("aria-label") || ""
        ).toLowerCase();

        const cls = (
          node.className || ""
        ).toString().toLowerCase();

        const id = (
          node.id || ""
        ).toLowerCase();

        const description =
          `${aria} ${cls} ${id}`;

        /*
         * Avoid search boxes, title boxes and toolbar inputs.
         */

        if (
          description.includes("search") ||
          description.includes("title") ||
          description.includes("toolbar")
        ) {
          continue;
        }

        candidates.push(node);
      }
    }

    /*
     * Prefer an element that is currently focused.
     */

    const active = document.activeElement;

    if (
      active &&
      candidates.includes(active)
    ) {
      return active;
    }

    /*
     * Prefer the largest visible candidate.
     */

    candidates.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();

      return (
        br.width * br.height -
        ar.width * ar.height
      );
    });

    return candidates[0] || null;
  }

  async function focusDocsBody() {
    const editor = findDocsEditor();

    if (editor) {
      editor.focus();
      await sleep(100);
      return editor;
    }

    /*
     * If Google Docs has not exposed the editor yet, clicking
     * somewhere in the document canvas is safer than clicking
     * the title.
     */

    const candidates = document.querySelectorAll(
      "[role=main], .kix-appview-editor, .kix-appview-editor-container"
    );

    for (const candidate of candidates) {
      if (!isVisible(candidate)) {
        continue;
      }

      const rect =
        candidate.getBoundingClientRect();

      if (
        rect.width > 300 &&
        rect.height > 150
      ) {
        /*
         * Click away from the top/title area.
         */

        const x =
          rect.left +
          Math.min(300, rect.width / 2);

        const y =
          rect.top +
          Math.min(250, rect.height / 2);

        candidate.dispatchEvent(
          new MouseEvent(
            "mousedown",
            {
              bubbles: true,
              clientX: x,
              clientY: y
            }
          )
        );

        candidate.dispatchEvent(
          new MouseEvent(
            "mouseup",
            {
              bubbles: true,
              clientX: x,
              clientY: y
            }
          )
        );

        candidate.click();

        await sleep(200);

        return findDocsEditor();
      }
    }

    return null;
  }

  async function writeToGoogleDocs(text) {
    const answer = cleanText(text);

    if (!answer) {
      throw new Error(
        "There is no answer to write."
      );
    }

    setStatus(
      "Finding the document body..."
    );

    /*
     * First try to preserve the user's existing cursor position.
     */

    let editor = findDocsEditor();

    /*
     * Never use the title.
     */

    if (editor && isDocsTitleElement(editor)) {
      editor = null;
    }

    if (!editor) {
      editor = await focusDocsBody();
    }

    /*
     * We intentionally do not target the document title.
     */

    if (
      editor &&
      !isDocsTitleElement(editor)
    ) {
      editor.focus();

      await sleep(100);

      /*
       * Use the browser editing command where available.
       * This behaves much more like normal typing into the
       * editor than assigning a value to a hidden textarea.
       */

      const inserted =
        document.execCommand(
          "insertText",
          false,
          answer
        );

      if (inserted) {
        notify(
          "Answer written into the document.",
          "success"
        );

        setStatus(
          "Answer inserted at the document cursor."
        );

        return true;
      }
    }

    /*
     * Keyboard fallback.
     *
     * We use the actual active document editor if possible.
     */

    const active =
      document.activeElement;

    if (
      active &&
      !isDocsTitleElement(active)
    ) {
      active.focus();

      await sleep(100);

      for (const character of answer) {
        document.execCommand(
          "insertText",
          false,
          character
        );

        /*
         * Small delay makes the operation resemble normal
         * editor input and gives Google's editor time to process
         * its internal state.
         */

        await sleep(1);
      }

      notify(
        "Answer written into the document.",
        "success"
      );

      setStatus(
        "Answer typed into the document."
      );

      return true;
    }

    throw new Error(
      "Google Docs' document body could not be selected. Click inside the document body once, then click Write."
    );
  }

  /* ============================================================
     GOOGLE SLIDES HELPERS
     ============================================================ */

  function findVisibleSlideTextBoxes() {
    const boxes = [];

    const selectors = [
      '[role="textbox"]',
      '[contenteditable="true"]',
      '[aria-label]'
    ];

    for (const selector of selectors) {
      const nodes =
        document.querySelectorAll(selector);

      for (const node of nodes) {
        if (!isVisible(node)) {
          continue;
        }

        if (
          node.closest(
            "#homework-ai-panel"
          )
        ) {
          continue;
        }

        const rect =
          node.getBoundingClientRect();

        if (
          rect.width < 20 ||
          rect.height < 10
        ) {
          continue;
        }

        const label =
          cleanText(
            node.getAttribute("aria-label") ||
            ""
          );

        const text =
          cleanText(
            node.innerText ||
            node.textContent ||
            ""
          );

        const combined =
          `${label} ${text}`.toLowerCase();

        /*
         * Do not use the presentation title,
         * browser controls, or Slides toolbar.
         */

        if (
          combined.includes("present") ||
          combined.includes("share") ||
          combined.includes("toolbar") ||
          combined.includes("menu")
        ) {
          continue;
        }

        boxes.push({
          element: node,
          rect,
          label,
          text
        });
      }
    }

    return boxes;
  }

  function isLikelyTitleBox(box) {
    const value =
      `${box.label} ${box.text}`.toLowerCase();

    return (
      value.includes("title") ||
      value.includes("subtitle")
    );
  }

  function chooseSlidesBodyBox() {
    const boxes =
      findVisibleSlideTextBoxes();

    /*
     * Prefer boxes explicitly indicating body/content.
     */

    const bodyBoxes =
      boxes.filter(box => {
        const value =
          `${box.label} ${box.text}`.toLowerCase();

        return (
          value.includes("body") ||
          value.includes("content") ||
          value.includes("text")
        );
      });

    const nonTitle =
      bodyBoxes.filter(
        box => !isLikelyTitleBox(box)
      );

    if (nonTitle.length) {
      return nonTitle
        .sort(
          (a, b) =>
            b.rect.width * b.rect.height -
            a.rect.width * a.rect.height
        )[0];
    }

    /*
     * Otherwise select the largest non-title text area.
     */

    const fallback =
      boxes.filter(
        box => !isLikelyTitleBox(box)
      );

    fallback.sort(
      (a, b) =>
        b.rect.width * b.rect.height -
        a.rect.width * a.rect.height
    );

    return fallback[0] || null;
  }

  /* ============================================================
     GOOGLE SLIDES WRITE
     ============================================================ */

  async function writeToGoogleSlides(text) {
    const answer = cleanText(text);

    if (!answer) {
      throw new Error(
        "There is no answer to write."
      );
    }

    /*
     * First attempt: use the currently selected/focused
     * text box in Slides.
     */

    const active =
      document.activeElement;

    if (
      active &&
      active !== document.body &&
      active.isContentEditable
    ) {
      const boxes =
        findVisibleSlideTextBoxes();

      const activeBox =
        boxes.find(
          box => box.element === active
        );

      if (
        activeBox &&
        !isLikelyTitleBox(activeBox)
      ) {
        active.focus();

        const inserted =
          document.execCommand(
            "insertText",
            false,
            answer
          );

        if (inserted) {
          notify(
            "Answer written into the slide.",
            "success"
          );

          setStatus(
            "Answer inserted into the selected slide text box."
          );

          return true;
        }
      }
    }

    /*
     * Second attempt: find a body/content text box.
     */

    const target =
      chooseSlidesBodyBox();

    if (target) {
      target.element.focus();

      await sleep(100);

      const inserted =
        document.execCommand(
          "insertText",
          false,
          answer
        );

      if (inserted) {
        notify(
          "Answer written into the slide.",
          "success"
        );

        setStatus(
          "Answer inserted into the slide body."
        );

        return true;
      }
    }

    /*
     * At this point the Slides canvas may be using its internal
     * editor rather than a normal DOM contenteditable.
     *
     * The background worker can use the Slides API if OAuth and
     * the Slides API portion of the extension are configured.
     */

    const presentationId =
      getPresentationId();

    if (presentationId) {
      const result =
        await sendMessage({
          type: "SLIDES_WRITE",
          presentationId,
          slideId:
            state.selectedSlideId || null,
          text: answer
        });

      if (result?.success) {
        notify(
          "Answer added to the slide.",
          "success"
        );

        setStatus(
          "Answer added to the slide."
        );

        return true;
      }
    }

    throw new Error(
      "I couldn't find a slide body text box. Click the text box where you want the answer, then click Write."
    );
  }

  /* ============================================================
     WRITE DISPATCHER
     ============================================================ */

  async function writeAnswer() {
    if (state.writing) {
      return;
    }

    const textarea =
      document.getElementById(
        "homework-ai-answer-result"
      );

    const answer =
      cleanText(
        textarea?.value ||
        state.lastAnswer ||
        ""
      );

    if (!answer) {
      notify(
        "Generate an answer first.",
        "error"
      );
      return;
    }

    state.writing = true;

    try {
      setStatus(
        "Writing answer..."
      );

      if (IS_GOOGLE_DOCS) {
        await writeToGoogleDocs(answer);
      } else {
        await writeToGoogleSlides(answer);
      }

    } catch (error) {
      console.error(
        "Homework AI write error:",
        error
      );

      notify(
        error.message ||
        "Could not write the answer.",
        "error"
      );

      setStatus(
        error.message ||
        "Could not write the answer."
      );

    } finally {
      state.writing = false;
    }
  }

  /* ============================================================
     VISIBILITY
     ============================================================ */

  function isVisible(element) {
    if (!element) {
      return false;
    }

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

  /* ============================================================
     MESSAGE HANDLER
     ============================================================ */

  chrome.runtime.onMessage.addListener(
    (message, sender, sendResponse) => {
      if (!message) {
        return;
      }

      if (
        message.type ===
        "TOGGLE_HOMEWORK_AI"
      ) {
        if (
          document.getElementById(
            "homework-ai-panel"
          )
        ) {
          closePanel();
        } else {
          createPanel();
        }

        sendResponse({
          success: true
        });

        return true;
      }

      if (
        message.type ===
        "OPEN_HOMEWORK_AI"
      ) {
        createPanel();

        sendResponse({
          success: true
        });

        return true;
      }
    }
  );

  /* ============================================================
     STARTUP
     ============================================================ */

  function initialize() {
    /*
     * Google Docs/Slides can continue loading their editor after
     * document_idle, so don't immediately attempt to manipulate
     * the editor.
     */

    setTimeout(() => {
      createPanel();

      console.log(
        `Homework AI Assistant loaded for Google ${
          IS_GOOGLE_DOCS
            ? "Docs"
            : "Slides"
        }.`
      );
    }, 1000);
  }

  initialize();

})();
