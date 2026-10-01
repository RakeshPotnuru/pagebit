const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

function harness({ active = true, empty = false } = {}) {
  const actions = [];
  let saved, opened;
  const chrome = {
    action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
    runtime: { onMessage: { addListener() {} }, sendMessage: async () => {}, getURL: path => path },
    tabs: {
      onRemoved: { addListener() {} },
      get: async () => ({ active, windowId: 1, title: 'A/B\npage' }),
      captureVisibleTab: async () => 'data:image/png;base64,AA==',
      create: async options => { opened = options; return { id: 77 }; }
    },
    scripting: { executeScript: async options => {
      if (options.files) return [];
      const request = options.args[0];
      actions.push(request.action);
      return [{ result: { value: request.action === 'frame' ? {
        rect: { left: 0, top: 0, width: 100, height: 100 },
        clip: { left: 0, top: 0, right: 100, bottom: 100 },
        clientWidth: 100, clientHeight: 100, viewportWidth: 100, viewportHeight: 100
      } : undefined } }];
    } }
  };
  const scope = vm.createContext({
    chrome, importScripts() {}, crypto, fetch, Date, setTimeout,
    saveCapture: async value => { saved = value; },
    setCapturePreviewTab: async () => {},
    deleteCaptureForTab: async () => {},
    createImageBitmap: async () => ({ width: 100, height: 100, close() {} }),
    OffscreenCanvas: class {
      constructor(width, height) { this.width = width; this.height = height; }
      getContext() { return { drawImage() {} }; }
      convertToBlob() { return Promise.resolve(new Blob(empty ? [] : ['png'], { type: 'image/png' })); }
    }
  });
  vm.runInContext(fs.readFileSync(`${__dirname}/background.js`, 'utf8'), scope);
  return { capture: scope.capture, actions, get saved() { return saved; }, get opened() { return opened; } };
}

test('switching tabs cancels capture and restores the page', async () => {
  const h = harness({ active: false });
  await assert.rejects(h.capture(2, 'full'), /Keep the page tab active/);
  assert.equal(h.actions.at(-1), 'restore');
  assert.equal(h.saved, undefined);
  assert.equal(h.opened, undefined);
});

test('an empty PNG is rejected and the capture lock is released', async () => {
  const h = harness({ empty: true });
  await assert.rejects(h.capture(2, 'visible'), /empty screenshot/);
  await assert.rejects(h.capture(2, 'visible'), /empty screenshot/);
  assert.equal(h.actions.filter(action => action === 'restore').length, 2);
  assert.equal(h.saved, undefined);
  assert.equal(h.opened, undefined);
});

test('captures restore before opening preview and save a filename without folders', async () => {
  const h = harness();
  await h.capture(2, 'visible');
  assert.equal(h.actions.at(-1), 'restore');
  assert.match(h.saved.filename, /^A-B-page-visible-.*\.png$/);
  assert.match(h.opened.url, /^preview.html\?id=/);
});
