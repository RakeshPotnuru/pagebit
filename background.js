chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "capture" && message?.type !== "captureElement") return;

  const tabId = message.type === "captureElement" ? sender.tab?.id : message.tabId;
  const mode = message.type === "captureElement" ? "element" : message.mode;
  capture(tabId, mode, message.rect)
    .then(() => sendResponse({ ok: true }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));
  return true;
});

async function capture(tabId, mode, rect) {
  if (!tabId) throw new Error("No active tab found.");
  const tab = await chrome.tabs.get(tabId);
  let dataUrl;

  if (mode === "visible") {
    dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  } else if (mode === "full" || mode === "element") {
    const target = { tabId };
    await chrome.debugger.attach(target, "1.3");
    try {
      let clip;
      if (mode === "element") {
        if (!rect || rect.width < 1 || rect.height < 1) throw new Error("Invalid element size.");
        clip = { ...rect, scale: 1 };
      } else {
        const metrics = await chrome.debugger.sendCommand(target, "Page.getLayoutMetrics");
        const { width, height } = metrics.cssContentSize;
        clip = { x: 0, y: 0, width, height, scale: 1 };
      }
      const image = await chrome.debugger.sendCommand(target, "Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: true,
        clip
      });
      dataUrl = `data:image/png;base64,${image.data}`;
    } finally {
      await chrome.debugger.detach(target).catch(() => {});
    }
  } else {
    throw new Error("Unknown capture mode.");
  }

  const title = (tab.title || "page").replace(/[\\/:*?"<>|\x00-\x1f]/g, "-").slice(0, 60).trim() || "page";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await chrome.downloads.download({
    url: dataUrl,
    filename: `Pagebit/${title}-${mode}-${stamp}.png`,
    conflictAction: "uniquify"
  });
}
