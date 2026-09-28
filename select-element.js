(() => {
  if (window.__pagebitSelecting) return;
  window.__pagebitSelecting = true;

  const outline = document.createElement("div");
  Object.assign(outline.style, {
    position: "fixed",
    zIndex: "2147483647",
    pointerEvents: "none",
    border: "2px solid #176f5b",
    background: "rgba(23, 111, 91, .12)",
    boxSizing: "border-box",
    display: "none"
  });
  document.documentElement.append(outline);

  function move(event) {
    const element = document.elementFromPoint(event.clientX, event.clientY);
    if (!element || element === outline) return;
    const rect = element.getBoundingClientRect();
    Object.assign(outline.style, {
      display: "block",
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`
    });
  }

  function cleanup() {
    document.removeEventListener("mousemove", move, true);
    document.removeEventListener("click", select, true);
    document.removeEventListener("keydown", keydown, true);
    outline.remove();
    delete window.__pagebitSelecting;
  }

  async function select(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const element = document.elementFromPoint(event.clientX, event.clientY);
    const rect = element?.getBoundingClientRect();
    cleanup();
    if (!rect || rect.width < 1 || rect.height < 1) return;

    try {
      const response = await chrome.runtime.sendMessage({
        type: "captureElement",
        rect: {
          x: rect.left + window.scrollX,
          y: rect.top + window.scrollY,
          width: rect.width,
          height: rect.height
        }
      });
      if (!response?.ok) throw new Error(response?.error || "Capture failed.");
    } catch (error) {
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
    }
  }

  function keydown(event) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    cleanup();
  }

  document.addEventListener("mousemove", move, true);
  document.addEventListener("click", select, true);
  document.addEventListener("keydown", keydown, true);
})();
