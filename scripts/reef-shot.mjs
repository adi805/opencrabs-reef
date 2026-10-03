// Capture the town as it currently renders, without verify:world's UI driving.
// verify:world audits layout and clicks controls; this only boots the scene,
// waits for the art textures to exist and writes one PNG. That makes it usable
// on a loaded machine, where the full audit times out.
//
// Usage: npm run shot -- out.png
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';

const out = process.argv[2] ?? 'output/reef-shot.png';
await mkdir(path.dirname(out), { recursive: true });

// A fixed port turns every abandoned run into a blocker for the next one, so
// let vite move on when the port is taken and read the address back from it.
const server = await createServer({ server: { host: '127.0.0.1', port: 5201, strictPort: false } });
await server.listen();
const origin = server.resolvedUrls?.local?.[0] ?? 'http://127.0.0.1:5201/';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1672, height: 940 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${origin}?agents=demo&hour=17`, { waitUntil: 'load' });
  await page.waitForFunction(
    () => {
      const scene = window.__town?.game?.scene?.getScene('town');
      // Frames are registered on the scene's texture manager, not the game's,
      // so asking the game manager for art-tree0 waits forever.
      return !!scene?.scene?.isActive() && scene.textures.exists('art-tree0');
    },
    null,
    { timeout: 90000 },
  );
  // Let residents walk a little and the day/night lights settle before shooting.
  await page.waitForTimeout(4000);
  // Software rendering (SwiftShader) at this viewport needs far more than
  // playwright's 30s default to read back one frame, and continuous animation
  // keeps the compositor busy; freeze it for the capture.
  await page.screenshot({ path: out, timeout: 180000, animations: 'disabled', caret: 'hide' });
  console.log(JSON.stringify({ out, pageErrors: errors.length }));
} finally {
  await browser.close();
  await server.close();
}
