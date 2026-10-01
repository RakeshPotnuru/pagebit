importScripts("capture-store.js");

chrome.tabs.onRemoved.addListener(tabId => {
  deleteCaptureForTab(tabId).catch(() => {});
});

let captureState = null;
let lastScreenshotAt = 0;
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "captureStatus") {
    sendResponse({ active: !!captureState });
    return;
  }
  if (message?.type === "cancelCapture") {
    if (captureState && (!sender.tab || sender.tab.id === captureState.tabId ||
        sender.url?.startsWith(chrome.runtime.getURL("")))) {
      captureState.cancelled = true;
      chrome.scripting.executeScript({
        target: { tabId: captureState.tabId },
        func: () => window.__pagebitCapture?.({ action: "cancel" })
      }).catch(() => {});
      sendResponse({ ok: true });
    } else {
      sendResponse({ ok: false });
    }
    return;
  }
  if (message?.type !== "capture" && message?.type !== "captureElement") return;
  const tabId = message.type === "captureElement" ? sender.tab?.id : message.tabId;
  const mode = message.type === "captureElement" ? "element" : message.mode;
  capture(tabId, mode)
    .then(() => sendResponse({ ok: true }))
    .catch(error => sendResponse({ ok: false, error: error.message }));
  return true;
});

async function capture(tabId, mode) {
  if (captureState) throw new Error("A screenshot is already being captured.");
  if (!tabId) throw new Error("No active tab found.");
  if (!["visible", "full", "element"].includes(mode)) throw new Error("Unknown capture mode.");
  const state = { tabId, count: 0, total: 1, cancelled: false };
  captureState = state;
  const checkCancelled = () => {
    if (state.cancelled) throw new Error("Capture cancelled.");
  };
  const reportProgress = async () => {
    await chrome.action.setBadgeText({ tabId, text: `${state.count}/${state.total}` }).catch(() => {});
  };
  let prepared = false;
  const page = async request => {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: async request => {
        try { return { value: await window.__pagebitCapture(request) }; }
        catch (error) { return { error: error.message }; }
      },
      args: [request]
    });
    if (result?.result?.error) throw new Error(result.result.error);
    if (!result?.result) throw new Error("The page capture was interrupted. Try again.");
    return result.result.value;
  };
  try {
    await chrome.action.setBadgeBackgroundColor({ tabId, color: "#176f5b" }).catch(() => {});
    await reportProgress();
    const tab = await chrome.tabs.get(tabId);
    await chrome.scripting.executeScript({ target: { tabId }, files: ["capture-page.js"] });
    prepared = true;
    await page({ action: "prepare", mode });
    let canvas, scaleX, scaleY;
    let offsetY = 0;
    let count = 0;
    let area;
    do {
      let offsetX = 0;
      let rowHeight = Infinity;
      do {
        checkCancelled();
        if (++count > 200) throw new Error("This page keeps growing or is too large to capture.");
        const frame = await page({ action: "frame", x: offsetX, y: offsetY });
        checkCancelled();
        area = frame.rect;
        state.total = Math.max(state.total,
          Math.ceil(area.width / frame.clientWidth) * Math.ceil(area.height / frame.clientHeight));
        await reportProgress();
        const sourceX = area.left + offsetX;
        const sourceY = area.top + offsetY;
        const width = Math.min(area.width - offsetX, frame.clientWidth - sourceX,
          frame.clip.right - sourceX);
        const height = Math.min(area.height - offsetY, frame.clientHeight - sourceY,
          frame.clip.bottom - sourceY);
        if (sourceX < -1 || sourceY < -1 || width < 1 || height < 1) {
          throw new Error("The whole selected element cannot be reached by scrolling this page.");
        }
        // Chrome allows at most two visible-tab captures per second.
        await new Promise(resolve => setTimeout(resolve, Math.max(0, 550 - (Date.now() - lastScreenshotAt))));
        checkCancelled();
        const current = await chrome.tabs.get(tabId);
        if (!current.active || current.windowId !== tab.windowId) {
          throw new Error("Keep the page tab active until capture finishes.");
        }
        lastScreenshotAt = Date.now();
        const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
        checkCancelled();
        const bitmap = await createImageBitmap(await fetch(dataUrl).then(response => response.blob()));
        try {
          scaleX ??= bitmap.width / frame.viewportWidth;
          scaleY ??= bitmap.height / frame.viewportHeight;
          const outputWidth = Math.round(area.width * scaleX);
          const outputHeight = Math.round(area.height * scaleY);
          if (outputWidth > 32767 || outputHeight > 32767 || outputWidth * outputHeight > 128000000) {
            throw new Error("This screenshot is too large. Zoom out and capture again.");
          }
          if (!canvas || canvas.width !== outputWidth || canvas.height !== outputHeight) {
            const resized = new OffscreenCanvas(outputWidth, outputHeight);
            if (canvas) resized.getContext("2d").drawImage(canvas, 0, 0);
            canvas = resized;
          }
          const dx = Math.round(offsetX * scaleX);
          const dy = Math.round(offsetY * scaleY);
          const dw = Math.round((offsetX + width) * scaleX) - dx;
          const dh = Math.round((offsetY + height) * scaleY) - dy;
          canvas.getContext("2d").drawImage(bitmap,
            Math.round(sourceX * scaleX), Math.round(sourceY * scaleY), dw, dh,
            dx, dy, dw, dh);
        } finally {
          bitmap.close();
        }
        state.count++;
        await reportProgress();
        offsetX += width;
        rowHeight = Math.min(rowHeight, height);
      } while (offsetX < area.width - 0.5);
      offsetY += rowHeight;
    } while (offsetY < area.height - 0.5);
    checkCancelled();
    const blob = await canvas.convertToBlob({ type: "image/png" });
    checkCancelled();
    if (!blob.size) throw new Error("The browser returned an empty screenshot.");
    await page({ action: "restore" });
    prepared = false;
    checkCancelled();
    const title = (tab.title || "page").replace(/[\\/:*?"<>|\x00-\x1f]/g, "-").slice(0, 60).trim() || "page";
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const id = crypto.randomUUID();
    await saveCapture({ id, blob, filename: `${title}-${mode}-${stamp}.png` });
    let previewTab;
    try {
      checkCancelled();
      previewTab = await chrome.tabs.create({
        url: chrome.runtime.getURL(`preview.html?id=${id}`), windowId: tab.windowId, openerTabId: tabId
      });
    } catch (error) {
      await deleteCapture(id);
      throw error;
    }
    await setCapturePreviewTab(id, previewTab.id);
  } finally {
    if (prepared) await page({ action: "restore" }).catch(() => {});
    await chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {});
    captureState = null;
  }
}
