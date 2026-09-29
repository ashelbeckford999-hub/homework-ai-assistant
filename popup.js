document.getElementById("open").onclick = async () => {
  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  const tab = tabs[0];

  if (!tab?.id) {
    window.close();
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: "TOGGLE_HOMEWORK_AI"
    });
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: {
          tabId: tab.id
        },
        files: ["content.js"]
      });
    } catch (error) {
      console.error("Could not inject Homework AI:", error);
    }
  }

  window.close();
};
