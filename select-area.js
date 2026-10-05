(() => {
  if (window.__pagebitSelecting) return;
  window.__pagebitSelecting = true;

  let start;
  let capturing = false;
  let cancelled = false;
  const initialScroll = { x:scrollX, y:scrollY };
  const overlay = document.createElement('div');
  overlay.setAttribute('popover', 'manual');
  overlay.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;width:100%!important;height:100%!important;margin:0!important;padding:0!important;border:0!important;background:transparent!important;z-index:2147483647!important;cursor:crosshair!important;';
  const root = overlay.attachShadow({ mode:'closed' });
  const style = document.createElement('style');
  style.textContent = `:host { user-select:none }
    .box { position:absolute; display:none; box-sizing:border-box; border:2px solid #176f5b;
      background:rgba(23,111,91,.12); box-shadow:0 0 0 100vmax rgba(0,0,0,.2); pointer-events:none }
    .hint { position:absolute; top:16px; left:50%; transform:translateX(-50%); padding:10px 14px;
      border-radius:8px; background:#202527; color:white; font:13px sans-serif; pointer-events:none }`;
  const box = document.createElement('div');
  box.className = 'box';
  const hint = document.createElement('div');
  hint.className = 'hint';
  root.append(style, box);
  document.documentElement.append(overlay);
  overlay.showPopover?.();

  function point(event) {
    return {
      x:Math.max(0, Math.min(event.clientX, document.documentElement.clientWidth)),
      y:Math.max(0, Math.min(event.clientY, document.documentElement.clientHeight))
    };
  }
  function rectangle(event) {
    const end = point(event);
    return { left:Math.min(start.x,end.x), top:Math.min(start.y,end.y),
      width:Math.abs(end.x-start.x), height:Math.abs(end.y-start.y) };
  }
  function suppress(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  function down(event) {
    suppress(event);
    if (capturing || event.button !== 0) return;
    start = point(event);
    move(event);
  }
  function move(event) {
    suppress(event);
    if (!start || capturing) return;
    const rect = rectangle(event);
    Object.assign(box.style, { display:'block', left:`${rect.left}px`, top:`${rect.top}px`,
      width:`${rect.width}px`, height:`${rect.height}px` });
  }
  function cleanup() {
    overlay.remove();
    for (const [type, handler] of listeners) window.removeEventListener(type, handler, true);
    delete window.__pagebitSelecting;
    delete window.__pagebitCancelSelection;
  }
  function cancel() {
    cancelled = true;
    if (capturing) chrome.runtime.sendMessage({ type:'cancelCapture' }).catch(() => {});
    else cleanup();
  }
  function blur(event) {
    if (event.target === window) cancel();
  }
  function scroll() {
    if (scrollX !== initialScroll.x || scrollY !== initialScroll.y) cancel();
  }
  async function up(event) {
    suppress(event);
    if (!start || capturing || event.button !== 0) return;
    const rect = rectangle(event);
    start = null;
    if (rect.width < 1 || rect.height < 1) {
      box.style.display = 'none';
      return;
    }
    capturing = true;
    overlay.remove();
    try {
      const response = await chrome.runtime.sendMessage({ type:'captureArea', rect });
      if (!response?.ok) throw new Error(response?.error || 'Capture failed.');
    } catch (error) {
      if (cancelled || error.message === 'Capture cancelled.') return;
      hint.textContent = `Pagebit: ${error.message}`;
      root.append(hint);
      box.style.display = 'none';
      document.documentElement.append(overlay);
      overlay.showPopover?.();
      setTimeout(() => overlay.remove(), 5000);
    } finally {
      // Keep the release click from activating links or controls under the selection.
      for (const [type, handler] of listeners) window.removeEventListener(type, handler, true);
      delete window.__pagebitSelecting;
      delete window.__pagebitCancelSelection;
    }
  }
  const listeners = [['pointerdown',down], ['pointermove',move], ['pointerup',up],
    ['mousedown',suppress], ['mouseup',suppress], ['click',suppress], ['contextmenu',suppress],
    ['wheel',suppress], ['keydown',suppress], ['resize',cancel], ['scroll',scroll], ['blur',blur]];
  window.__pagebitCancelSelection = () => { cancel(); return true; };
  for (const [type, handler] of listeners) window.addEventListener(type, handler, { capture:true, passive:false });
})();
