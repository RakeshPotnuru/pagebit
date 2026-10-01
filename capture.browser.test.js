const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const sharp = require('sharp');

let context, worker, server, directory, url;
before(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pagebit-regression-'));
  for (const file of await fs.readdir(__dirname)) {
    if (/\.(js|html|css|json)$/.test(file) && !file.includes('.test.')) {
      await fs.copyFile(path.join(__dirname, file), path.join(directory, file));
    }
  }
  await fs.cp(path.join(__dirname, 'icons'), path.join(directory, 'icons'), { recursive:true });
  const manifest = JSON.parse(await fs.readFile(path.join(directory, 'manifest.json')));
  // Only this disposable test copy receives host access instead of a toolbar gesture.
  manifest.host_permissions = ['<all_urls>'];
  await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest));
  server = http.createServer((_request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end(`<!doctype html><style>
      * { box-sizing: border-box } body { margin:0; background:white }
      section { height:600px; opacity:0; transition:opacity .15s }
      section:nth-child(1) { background:rgb(200,30,40) }
      section:nth-child(2) { background:rgb(20,180,60) }
      section:nth-child(3) { background:rgb(40,60,210) }
      #element { position:absolute; left:70px; top:80px; width:300px; height:900px;
        background:linear-gradient(rgb(255,100,0) 50%,rgb(0,100,255) 50%); }
      #modal { position:fixed; left:200px; top:100px; width:320px; height:250px;
        background:rgb(0,170,170); z-index:20; display:none; }
      #modal button { margin:20px }
    </style><section></section><section></section><section></section>
    <div id="element"></div><div role="dialog" id="modal"><button>Keep open</button></div>
    <script>
      const observer = new IntersectionObserver(entries => entries.forEach(entry => {
        if(entry.isIntersecting) entry.target.style.opacity = 1;
      }));
      document.querySelectorAll('section').forEach(element => observer.observe(element));
    </script>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.address().port}`;
  context = await chromium.launchPersistentContext(path.join(directory, 'profile'), {
    channel: 'chromium', headless: true, viewport: { width:800, height:600 },
    args: [`--disable-extensions-except=${directory}`, `--load-extension=${directory}`]
  });
  worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
});
after(async () => {
  await context?.close();
  await new Promise(resolve => server ? server.close(resolve) : resolve());
  if (directory) await fs.rm(directory, { recursive:true, force:true });
});

async function captureFixture(mode, setup, clickSelection = false, deviceScaleFactor = 1) {
  const page = await context.newPage();
  await page.goto(url);
  await page.evaluate(setup);
  if (deviceScaleFactor !== 1) {
    const client = await context.newCDPSession(page);
    await client.send('Emulation.setDeviceMetricsOverride', {
      width:800, height:600, deviceScaleFactor, mobile:false
    });
  }
  const tabId = await worker.evaluate(async url => (await chrome.tabs.query({ url: `${url}/*` })).at(-1).id, url);
  if (clickSelection) {
    await worker.evaluate(async tabId => {
      await chrome.scripting.executeScript({ target:{tabId}, files:['select-element.js'] });
    }, tabId);
    const preview = context.waitForEvent('page');
    await page.mouse.move(480,280);
    await page.mouse.click(480,280);
    await preview;
  } else {
    await worker.evaluate(async ({tabId,mode}) => {
      await chrome.scripting.executeScript({ target:{tabId}, func:() => {
        window.__pagebitSelectedElement = document.querySelector('#modal').style.display === 'block'
          ? document.querySelector('#modal') : document.querySelector('#element');
      }});
      await capture(tabId,mode);
    }, {tabId,mode});
  }
  const bytes = await worker.evaluate(async () => {
    const db = await openCaptureDb();
    const captures = await new Promise(resolve => {
      const request = db.transaction('captures').objectStore('captures').getAll();
      request.onsuccess = () => resolve(request.result);
    });
    const capture = captures.sort((a,b) => a.filename.localeCompare(b.filename)).at(-1);
    const result = Array.from(new Uint8Array(await capture.blob.arrayBuffer()));
    db.close(); return result;
  });
  const png = Buffer.from(bytes);
  const metadata = await sharp(png).metadata();
  const pixel = async (x,y) => Array.from(await sharp(png).extract({left:x,top:y,width:1,height:1}).removeAlpha().raw().toBuffer());
  if (mode === 'visible') {
    const preview = context.pages().find(tab => tab.url().includes('/preview.html'));
    await preview.waitForFunction(() => !document.querySelector('#image').hidden);
    await preview.bringToFront();
    await preview.locator('#copy').click();
    await preview.waitForFunction(() => document.querySelector('#status').textContent !== 'Screenshot preview', null, { timeout:5000 });
    assert.equal(await preview.locator('#status').innerText(), 'Copied to clipboard.');
    await preview.evaluate(() => {
      const download = chrome.downloads.download.bind(chrome.downloads);
      chrome.downloads.download = options => { window.downloadOptions = options; return download(options); };
    });
    const completed = preview.waitForEvent('download');
    await preview.locator('#download').click();
    const download = await completed;
    await preview.waitForFunction(() => document.querySelector('#status').textContent === 'Download started.');
    const options = await preview.evaluate(() => window.downloadOptions);
    assert.equal(options.filename.includes('/'), false);
    assert.match(options.filename, /-visible-.*\.png$/);
    assert.deepEqual(await fs.readFile(await download.path()), png);

  }
  const restored = await page.evaluate(() => ({ x:scrollX, y:scrollY, pointerDown:window.pointerDown || 0, scrolls:window.scrolls || 0, nestedY:document.querySelector('#scroller')?.scrollTop ?? null }));
  for (const tab of context.pages()) if (tab !== page && tab.url().includes('/preview.html')) await tab.close();
  await worker.evaluate(async () => {
    const db = await openCaptureDb();
    const records = await new Promise(resolve => {
      const request = db.transaction('captures').objectStore('captures').getAll();
      request.onsuccess = () => resolve(request.result);
    });
    db.close();
    if (records.length) throw new Error('Closing the preview retained a capture.');
  });
  await page.close();
  await worker.evaluate(async () => {
    const db = await openCaptureDb();
    await new Promise(resolve => {
      const tx = db.transaction('captures','readwrite'); tx.objectStore('captures').clear(); tx.oncomplete=resolve;
    });
    db.close();
  });
  return { metadata, pixel, restored };
}

test('element capture includes its bottom beyond the viewport', async () => {
  const result = await captureFixture('element', () => {});
  assert.equal(result.metadata.width, 300);
  assert.equal(result.metadata.height, 900);
  assert.deepEqual(await result.pixel(150,850), [0,100,255]);
  assert.equal(result.restored.y, 0);
});

test('a fixed dialog on a scrolled page is captured at its visible location', async () => {
  const result = await captureFixture('element', () => {
    document.querySelector('#modal').style.display='block'; scrollTo(0,650);
  });
  assert.equal(result.metadata.width,320);
  assert.equal(result.metadata.height,250);
  assert.deepEqual(await result.pixel(160,180), [0,170,170]);
  assert.equal(result.restored.y,650);
});

test('full page captures sections revealed by scrolling and restores the initial scroll', async () => {
  const result = await captureFixture('full', () => {
    document.querySelector('#element').remove(); scrollTo(0,120);
  });
  assert.equal(result.metadata.height,1800);
  assert.deepEqual(await result.pixel(500,900), [20,180,60]);
  assert.deepEqual(await result.pixel(500,1500), [40,60,210]);
  assert.equal(result.restored.y,120);
});


test('selection suppresses dialog pointer handlers and captures without scrolling', async () => {
  const result = await captureFixture('element', () => {
    document.querySelector('#modal').style.display='block';
    document.addEventListener('pointerdown', () => {
      window.pointerDown = (window.pointerDown || 0) + 1;
      document.querySelector('#modal').style.display='none';
    });
    window.addEventListener('scroll', () => { window.scrolls = (window.scrolls || 0) + 1; });
  }, true);
  assert.equal(result.metadata.width,320);
  assert.equal(result.metadata.height,250);
  assert.deepEqual(await result.pixel(160,180), [0,170,170]);
  assert.equal(result.restored.pointerDown,0);
  assert.equal(result.restored.scrolls,0);
});

test('full capture keeps large sticky content and renders a fixed header only once', async () => {
  const result = await captureFixture('full', () => {
    document.querySelector('#element').remove();
    const header = document.createElement('header');
    header.style.cssText='position:fixed;inset:0 0 auto;height:40px;background:rgb(10,10,10);z-index:30';
    document.body.append(header);
    const second = document.querySelectorAll('section')[1];
    second.textContent='Sticky content';
    second.style.position='sticky'; second.style.top='0';
  });
  assert.deepEqual(await result.pixel(500,20), [10,10,10]);
  assert.deepEqual(await result.pixel(500,620), [20,180,60]);
});


test('native top-layer dialogs can be selected and captured', async () => {
  const result = await captureFixture('element', () => {
    document.querySelector('#modal').remove();
    const dialog = document.createElement('dialog');
    dialog.id='modal'; dialog.style.cssText='display:block;margin:0;padding:0;border:0';
    document.body.append(dialog); dialog.showModal();
  }, true);
  assert.equal(result.metadata.width,320);
  assert.equal(result.metadata.height,250);
  assert.deepEqual(await result.pixel(160,180), [0,170,170]);
});


test('visible capture produces a decodable preview, clipboard PNG, and direct download', async () => {
  const result = await captureFixture('visible', () => {});
  assert.equal(result.metadata.width,800);
  assert.equal(result.metadata.height,600);
  assert.deepEqual(await result.pixel(760,560), [200,30,40]);
});

async function openAction(page) {
  const popup = await context.newPage();
  await page.bringToFront();
  const closed = popup.waitForEvent('close');
  await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
  await closed;
}

test('starting a capture closes the popup and the next opening cancels it', async () => {
  const page = await context.newPage();
  await page.goto(url);
  const popup = await context.newPage();
  await page.bringToFront();
  await popup.goto(`chrome-extension://${new URL(worker.url()).host}/popup.html`);
  await popup.waitForFunction(() => !document.querySelector('[data-mode="full"]').disabled);
  const closed = popup.waitForEvent('close');
  await popup.locator('[data-mode="full"]').evaluate(button => button.click());
  await closed;
  await page.waitForFunction(() => [...document.querySelectorAll('style')].some(style => style.textContent.includes('scrollbar-color:transparent')));
  await openAction(page);
  await page.waitForFunction(() => ![...document.querySelectorAll('style')].some(style => style.textContent.includes('scrollbar-color:transparent')));
  assert.equal(await worker.evaluate(() => captureState === null), true);
  await page.close();
});

test('extension icon exits element selection and restores page interaction', async () => {
    const page = await context.newPage();
    await page.goto(url);
    await page.evaluate(() => {
      document.querySelector('#modal').style.display = 'block';
      document.addEventListener('pointerdown', () => { window.pointerDown = (window.pointerDown || 0) + 1; });
    });
    const tabId = await worker.evaluate(async url => (await chrome.tabs.query({url:`${url}/*`})).at(-1).id, url);
    await worker.evaluate(async tabId => {
      await chrome.scripting.executeScript({target:{tabId}, files:['select-element.js']});
    }, tabId);
    await page.mouse.move(480,280);
    assert.equal(await page.getByRole('button', {name:'Cancel', exact:true}).count(), 0);
    await openAction(page);
    assert.equal(await page.getByRole('button', {name:'Cancel', exact:true}).count(), 0);
    assert.equal(await worker.evaluate(() => captureState === null), true);
    await page.getByRole('button', {name:'Keep open'}).click();
    assert.equal(await page.evaluate(() => window.pointerDown), 1);
    await page.close();
});

test('opening the extension stops capture without on-page controls', async () => {
  const page = await context.newPage();
  await page.goto(url);
  await page.evaluate(() => scrollTo(0,120));
  const tabId = await worker.evaluate(async url => (await chrome.tabs.query({url:`${url}/*`})).at(-1).id, url);
  const pending = worker.evaluate(async tabId => {
    try { await capture(tabId,'full'); return 'completed'; }
    catch (error) { return error.message; }
  }, tabId);
  await page.waitForFunction(() => [...document.querySelectorAll('style')].some(style => style.textContent.includes('scrollbar-color:transparent')));
  assert.equal(await page.getByRole('button', {name:'Cancel', exact:true}).count(), 0);
  await openAction(page);
  assert.equal(await pending, 'Capture cancelled.');
  assert.equal(await page.evaluate(() => scrollY), 120);
  assert.equal(await page.getByRole('button', {name:'Cancel', exact:true}).count(), 0);
  assert.equal(await worker.evaluate(async () => {
    const db = await openCaptureDb();
    const count = await new Promise(resolve => {
      const request = db.transaction('captures').objectStore('captures').count();
      request.onsuccess = () => resolve(request.result);
    });
    db.close(); return count;
  }), 0);
  await page.close();
});

test('visible capture hides a styled nested scrollbar without removing its content', async () => {
  const result = await captureFixture('visible', () => {
    const element = document.querySelector('#element');
    element.style.cssText='position:absolute;left:70px;top:80px;width:300px;height:200px;overflow:scroll;background:rgb(10,200,100)';
    element.innerHTML='<div style="height:900px"></div>';
    const style=document.createElement('style');
    style.textContent='#element::-webkit-scrollbar{width:20px} #element::-webkit-scrollbar-thumb{background:red} #element::-webkit-scrollbar-track{background:magenta}';
    document.head.append(style);
  });
  assert.deepEqual(await result.pixel(360,120), [10,200,100]);
});


test('a selected element inside a scrolling container is captured completely', async () => {
  const result = await captureFixture('element', () => {
    const element = document.querySelector('#element');
    const scroller = document.createElement('div');
    scroller.id='scroller';
    scroller.style.cssText='position:absolute;left:70px;top:80px;width:300px;height:200px;overflow:auto';
    element.replaceWith(scroller);
    element.style.cssText='position:relative;left:0;top:0;width:300px;height:900px;background:linear-gradient(rgb(255,100,0) 50%,rgb(0,100,255) 50%)';
    scroller.append(element);
  });
  assert.equal(result.metadata.width,300);
  assert.equal(result.metadata.height,900);
  assert.deepEqual(await result.pixel(150,850),[0,100,255]);
  assert.equal(result.restored.nestedY,0);
  assert.equal(result.restored.y,0);
});

test('emulated display scale does not distort element crop', async () => {
  const result = await captureFixture('element', () => {}, false, 2);
  assert.equal(result.metadata.width,300);
  assert.equal(result.metadata.height,900);
  assert.deepEqual(await result.pixel(150,850),[0,100,255]);
});

test('stored captures are pruned and can be deleted explicitly', async () => {
  const result = await worker.evaluate(async () => {
    const old=Date.now()-2*24*60*60*1000;
    for(let i=0;i<22;i++) await saveCapture({id:`retention-${i}`,filename:`${i}.png`,blob:new Blob(['png'])});
    const db=await openCaptureDb();
    await new Promise(resolve=>{
      const tx=db.transaction('captures','readwrite');
      const request=tx.objectStore('captures').get('retention-21');
      request.onsuccess=()=>tx.objectStore('captures').put({...request.result,savedAt:old});
      tx.oncomplete=resolve;
    });
    db.close();
    await saveCapture({id:'retention-last',filename:'last.png',blob:new Blob(['png'])});
    const expired=!!await getCapture('retention-21');
    await deleteCapture('retention-last');
    const deleted=await getCapture('retention-last');
    const check=await openCaptureDb();
    const count=await new Promise(resolve=>{
      const request=check.transaction('captures').objectStore('captures').count();
      request.onsuccess=()=>resolve(request.result);
    });
    await new Promise(resolve=>{const tx=check.transaction('captures','readwrite');tx.objectStore('captures').clear();tx.oncomplete=resolve});
    check.close();
    return {expired,deleted,count};
  });
  assert.equal(result.expired,false);
  assert.equal(result.deleted,undefined);
  assert.ok(result.count<=20);
});

test('Delete removes the screenshot and disables preview actions', async () => {
  const id=`delete-test-${Date.now()}`;
  await worker.evaluate(async id => {
    await saveCapture({id,filename:'delete-test.png',blob:new Blob(['png'],{type:'image/png'})});
  },id);
  // A valid image is needed for the preview to enable its actions.
  const imageBytes=await sharp({create:{width:2,height:2,channels:4,background:'#176f5b'}}).png().toBuffer();
  await worker.evaluate(async ({id,bytes}) => {
    await saveCapture({id,filename:'delete-test.png',blob:new Blob([new Uint8Array(bytes)],{type:'image/png'})});
  },{id,bytes:[...imageBytes]});
  const preview=await context.newPage();
  await preview.goto(`chrome-extension://${new URL(worker.url()).host}/preview.html?id=${id}`);
  await preview.waitForFunction(() => !document.querySelector('#image').hidden);
  await preview.locator('#delete').click();
  await preview.waitForFunction(() => document.querySelector('#status').textContent === 'Screenshot deleted.');
  assert.equal(await preview.locator('#download').isDisabled(),true);
  assert.equal(await preview.locator('#copy').isDisabled(),true);
  assert.equal(await worker.evaluate(async id => await getCapture(id),id),undefined);
  await preview.close();
});

test('opening the extension cancels consecutive captures and clears progress', async () => {
  const page = await context.newPage();
  await page.goto(url);
  const tabId = await worker.evaluate(async url => (await chrome.tabs.query({url:`${url}/*`})).at(-1).id, url);
  for (let attempt = 0; attempt < 2; attempt++) {
    const pending = worker.evaluate(async tabId => {
      try { await capture(tabId,'full'); return 'completed'; }
      catch (error) { return error.message; }
    }, tabId);
    await page.waitForFunction(() => [...document.querySelectorAll('style')].some(style => style.textContent.includes('scrollbar-color:transparent')));
    await openAction(page);
    assert.equal(await pending, 'Capture cancelled.');
    assert.equal(await worker.evaluate(async tabId => chrome.action.getBadgeText({tabId}), tabId), '');
  }
  await page.close();
});

test('browser zoom preserves a tall element crop', async () => {
  const result=await captureFixture('element',()=>{document.body.style.zoom='125%'});
  assert.equal(result.metadata.width,375);
  assert.equal(result.metadata.height,1125);
  assert.deepEqual(await result.pixel(180,1060),[0,100,255]);
});

test('navigation during capture clears progress without saving a PNG', async () => {
  const page=await context.newPage();
  await page.goto(url);
  const tabId=await worker.evaluate(async url=>(await chrome.tabs.query({url:`${url}/*`})).at(-1).id,url);
  const pending=worker.evaluate(async tabId=>{
    try{await capture(tabId,'full');return 'completed'}catch(error){return error.message}
  },tabId);
  await page.waitForTimeout(500);
  await page.goto(`${url}/navigated`);
  assert.notEqual(await pending,'completed');
  assert.equal(await worker.evaluate(async tabId=>await chrome.action.getBadgeText({tabId}),tabId),'');
  assert.equal(await page.evaluate(()=>!!window.__pagebitCapture),false);
  await page.close();
});

test('large captures fail clearly and restore the page', async () => {
  const page=await context.newPage();
  await page.goto(url);
  await page.evaluate(()=>{document.body.style.minHeight='200000px';scrollTo(0,120)});
  const tabId=await worker.evaluate(async url=>(await chrome.tabs.query({url:`${url}/*`})).at(-1).id,url);
  const result=await worker.evaluate(async tabId=>{
    try{await capture(tabId,'full');return 'completed'}catch(error){return error.message}
  },tabId);
  assert.match(result,/too large/);
  assert.equal(await page.evaluate(()=>scrollY),120);
  assert.equal(await worker.evaluate(async tabId=>await chrome.action.getBadgeText({tabId}),tabId),'');
  await page.close();
});

test('restricted browser pages fail without retaining progress or a capture', async () => {
  const page=await context.newPage();
  await page.goto('chrome://extensions/');
  const tabId=await worker.evaluate(async()=> (await chrome.tabs.query({active:true,currentWindow:true}))[0].id);
  const result=await worker.evaluate(async tabId=>{
    try{await capture(tabId,'visible');return 'completed'}catch(error){return error.message}
  },tabId);
  assert.notEqual(result,'completed');
  assert.equal(await worker.evaluate(async tabId=>await chrome.action.getBadgeText({tabId}),tabId),'');
  await page.close();
});

test('switching to another tab cancels capture and restores page styles', async () => {
  const page=await context.newPage();
  await page.goto(url);
  await page.evaluate(()=>scrollTo(0,120));
  const tabId=await worker.evaluate(async url=>(await chrome.tabs.query({url:`${url}/*`})).at(-1).id,url);
  const pending=worker.evaluate(async tabId=>{
    try{await capture(tabId,'full');return 'completed'}catch(error){return error.message}
  },tabId);
  await page.waitForTimeout(500);
  const other=await context.newPage();
  await other.goto(url);
  assert.match(await pending,/Keep the page tab active/);
  assert.deepEqual(await page.evaluate(()=>({
    y:scrollY,
    captureStyle:[...document.querySelectorAll('style')].some(style=>style.textContent.includes('scrollbar-color:transparent'))
  })),{y:120,captureStyle:false});
  await other.close();
  await page.close();
});
