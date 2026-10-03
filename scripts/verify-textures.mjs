// Texture gate: load the real built town page and assert the sprite atlases
// survived, then leave a screenshot behind as the visual witness.
//
// Why this exists alongside verify:world: verify:world is the full layout audit,
// and upstream itself marks it advisory in .github/workflows/ci.yml
// (continue-on-error) because it needs a browser download. This one asks the
// narrow question that matters whenever the atlases or the rect scaling in
// src/art/reference.ts change: did every frame the town needs actually get
// baked, with no errors on the way?
//
// It serves dist/ through the repository's own static handler on purpose. An
// earlier version used vite's dev server, and that watches the working tree: a
// source edit landing mid-run fired a page reload, destroyed the execution
// context, and the failure read like a broken atlas when nothing was broken.
// Built output cannot be reloaded out from under a test.
//
// Usage: npm run build && npm run verify:textures
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';

import { contentTypeFor, resolveStatic } from '../server/lib/staticFiles.mjs';

const repo = path.resolve(import.meta.dirname, '..');
const dist = path.join(repo, 'dist');
const port = Number(process.env.REEF_VERIFY_PORT ?? 5241);
const shot = process.env.REEF_VERIFY_SHOT
  ? path.resolve(repo, process.env.REEF_VERIFY_SHOT)
  : path.join(repo, 'docs/evidence/m2-reef.png');

if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('dist/index.html is missing: run `npm run build` first.');
  process.exit(1);
}

// One name per atlas, plus the range ends for vegetation: if a sheet fails to
// decode, or a scaled rect falls off the sheet, its frame is what goes missing.
const REQUIRED_ART = [
  'art-tree0', 'art-tree5', 'art-bush',
  'art-bench', 'art-lamp', 'art-fountain', 'art-dock', 'art-signpost',
  'art-workbench', 'art-telescope', 'art-anvil', 'art-marketStall0',
  'art-noticeBoard',
];

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const found = resolveStatic(dist, url.pathname === '/' ? '/index.html' : url.pathname);
  if (!found.ok) {
    res.writeHead(found.reason === 'missing' ? 404 : 403, { 'Content-Type': 'text/plain' });
    res.end(found.reason);
    return;
  }
  res.writeHead(200, { 'Content-Type': contentTypeFor(found.file), 'Cache-Control': 'no-store' });
  fs.createReadStream(found.file).pipe(res);
});
// A busy port must not be able to kill the gate. A wrapper that SIGTERMs a run
// leaves its server behind, and the next run then died at listen() with an
// unhandled EADDRINUSE before it had loaded a single page: the log reads like a
// gate failure when the code under test was never exercised. Bind the requested
// port, fall back to an ephemeral one if it is taken, and always fetch the page
// from the port actually bound.
function listenOn(srv, preferred) {
  const attempt = (p) => new Promise((resolve, reject) => {
    const onError = (e) => { srv.off('listening', onListening); reject(e); };
    const onListening = () => { srv.off('error', onError); resolve(srv.address().port); };
    srv.once('error', onError);
    srv.once('listening', onListening);
    srv.listen(p, '127.0.0.1');
  });
  return attempt(preferred).catch((e) => {
    if (e.code !== 'EADDRINUSE') throw e;
    console.warn(`port ${preferred} is in use; falling back to an ephemeral port`);
    return attempt(0);
  });
}
const boundPort = await listenOn(server, port);

