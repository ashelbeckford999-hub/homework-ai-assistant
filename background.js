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

async function callOpenAI(prompt, history) {
  const settings = await getSettings();

  const model = settings.model || "gpt-5-mini";

  const input = [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text: "You are a helpful homework assistant. Explain answers clearly and accurately. Help the student understand the work."
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

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model,
      input
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message || `OpenAI request failed (${response.status})`
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

async function callGroq(prompt, history) {
  const settings = await getSettings();

  const model = settings.model || "llama-3.3-70b-versatile";

  const messages = [
    {
      role: "system",
      content:
        "You are a helpful homework assistant. Explain answers clearly and accurately."
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
      data?.error?.message || `Groq request failed (${response.status})`
    );
  }

  return (
    data?.choices?.[0]?.message?.content ||
    "I couldn't generate an answer."
  );
}

async function callGemini(prompt, history) {
  const settings = await getSettings();

  const model = settings.model || "gemini-2.5-flash";

  const contents = [
    ...normalizeHistory(history).map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }]
    })),
    {
      role: "user",
      parts: [{ text: prompt }]
    }
  ];

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent?key=${encodeURIComponent(settings.apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: "You are a helpful homework assistant. Explain answers clearly and accurately."
            }
          ]
        },
        contents
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message || `Gemini request failed (${response.status})`
    );
  }

  return (
    data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .trim() || "I couldn't generate an answer."
  );
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "AI_REQUEST") {
    return;
  }

  (async () => {
    try {
      const settings = await getSettings();

      if (!settings.apiKey) {
        throw new Error(
          "No API key is saved. Open Homework AI and add your API key."
        );
      }

      const provider = settings.provider || "openai";
      const prompt = String(message.prompt || "");
      const history = normalizeHistory(message.history);

      if (!prompt.trim()) {
        throw new Error("No question was provided.");
      }

      let text;

      if (provider === "gemini") {
        text = await callGemini(prompt, history);
      } else if (provider === "groq") {
        text = await callGroq(prompt, history);
      } else {
        text = await callOpenAI(prompt, history);
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
});
