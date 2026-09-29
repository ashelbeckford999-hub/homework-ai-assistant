document.getElementById("open").addEventListener("click", async () => {
  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  const tab = tabs[0];

  if (!tab?.id) {
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: "TOGGLE_HOMEWORK_AI"
    });
  } catch (error) {
    console.error("Could not contact Homework AI:", error);

    try {
      await chrome.scripting.executeScript({
        target: {
          tabId: tab.id
        },
        files: ["content.js"]
      });
    } catch (injectionError) {
      console.error(
        "Could not start Homework AI:",
        injectionError
      );
    }
  }

  window.close();
});