const browser = await chromium.launch({ headless: true });
let exitCode = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  await page.goto(`http://127.0.0.1:${boundPort}/?agents=demo&hour=17`, { waitUntil: 'load' });
  await page.waitForFunction(
    () => window.__town?.game?.scene?.getScene('town')?.scene?.isActive(),
    null,
    { timeout: 120000 },
  );

  // Capture the frame FIRST. The witness is the point of this gate, and the
  // probes below are the fragile part: a director sample that loses its browser
  // must not be able to take the screenshot down with it. The old ordering put
  // the capture last and a dead browser therefore left no frame at all.
  await page.waitForTimeout(8000);
  fs.mkdirSync(path.dirname(shot), { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const capture = await Promise.race([
    cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }),
    new Promise((_resolve, reject) => setTimeout(
      () => reject(new Error('screenshot budget of 120s exhausted')), 120000,
    )),
  ]);
  fs.writeFileSync(shot, Buffer.from(capture.data, 'base64'));
  console.log(`screenshot ${path.relative(repo, shot)} ${fs.statSync(shot).size} bytes`);

  // Director stability probe. verify:world clicks #director with Playwright's
  // default actionability check, which requires the element's bounding box to be
  // unchanged across consecutive frames. If the toolbar reflows every second the
  // button never settles and that click times out at 30s - which reads as a
  // harness flake but is really a layout bug. Sample the box, do not assume.
  // The probe is advisory: it answers "does the toolbar reflow". Losing the
  // browser while sampling it must not fail a run whose frame is already saved.
  try {
    const boxes = [];
    for (let i = 0; i < 6; i++) {
      boxes.push(await page.locator('#director').boundingBox().catch(() => null));
      await page.waitForTimeout(1000);
    }
    // Compare against the same filtered array: indexing the raw `boxes` here would
    // pair a sampled box with the wrong neighbour and invent movement.
    const sampled = boxes.filter(Boolean);
    const moved = sampled.length > 1 && sampled.slice(1).some(
      (b, i) => Math.abs(b.x - sampled[i].x) > 0.5 || Math.abs(b.y - sampled[i].y) > 0.5,
    );
    const firstBox = sampled[0];
    const lastBox = sampled[sampled.length - 1];
    console.log(`DIRECTOR n=${sampled.length} x=${firstBox?.x}->${lastBox?.x} y=${firstBox?.y}->${lastBox?.y} moved=${moved}`);
  } catch (e) {
    console.warn('director probe skipped: ' + String(e).split('\n')[0]);
  }

  const state = await page.evaluate(() => {
    const scene = window.__town.game.scene.getScene('town');
    const keys = scene.textures.getTextureKeys();
    const art = keys.filter((k) => k.startsWith('art-'));
    // Buildings are keyed per instance: b-<id>-lit / b-<id>-dark.
    const lit = keys.filter((k) => /^b-.+-lit$/.test(k));
    // Report the mean colour of one baked building texture. The reef grade in
    // src/art/reference.ts pushes red down and blue up, so r>b here would mean
    // the grade never ran. It is reported, not asserted: whether the town reads
    // as submerged is a judgement made by looking at the screenshot below, and a
    // threshold invented from the palette would just be a guess with exit codes.
    let channels = null;
    if (lit.length) {
      // Phaser's TextureSource carries no pixel buffer: `.data` is undefined and
      // reading `.width` off it threw. getSourceImage() returns the canvas or
      // image the texture was built from, which is what drawImage accepts.
      const src = scene.textures.get(lit[0]).getSourceImage();
      if (!src) throw new Error('building texture ' + lit[0] + ' has no source image');
      const c = document.createElement('canvas');
      c.width = src.width; c.height = src.height;
      const cx = c.getContext('2d');
      cx.drawImage(src, 0, 0);
      const d = cx.getImageData(0, 0, c.width, c.height).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 128) continue;
        r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
      }
      if (n) channels = { texture: lit[0], opaquePixels: n, r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
    }
    // Residents are reported, not asserted. The HUD can claim live sessions
    // while the scene draws none, and a whole frame of empty streets is a
    // rendering bug, not a lull. Count what the scene actually put on screen.
    const sim = window.__town.sim;
    const residents = [...sim.residents.values()].map((r) => ({
      id: r.id, kind: r.kind, x: Math.round(r.x), y: Math.round(r.y), state: r.state,
    }));
    const drawn = [...scene.views.values()].filter((v) => v.sprite.visible).length;
    return {
      art: art.sort(), lit: lit.length, total: keys.length, channels,
      residents: residents.length, residentsDrawn: drawn, residentSample: residents.slice(0, 3),
    };
  });

  const missing = REQUIRED_ART.filter((k) => !state.art.includes(k));

  // Print the measured numbers before the capture: a slow or failed screenshot
  // must not take the diagnostics down with it. This exact ordering cost a whole
  // run - the shot timed out and the JSON that would have explained the frame
  // was never written.
  console.log(JSON.stringify({
    artTextureCount: state.art.length,
    buildingTextures: state.lit,
    totalTextures: state.total,
    missing,
    channels: state.channels,
    residents: state.residents,
    residentsDrawn: state.residentsDrawn,
    residentSample: state.residentSample,
    pageErrors: errors.length,
    screenshot: path.relative(repo, shot),
  }, null, 2));
  for (const e of errors.slice(0, 8)) console.error(e.slice(0, 300));

  assert.deepEqual(missing, [], 'every required art frame must be baked');
  assert.ok(state.art.length >= 30, `expected the full prop/furniture/equipment set, got ${state.art.length}`);
  assert.ok(state.lit > 0, 'no building textures were baked');
  assert.equal(errors.length, 0, 'boot must produce no page or console errors');
  console.log('verify:textures OK');
} catch (e) {
  console.error(String(e).split('\n').slice(0, 4).join('\n'));
  exitCode = 1;
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
process.exit(exitCode);
