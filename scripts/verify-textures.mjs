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
await new Promise((done) => server.listen(port, '127.0.0.1', done));

const browser = await chromium.launch({ headless: true });
let exitCode = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  await page.goto(`http://127.0.0.1:${port}/?agents=demo&hour=17`, { waitUntil: 'load' });
  await page.waitForFunction(
    () => window.__town?.game?.scene?.getScene('town')?.scene?.isActive(),
    null,
    { timeout: 120000 },
  );

  // Director stability probe. verify:world clicks #director with Playwright's
  // default actionability check, which requires the element's bounding box to be
  // unchanged across consecutive frames. If the toolbar reflows every second the
  // button never settles and that click times out at 30s - which reads as a
  // harness flake but is really a layout bug. Sample the box, do not assume.
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
      const src = scene.textures.get(lit[0]).source[0].data;
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
    return { art: art.sort(), lit: lit.length, total: keys.length, channels };
  });

  const missing = REQUIRED_ART.filter((k) => !state.art.includes(k));
  fs.mkdirSync(path.dirname(shot), { recursive: true });
  await page.screenshot({ path: shot });

  console.log(JSON.stringify({
    artTextureCount: state.art.length,
    buildingTextures: state.lit,
    totalTextures: state.total,
    missing,
    channels: state.channels,
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
