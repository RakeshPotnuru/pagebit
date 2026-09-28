const status = document.querySelector("#status");
const buttons = [...document.querySelectorAll("button[data-mode]")];

for (const button of buttons) {
  button.addEventListener("click", async () => {
    buttons.forEach((item) => { item.disabled = true; });
    status.textContent = "";

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error("No active tab found.");

      const mode = button.dataset.mode;
      if (mode === "element") {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["select-element.js"] });
        window.close();
        return;
      }

      const response = await chrome.runtime.sendMessage({ type: "capture", mode, tabId: tab.id });
      if (!response?.ok) throw new Error(response?.error || "Capture failed.");
      status.style.color = "#176f5b";
      status.textContent = "Saved to Downloads.";
    } catch (error) {
      status.style.color = "#a13b2c";
      status.textContent = error.message || "Capture failed.";
    } finally {
      buttons.forEach((item) => { item.disabled = false; });
    }
  });
}
