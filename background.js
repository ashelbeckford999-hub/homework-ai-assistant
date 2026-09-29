async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      {
        provider: "openai",
        apiKey: "",
        model: ""
      },
      resolve
    );
  });
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];

  return history
    .filter(
      (item) =>
        item &&
        (item.role === "user" ||
          item.role === "assistant") &&
        typeof item.content === "string"
    )
    .slice(-20);
}


/* =========================
   OPENAI
========================= */

async function callOpenAI(
  prompt,
  history
) {
  const settings =
    await getSettings();

  const model =
    settings.model ||
    "gpt-5.6";

  const input = [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text:
            "You are a helpful homework assistant. Explain answers clearly, accurately, and at an appropriate student level."
        }
      ]
    },

    ...normalizeHistory(
      history
    ).map(
      (message) => ({
        role:
          message.role,

        content: [
          {
            type:
              "input_text",

            text:
              message.content
          }
        ]
      })
    ),

    {
      role: "user",
      content: [
        {
          type:
            "input_text",

          text:
            prompt
        }
      ]
    }
  ];

  const response =
    await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${settings.apiKey}`
        },

        body:
          JSON.stringify({
            model,
            input
          })
      }
    );

  const data =
    await response.json();

  if (!response.ok) {

    throw new Error(
      data?.error?.message ||
        `OpenAI request failed (${response.status})`
    );
  }

  if (
    typeof data.output_text ===
    "string"
  ) {
    return data.output_text;
  }

  const text =
    (data.output || [])
      .flatMap(
        item =>
          item.content || []
      )
      .map(
        item =>
          item.text || ""
      )
      .join("")
      .trim();

  return (
    text ||
    "I couldn't generate an answer."
  );
}


/* =========================
   GEMINI
========================= */

async function callGemini(
  prompt,
  history
) {
  const settings =
    await getSettings();

  const model =
    settings.model ||
    "gemini-3.8-flash";

  const historyText =
    normalizeHistory(
      history
    )
      .map(
        message =>
          `${
            message.role ===
            "assistant"
              ? "Assistant"
              : "Student"
          }: ${message.content}`
      )
      .join("\n\n");

  const fullPrompt =
    historyText +
    (
      historyText
        ? "\n\n"
        : ""
    ) +
    `Student: ${prompt}`;

  const response =
    await fetch(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          "x-goog-api-key":
            settings.apiKey
        },

        body:
          JSON.stringify({
            model,
            input:
              fullPrompt,

            system_instruction:
              "You are a helpful homework assistant. Explain answers clearly, accurately, and at an appropriate student level."
          })
      }
    );

  const data =
    await response.json();

  if (!response.ok) {

    throw new Error(
      data?.error?.message ||
        `Gemini request failed (${response.status})`
    );
  }

  if (
    typeof data.output_text ===
    "string"
  ) {
    return data.output_text;
  }

  if (
    Array.isArray(
      data.outputs
    )
  ) {

    const text =
      data.outputs
        .map(
          item =>
            item?.text || ""
        )
        .join("")
        .trim();

    if (text) return text;
  }

  return (
    "I couldn't generate an answer."
  );
}


/* =========================
   GROQ TEXT
========================= */

async function callGroq(
  prompt,
  history
) {
  const settings =
    await getSettings();

  const model =
    settings.model ||
    "openai/gpt-oss-120b";

  const messages = [
    {
      role:
        "system",

      content:
        "You are a helpful homework assistant. Explain answers clearly, accurately, and at an appropriate student level."
    },

    ...normalizeHistory(
      history
    ),

    {
      role:
        "user",

      content:
        prompt
    }
  ];

  const response =
    await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${settings.apiKey}`
        },

        body:
          JSON.stringify({
            model,
            messages
          })
      }
    );

  const data =
    await response.json();

  if (!response.ok) {

    throw new Error(
      data?.error?.message ||
        `Groq request failed (${response.status})`
    );
  }

  return (
    data?.choices?.[0]
      ?.message?.content ||
    "I couldn't generate an answer."
  );
}


/* =========================
   GROQ VISION / OCR
========================= */

/*
 * This is deliberately separate from the normal answer model.
 *
 * Why?
 *
 * openai/gpt-oss-120b is text-only.
 *
 * Groq currently provides multimodal models such as:
 *
 * qwen/qwen3.8-27b
 *
 * which can read images and perform OCR.
 */

