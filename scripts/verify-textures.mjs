// Texture gate: load the real town page and assert the sprite atlases survived.
//
// Why this exists alongside verify:world: verify:world is a full layout audit -
// it boots the town, drives the UI and takes screenshots, slow enough that it is
// sensitive to machine load and to a cold vite dependency cache. This one asks a
// single narrow question, which is the question that matters whenever the atlases
// or the rect scaling in src/art/reference.ts change: did every frame the town
// needs actually get baked, with no errors on the way?
//
// Usage: npm run verify:textures
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright';

// One name per atlas, plus the range ends for vegetation: if a sheet fails to
// decode, or a scaled rect falls off the sheet, its frame is what goes missing.
const REQUIRED_ART = [
  'art-tree0', 'art-tree5', 'art-bush',
  'art-bench', 'art-lamp', 'art-fountain', 'art-dock', 'art-signpost',
  'art-workbench', 'art-telescope', 'art-anvil', 'art-marketStall0',
  'art-noticeBoard',
];

const server = await createServer({ server: { host: '127.0.0.1', port: 5192, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 700 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
  await page.goto('http://127.0.0.1:5192/?agents=demo&hour=17', { waitUntil: 'load' });
  await page.waitForFunction(
    () => window.__town?.game?.scene?.getScene('town')?.scene?.isActive(),
    null,
    { timeout: 90000 },
  );

  const state = await page.evaluate(() => {
    const scene = window.__town.game.scene.getScene('town');
    const keys = scene.textures.getTextureKeys();
    const art = keys.filter((k) => k.startsWith('art-'));
    // Buildings are keyed per instance: b-<id>-lit / b-<id>-dark.
    const lit = keys.filter((k) => /^b-.+-lit$/.test(k));
    return { art: art.sort(), lit: lit.length, total: keys.length };
  });

  const missing = REQUIRED_ART.filter((k) => !state.art.includes(k));
  console.log(JSON.stringify({
    artTextureCount: state.art.length,
    buildingTextures: state.lit,
    totalTextures: state.total,
    missing,
    pageErrors: errors.length,
  }, null, 2));
  for (const e of errors.slice(0, 8)) console.error(e.slice(0, 300));

  assert.deepEqual(missing, [], 'every required art frame must be baked');
  assert.ok(state.art.length >= 30, `expected the full prop/furniture/equipment set, got ${state.art.length}`);
  assert.ok(state.lit > 0, 'no building textures were baked');
  assert.equal(errors.length, 0, 'boot must produce no page or console errors');
  console.log('verify:textures OK');
} finally {
  await browser.close();
  await server.close();
}
