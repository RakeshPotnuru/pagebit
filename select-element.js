(() => {
  if (window.__pagebitSelecting) return;
  window.__pagebitSelecting = true;

  let selectedElement;
  let capturing = false;
  let cancelRequested = false;
  const outline = document.createElement("div");
  Object.assign(outline.style, {
    position: "fixed",
    zIndex: "2147483647",
    pointerEvents: "none",
    border: "2px solid #176f5b",
    background: "rgba(23, 111, 91, .12)",
    boxSizing: "border-box",
    margin: "0",
    padding: "0",
    display: "none"
  });
  outline.setAttribute("popover", "manual");
  document.documentElement.append(outline);
  outline.showPopover?.();

  function move(event) {
    const element = document.elementFromPoint(event.clientX, event.clientY);
    if (!element || element === outline) return;
    selectedElement = element;
    const rect = element.getBoundingClientRect();
    Object.assign(outline.style, {
      display: "block",
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`
    });
  }

  function cleanup(keepCancel = false) {
    window.removeEventListener("mousemove", move, true);
    window.removeEventListener("click", select, true);
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup"]) {
      window.removeEventListener(type, suppress, true);
    }
    outline.remove();
    delete window.__pagebitSelecting;
    if (!keepCancel) delete window.__pagebitCancelSelection;
  }

  function cancel() {
    if (!capturing) { cleanup(); return; }
    if (cancelRequested) return;
    cancelRequested = true;
    chrome.runtime.sendMessage({ type: "cancelCapture" }).catch(() => {});
  }

  async function select(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const element = selectedElement || document.elementFromPoint(event.clientX, event.clientY);
    const rect = element?.getBoundingClientRect();
    if (rect && rect.width >= 1 && rect.height >= 1) capturing = true;
    cleanup(capturing);
    if (!rect || rect.width < 1 || rect.height < 1) return;

    try {
      window.__pagebitSelectedElement = element;
      const response = await chrome.runtime.sendMessage({ type: "captureElement" });
      if (!response?.ok) throw new Error(response?.error || "Capture failed.");
    } catch (error) {
      delete window.__pagebitSelectedElement;
      if (cancelRequested || error.message === "Capture cancelled.") return;
      const notice = document.createElement("div");
      notice.textContent = `Pagebit: ${error.message}`;
      Object.assign(notice.style, {
        position: "fixed",
        zIndex: "2147483647",
        right: "16px",
        bottom: "16px",
        padding: "10px 14px",
        borderRadius: "8px",
        background: "#202527",
        color: "white",
        font: "13px sans-serif"
      });
      document.documentElement.append(notice);
      setTimeout(() => notice.remove(), 5000);
    } finally {
      cleanup();
    }
  }

  function suppress(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  window.__pagebitCancelSelection = () => { cancel(); return true; };
  for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup"]) {
    window.addEventListener(type, suppress, true);
  }
  window.addEventListener("mousemove", move, true);
  window.addEventListener("click", select, true);
})();