async function callGroqVision(
  imageDataUrl,
  pageType
) {
  const settings =
    await getSettings();

  if (!settings.apiKey) {
    throw new Error(
      "No Groq API key is saved."
    );
  }

  /*
   * If the user has entered a known vision model in the
   * API Key tab, use it.
   *
   * Otherwise use the current Groq vision model.
   */

  let visionModel =
    settings.model ||
    "qwen/qwen3.8-27b";

  /*
   * The user's normal model may be gpt-oss-120b.
   * That model does not accept images, so automatically switch
   * the image-reading request to the vision model.
   */

  const lower =
    visionModel.toLowerCase();

  const isVisionModel =
    lower.includes("qwen/qwen3.8") ||
    lower.includes("qwen/qwen3.6") ||
    lower.includes("llama-4");

  if (!isVisionModel) {
    visionModel =
      "qwen/qwen3.8-27b";
  }

  const prompt =
    pageType === "slides"
      ? `
Read the visible Google Slides page carefully.

This is a homework assistant.

Extract all useful text from the slide, including:
- questions
- equations
- numbers
- labels
- instructions
- text inside screenshots
- text inside diagrams
- text inside images

Do NOT describe the Google Slides interface.

Return the homework content as plain text.

If there is no homework text, say:
NO_HOMEWORK_TEXT
`
      : `
Read the visible Google Docs page carefully.

This is a homework assistant.

Extract all useful homework text, including:
- questions
- equations
- numbers
- instructions
- text inside screenshots
- text inside images
- diagrams containing readable words

Do NOT describe the Google Docs interface.

Return the homework content as plain text.

If there is no homework text, say:
NO_HOMEWORK_TEXT
`;

  const response =
    await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${settings.apiKey}`
        },

        body:
          JSON.stringify({
            model:
              visionModel,

            messages: [
              {
                role:
                  "system",

                content:
                  "You extract homework text from images accurately. Do not solve the homework. Only extract the useful homework content."
              },

              {
                role:
                  "user",

                content: [
                  {
                    type:
                      "text",

                    text:
                      prompt
                  },

                  {
                    type:
                      "image_url",

                    image_url: {
                      url:
                        imageDataUrl
                    }
                  }
                ]
              }
            ],

            temperature:
              0
          })
      }
    );

  const data =
    await response.json();

  if (!response.ok) {

    throw new Error(
      data?.error?.message ||
        `Groq vision request failed (${response.status})`
    );
  }

  return (
    data?.choices?.[0]
      ?.message?.content ||
    ""
  );
}


/* =========================
   CAPTURE GOOGLE DOCS / SLIDES
========================= */

async function captureVisiblePage(
  tabId
) {
  if (!tabId) {
    throw new Error(
      "Could not identify the current tab."
    );
  }

  return new Promise(
    (resolve, reject) => {

      chrome.tabs.captureVisibleTab(
        null,
        {
          format:
            "png"
        },
        dataUrl => {

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

          if (!dataUrl) {

            reject(
              new Error(
                "Could not capture the Google page."
              )
            );

            return;
          }

          resolve(
            dataUrl
          );

        }
      );

    }
  );
}


/* =========================
   VISION SCAN
========================= */

async function visionScan(
  sender,
  pageType
) {
  const settings =
    await getSettings();

  if (!settings.apiKey) {
    throw new Error(
      "No API key is saved. Open the API Key tab and add your Groq API key."
    );
  }

  if (
    settings.provider !==
    "groq"
  ) {

    /*
     * We only use Groq for the image/OCR stage.
     *
     * This keeps the user's requested Groq workflow.
     */

    throw new Error(
      "Image scanning currently uses Groq. Select Groq in the API Key tab."
    );
  }

  const tabId =
    sender?.tab?.id;

  if (!tabId) {
    throw new Error(
      "Could not identify the Google tab."
    );
  }

  const screenshot =
    await captureVisiblePage(
      tabId
    );

  return await callGroqVision(
    screenshot,
    pageType
  );
}


/* =========================
   MESSAGE HANDLER
========================= */

chrome.runtime.onMessage.addListener(
  (
    message,
    sender,
    sendResponse
  ) => {

    if (
      message?.type ===
      "VISION_SCAN"
    ) {

      (async () => {

        try {

          const text =
            await visionScan(
              sender,
              message.pageType
            );

          sendResponse({
            ok: true,
            text
          });

        } catch (error) {

          sendResponse({
            ok: false,

            error:
              error?.message ||
              String(error)
          });

        }

      })();

      return true;
    }


    if (
      message?.type !==
      "AI_REQUEST"
    ) {
      return;
    }


    (async () => {

      try {

        const settings =
          await getSettings();

        if (
          !settings.apiKey
        ) {

          throw new Error(
            "No API key is saved. Open the API Key tab and add your API key."
          );
        }

        const prompt =
          String(
            message.prompt ||
            ""
          ).trim();

        if (!prompt) {

          throw new Error(
            "No question was provided."
          );
        }

        const provider =
          settings.provider ||
          "openai";

        let text;

        if (
          provider ===
          "gemini"
        ) {

          text =
            await callGemini(
              prompt,
              message.history
            );

        } else if (
          provider ===
          "groq"
        ) {

          text =
            await callGroq(
              prompt,
              message.history
            );

        } else {

          text =
            await callOpenAI(
              prompt,
              message.history
            );
        }

        sendResponse({
          ok: true,
          text
        });

      } catch (error) {

        sendResponse({
          ok: false,

          error:
            error?.message ||
            String(error)
        });

      }

    })();

    return true;
  }
);
