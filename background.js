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
        (item.role === "user" || item.role === "assistant") &&
        typeof item.content === "string"
    )
    .slice(-20);
}


/* =========================
   OPENAI
========================= */

async function callOpenAI(prompt, history) {
  const settings = await getSettings();

  const model = settings.model || "gpt-5.6";

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

    ...normalizeHistory(history).map((message) => ({
      role: message.role,
      content: [
        {
          type: "input_text",
          text: message.content
        }
      ]
    })),

    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: prompt
        }
      ]
    }
  ];

  const response = await fetch(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`
      },

      body: JSON.stringify({
        model,
        input
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
        `OpenAI request failed (${response.status})`
    );
  }

  if (typeof data.output_text === "string") {
    return data.output_text;
  }

  const text = (data.output || [])
    .flatMap((item) => item.content || [])
    .map((item) => item.text || "")
    .join("")
    .trim();

  return text || "I couldn't generate an answer.";
}


/* =========================
   GEMINI
========================= */

async function callGemini(prompt, history) {
  const settings = await getSettings();

  const model = settings.model || "gemini-3.8-flash";

  const historyText = normalizeHistory(history)
    .map(
      (message) =>
        `${message.role === "assistant" ? "Assistant" : "Student"}: ${
          message.content
        }`
    )
    .join("\n\n");

  const fullPrompt =
    historyText +
    (historyText ? "\n\n" : "") +
    `Student: ${prompt}`;

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/interactions",
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": settings.apiKey
      },

      body: JSON.stringify({
        model,
        input: fullPrompt,
        system_instruction:
          "You are a helpful homework assistant. Explain answers clearly, accurately, and at an appropriate student level."
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
        `Gemini request failed (${response.status})`
    );
  }

  if (typeof data.output_text === "string") {
    return data.output_text;
  }

  if (Array.isArray(data.outputs)) {
    const text = data.outputs
      .map((item) => item?.text || "")
      .join("")
      .trim();

    if (text) return text;
  }

  return "I couldn't generate an answer.";
}


/* =========================
   GROQ
========================= */

async function callGroq(prompt, history) {
  const settings = await getSettings();

  const model =
    settings.model || "openai/gpt-oss-120b";

  const messages = [
    {
      role: "system",
      content:
        "You are a helpful homework assistant. Explain answers clearly, accurately, and at an appropriate student level."
    },

    ...normalizeHistory(history),

    {
      role: "user",
      content: prompt
    }
  ];

  const response = await fetch(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`
      },

      body: JSON.stringify({
        model,
        messages
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
        `Groq request failed (${response.status})`
    );
  }

  return (
    data?.choices?.[0]?.message?.content ||
    "I couldn't generate an answer."
  );
}


/* =========================
   MESSAGE HANDLER
========================= */

chrome.runtime.onMessage.addListener(
  (message, sender, sendResponse) => {
    if (message?.type !== "AI_REQUEST") {
      return;
    }

    (async () => {
      try {
        const settings = await getSettings();

        if (!settings.apiKey) {
          throw new Error(
            "No API key is saved. Open the API Key tab and add your API key."
          );
        }

        const prompt = String(message.prompt || "").trim();

        if (!prompt) {
          throw new Error("No question was provided.");
        }

        const provider = settings.provider || "openai";

        let text;

        if (provider === "gemini") {
          text = await callGemini(
            prompt,
            message.history
          );
        } else if (provider === "groq") {
          text = await callGroq(
            prompt,
            message.history
          );
        } else {
          text = await callOpenAI(
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
          error: error?.message || String(error)
        });
      }
    })();

    return true;
  }
);
