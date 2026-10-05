(() => {
  if (window.__pagebitCapture) return;
  let state;
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  const paint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const pageSize = () => ({
    width: Math.max(document.documentElement.clientWidth, document.documentElement.scrollWidth, document.body?.scrollWidth || 0),
    height: Math.max(document.documentElement.clientHeight, document.documentElement.scrollHeight, document.body?.scrollHeight || 0)
  });
  function scrollParents(element) {
    const parents = [];
    for (let parent = element.parentElement; parent && parent !== document.body &&
         parent !== document.documentElement; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if ((parent.scrollHeight > parent.clientHeight + 1 && /auto|scroll|hidden/.test(style.overflowY)) ||
          (parent.scrollWidth > parent.clientWidth + 1 && /auto|scroll|hidden/.test(style.overflowX))) {
        parents.push(parent);
      }
    }
    return parents;
  }
  function geometry() {
    let rect;
    const clip = { left:0, top:0, right:innerWidth, bottom:innerHeight };
    if (state.mode === 'element') {
      if (!state.element?.isConnected) throw new Error('The selected element was removed from the page. Select it again.');
      const r = state.element.getBoundingClientRect();
      rect = { left:r.left, top:r.top, width:r.width, height:r.height };
      for (const parent of state.scrollParents) {
        const bounds = parent.getBoundingClientRect();
        clip.left = Math.max(clip.left, bounds.left + parent.clientLeft);
        clip.top = Math.max(clip.top, bounds.top + parent.clientTop);
        clip.right = Math.min(clip.right, bounds.left + parent.clientLeft + parent.clientWidth);
        clip.bottom = Math.min(clip.bottom, bounds.top + parent.clientTop + parent.clientHeight);
      }
    } else if (state.mode === 'area') {
      rect = state.rect;
    } else if (state.mode === 'full') {
      rect = { left:-scrollX, top:-scrollY, ...pageSize() };
    } else {
      rect = { left:0, top:0, width:document.documentElement.clientWidth, height:document.documentElement.clientHeight };
    }
    return { rect, clip, clientWidth:document.documentElement.clientWidth,
      clientHeight:document.documentElement.clientHeight, viewportWidth:innerWidth, viewportHeight:innerHeight };
  }
  function restore() {
    if (!state) return;
    for (const [element, value, priority] of state.hidden) {
      if (value) element.style.setProperty('visibility', value, priority);
      else element.style.removeProperty('visibility');
    }
    for (const [element, property, value, priority] of state.stickyStyles) {
      if (value) element.style.setProperty(property, value, priority);
      else element.style.removeProperty(property);
    }
    for (const [parent, left, top] of state.originalParentScroll) {
      parent.scrollLeft = left;
      parent.scrollTop = top;
    }
    window.scrollTo({ left:state.x, top:state.y, behavior:'instant' });
    state.style.remove();
    delete window.__pagebitSelectedElement;
    state = null;
  }
  window.__pagebitCapture = async request => {
    if (request.action === 'restore') { restore(); return; }
    if (request.action === 'prepare') {
      if (state) restore();
      if (request.mode === 'area') {
        const r = request.rect;
        if (!r || ![r.left, r.top, r.width, r.height].every(Number.isFinite) ||
            r.left < 0 || r.top < 0 || r.width < 1 || r.height < 1 ||
            r.left + r.width > document.documentElement.clientWidth ||
            r.top + r.height > document.documentElement.clientHeight) {
          throw new Error('Select an area inside the visible page before capturing.');
        }
      }
      const style = document.createElement('style');
      // Keep scrollbar space and the page layout unchanged while hiding its paint.
      style.textContent = `html, body { scroll-behavior:auto !important; scroll-snap-type:none !important; overflow-anchor:none !important; }
        * { scrollbar-color:transparent transparent !important; }
        *::-webkit-scrollbar-thumb, *::-webkit-scrollbar-track, *::-webkit-scrollbar-corner {
          background:transparent !important; box-shadow:none !important; border-color:transparent !important;
        }`;
      const element = window.__pagebitSelectedElement;
      const parents = request.mode === 'element' && element ? scrollParents(element) : [];
      let wake;
      const cancelSignal = new Promise(resolve => { wake = resolve; });
      state = { mode:request.mode, rect:request.rect, x:scrollX, y:scrollY, element, style, hidden:[], stickyStyles:[],
        scrollParents:parents, originalParentScroll:parents.map(parent => [parent, parent.scrollLeft, parent.scrollTop]),
        cancelSignal, cancelled:false, cancel:() => { state.cancelled = true; wake(); } };
      document.documentElement.append(style);
      if (state.mode === 'element' && !state.element) throw new Error('Select an element before capturing.');
      await paint();
      return geometry();
    }
    if (!state) throw new Error('The page capture was interrupted. Try again.');
    if (request.action === 'cancel') { state.cancel(); return; }
    if (request.action === 'frame') {
      let frame = geometry();
      let x = scrollX, y = scrollY;
      if (state.mode === 'full') {
        x = request.x; y = request.y;
      } else if (state.mode === 'element') {
        for (const parent of state.scrollParents) {
          const r = state.element.getBoundingClientRect();
          const bounds = parent.getBoundingClientRect();
          const targetX = r.left + request.x;
          const targetY = r.top + request.y;
          if (targetX < bounds.left + parent.clientLeft ||
              targetX >= bounds.left + parent.clientLeft + parent.clientWidth) {
            parent.scrollLeft += targetX - bounds.left - parent.clientLeft;
          }
          if (targetY < bounds.top + parent.clientTop ||
              targetY >= bounds.top + parent.clientTop + parent.clientHeight) {
            parent.scrollTop += targetY - bounds.top - parent.clientTop;
          }
        }
        frame = geometry();
        // A dialog already on screen must stay in place. Only scroll when a part is outside the viewport.
        if (request.x || frame.rect.left < 0 || frame.rect.left + frame.rect.width > frame.clientWidth) {
          x += frame.rect.left + request.x;
        }
        if (request.y || frame.rect.top < 0 || frame.rect.top + frame.rect.height > frame.clientHeight) {
          y += frame.rect.top + request.y;
        }
      }
      const moved = Math.abs(x-scrollX) > 0.5 || Math.abs(y-scrollY) > 0.5;
      if (moved) window.scrollTo({ left:x, top:y, behavior:'instant' });
      await paint();
      for (const element of document.querySelectorAll('body *')) {
        const position = getComputedStyle(element).position;
        if (state.mode === 'full' && position === 'sticky' && element.textContent.trim()) {
          // Sticky boxes already occupy their natural place in the document.
          // Let them scroll with that space instead of repeating in each tile.
          for (const [property, value] of [['position','relative'],['top','auto'],['bottom','auto'],['left','auto'],['right','auto']]) {
            state.stickyStyles.push([element, property, element.style.getPropertyValue(property), element.style.getPropertyPriority(property)]);
            element.style.setProperty(property, value, 'important');
          }
        }
        const r = element.getBoundingClientRect();
        if (position === 'fixed' && r.height < innerHeight / 3 &&
            !state.hidden.some(([hidden]) => hidden === element) &&
            !(state.element && (element.contains(state.element) || state.element.contains(element))) &&
            ((state.mode === 'full' && (request.x || request.y)) || (state.mode === 'element' && moved))) {
          state.hidden.push([element, element.style.getPropertyValue('visibility'), element.style.getPropertyPriority('visibility')]);
          element.style.setProperty('visibility','hidden','important');
        }
      }
      if (moved || state.mode === 'full') {
        await Promise.race([delay(state.mode === 'full' && request.x === 0 && request.y === 0 ? 3000 : 1000), state.cancelSignal]);
      }
      if (state.cancelled) throw new Error('Capture cancelled.');
      const visible = element => {
        const r = element.getBoundingClientRect();
        return r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
      };
      const images = [...document.images].filter(visible).map(image => image.decode().catch(() => {}));
      const animations = document.getAnimations().filter(animation => {
        const timing = animation.effect?.getComputedTiming();
        return timing?.iterations !== Infinity && animation.playState === 'running' &&
          animation.effect?.target instanceof Element && visible(animation.effect.target);
      }).map(animation => animation.finished.catch(() => {}));
      await Promise.race([Promise.all([...images, ...animations, document.fonts.ready]), delay(2000), state.cancelSignal]);
      if (state.cancelled) throw new Error('Capture cancelled.');
      await paint();
      return geometry();
    }
  };
})();
