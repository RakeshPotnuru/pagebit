const MAX_CAPTURE_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_CAPTURE_BYTES = 100 * 1024 * 1024;
const MAX_CAPTURE_COUNT = 20;

function openCaptureDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("pagebit-captures", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("captures", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withCaptureStore(mode, work) {
  const db = await openCaptureDb();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction("captures", mode);
      const request = work(transaction.objectStore("captures"));
      transaction.oncomplete = () => resolve(request?.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

function pruneCaptures(store, captures, now) {
  let bytes = 0;
  let count = 0;
  for (const capture of captures.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))) {
    const size = capture.blob?.size || 0;
    if (!capture.savedAt || now - capture.savedAt > MAX_CAPTURE_AGE_MS ||
        count >= MAX_CAPTURE_COUNT || bytes + size > MAX_CAPTURE_BYTES) {
      store.delete(capture.id);
    } else {
      bytes += size;
      count++;
    }
  }
}

async function saveCapture(capture) {
  if (!capture.blob?.size || capture.blob.size > MAX_CAPTURE_BYTES) {
    throw new Error("This screenshot is too large to save.");
  }
  const now = Date.now();
  await withCaptureStore("readwrite", store => {
    const request = store.getAll();
    request.onsuccess = () => {
      store.put({ ...capture, savedAt: now });
      pruneCaptures(store, [{ ...capture, savedAt: now }, ...request.result], now);
    };
    return request;
  });
}

async function getCapture(id) {
  return withCaptureStore("readonly", store => store.get(id));
}

async function deleteCapture(id) {
  await withCaptureStore("readwrite", store => store.delete(id));
}

async function setCapturePreviewTab(id, tabId) {
  await withCaptureStore("readwrite", store => {
    const request = store.get(id);
    request.onsuccess = () => {
      if (request.result) store.put({ ...request.result, previewTabId: tabId });
    };
    return request;
  });
}

async function deleteCaptureForTab(tabId) {
  await withCaptureStore("readwrite", store => {
    const request = store.getAll();
    request.onsuccess = () => {
      for (const capture of request.result) {
        if (capture.previewTabId === tabId) store.delete(capture.id);
      }
    };
    return request;
  });
}
