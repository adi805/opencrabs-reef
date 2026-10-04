/**
 * Procedural reef furniture and equipment.
 *
 * `furniture.png` and `equipment.png` are authored for a dry-land village:
 * park benches, garden planters, upright headstones, an astronomical
 * telescope, notice boards, a post box. `submerge()` cools their colour but
 * never their silhouette, and a headstone still reads as a headstone after
 * the tint. Once the ground, the flora and the buildings were remapped these
 * were the loudest land tells left in the frame, so they are painted here.
 *
 * Every painter returns a canvas of exactly `worldW*2 x worldH*2`: the same
 * footprint `ReferenceArt.furniture()` / `.equipment()` produced, so the
 * placement code in TownScene needs no change at all.
 */
import { Painter, mulberry } from './painter';
import { submerge } from './reference';

/** Device texels per world pixel, the ratio every atlas frame is drawn at. */
const S = 2;
const CORAL = { body: '#b96b7f', lit: '#d99a92', dark: '#6b3446' };
const SHELL = { body: '#d8c3b0', lit: '#f2e6d8', dark: '#8d7261' };
const ANEM = { body: '#7d6bb9', lit: '#b09fd9', dark: '#4a3d70' };
const TUBE = { body: '#c98a5e', lit: '#e8b98c', dark: '#7a4f33' };
const KELP = { body: '#4e6a34', lit: '#7fa04a', dark: '#2b3a22' };
const BASALT = { body: '#5d5a63', lit: '#7d7a86', dark: '#33313a' };
const GLOW = '#78dcc8';

type Rng = () => number;
interface Ink { readonly body: string; readonly lit: string; readonly dark: string }

/** A lumpy mound resting on the ground line: brain coral, a rubble heap. */
function mound(p: Painter, cx: number, baseY: number, w: number, h: number, c: Ink, r: Rng): void {
  const hw = Math.max(2, Math.round(w / 2));
  for (let y = 0; y < h; y++) {
    const t = y / Math.max(1, h - 1);
    const row = Math.max(1, Math.round(hw * Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t)))));
    const yy = baseY - h + y + 1;
    p.rect(cx - row, yy, row * 2, 1, t < 0.24 ? c.lit : c.body);
    p.px(cx - row, yy, c.dark);
    p.px(cx + row - 1, yy, c.dark);
  }
  // Brain-coral meanders: short vertical grooves, the read that says "coral"
  // rather than "smooth boulder".
  const grooves = Math.max(3, Math.round(w / 5));
  for (let i = 0; i < grooves; i++) {
    const x = cx - hw + 2 + Math.round(r() * Math.max(1, hw * 2 - 4));
    p.vline(x, baseY - h + 3, Math.max(2, h - 4), c.dark);
    p.vline(x + 1, baseY - h + 4, Math.max(1, h - 6), c.lit);
  }
}

/** A tapered column: a stalk, a vent throat, a marker post. */
function stalk(p: Painter, cx: number, yTop: number, yBot: number, halfTop: number, halfBot: number, c: Ink): void {
  for (let y = yTop; y <= yBot; y++) {
    const t = (y - yTop) / Math.max(1, yBot - yTop);
    const hw = Math.max(1, Math.round(halfTop + (halfBot - halfTop) * t));
    p.rect(cx - hw, y, hw * 2, 1, c.body);
    p.px(cx - hw, y, c.dark);
    p.px(cx + hw - 1, y, c.dark);
  }
}

/** A flat slab on stubby legs: bench, workbench, desk, counter. */
function slab(p: Painter, W: number, H: number, c: Ink, legH: number): void {
  const top = Math.max(1, H - legH - Math.max(2, Math.round(H * 0.22)));
  const th = Math.max(2, Math.round(H * 0.22));
  p.rect(1, top, W - 2, th, c.body);
  p.hline(1, top, W - 2, c.lit);
  p.hline(1, top + th - 1, W - 2, c.dark);
  const inset = Math.max(2, Math.round(W * 0.12));
  p.rect(inset, top + th, Math.max(2, Math.round(W * 0.1)), legH, c.dark);
  p.rect(W - inset - Math.max(2, Math.round(W * 0.1)), top + th, Math.max(2, Math.round(W * 0.1)), legH, c.dark);
}

/** A table-coral ledge: a low, wide shelf with a flat top. The bench. */
function ledge(p: Painter, W: number, H: number, r: Rng): void {
  const baseY = H - 1, mid = Math.round(W / 2);
  const h = Math.max(4, Math.round(H * 0.6));
  const hw = Math.max(2, mid - 1);
  for (let y = 0; y < h; y++) {
    const t = y / Math.max(1, h - 1);
    const row = Math.max(1, Math.round(hw * (0.74 + 0.26 * Math.sin(t * Math.PI))));
    const yy = baseY - h + y + 1;
    p.rect(mid - row, yy, row * 2, 1, y < 2 ? CORAL.lit : CORAL.body);
    p.px(mid - row, yy, CORAL.dark);
    p.px(mid + row - 1, yy, CORAL.dark);
  }
  // Radiating ridges along the shelf are what say "table coral" rather than
  // "a flat rock": the same read the brain-coral grooves give the mounds.
  const ridges = Math.max(3, Math.round(W / 7));
  for (let i = 0; i < ridges; i++) {
    const x = mid - hw + 2 + Math.round(r() * Math.max(1, hw * 2 - 4));
    p.vline(x, baseY - h + 2, Math.max(2, h - 3), CORAL.dark);
  }
  for (let i = 0; i < 3; i++) p.disc(2 + Math.round(r() * Math.max(1, W - 4)), baseY - h + 1, 1, CORAL.lit);
}

/** A shell trough holding a cluster of anemones: planter, flower box. */
function anemoneBed(p: Painter, W: number, H: number, r: Rng): void {
  // A rubble bank, not a planter. The old version drew a rectangular trough
  // with a lit rim, and the vision pass named it every time: "rectangular
  // troughs, they read as garden planters or raised beds". Shell rubble
  // piles up in an uneven bank, so build the bed from overlapping discs.
  const baseY = H - 1;
  const bank = Math.max(3, Math.round(H * 0.34));
  for (let x = 1; x < W - 1; x += 2 + Math.round(r() * 2)) {
    const hh = Math.max(2, Math.round(bank * (0.6 + r() * 0.7)));
    p.disc(x, baseY - Math.round(hh * 0.35), hh, r() < 0.5 ? SHELL.body : SHELL.dark);
  }
  for (let x = 1; x < W - 2; x += 3 + Math.round(r() * 3)) {
    p.px(x, baseY - Math.round(bank * 0.5), SHELL.lit);
  }
  const n = Math.max(3, Math.round(W / 9));
  for (let i = 0; i < n; i++) {
    const cx = 3 + Math.round(((W - 6) * i) / Math.max(1, n - 1)) + Math.round((r() - 0.5) * 2);
    const top = baseY - bank - 1;
    const h = 4 + Math.round(r() * Math.max(2, H * 0.3));
    for (let k = 0; k < 5; k++) {
      const dx = Math.round(Math.sin((k / 5) * Math.PI * 2) * 2);
      p.vline(cx + dx, top - h, h, k % 2 ? ANEM.body : ANEM.lit);
      p.px(cx + dx, top - h - 1, ANEM.lit);
    }
    p.disc(cx, top, 1, ANEM.dark);
  }
}

/** A shell drum with two ribs: barrel. */
function drum(p: Painter, W: number, H: number): void {
  const w = Math.max(4, Math.round(W * 0.66)), x = Math.round((W - w) / 2);
  p.box(x, 2, w, H - 3, SHELL.body, SHELL.dark);
  p.hline(x + 1, 2, w - 2, SHELL.lit);
  p.hline(x, Math.round(H * 0.38), w, SHELL.dark);
  p.hline(x, Math.round(H * 0.68), w, SHELL.dark);
  p.vline(x + 1, 3, H - 5, SHELL.lit);
}

/** A shell crate with panel lines: crate. */
function crate(p: Painter, W: number, H: number): void {
  p.box(1, 2, W - 2, H - 3, SHELL.body, SHELL.dark);
  p.hline(2, 3, W - 4, SHELL.lit);
  p.hline(1, Math.round(H * 0.55), W - 2, SHELL.dark);
  p.vline(Math.round(W / 2), 3, H - 5, SHELL.dark);
  p.px(2, H - 3, SHELL.dark); p.px(W - 3, H - 3, SHELL.dark);
}

/** A plaque on a stalk: notice board, sign post. */
function plaque(p: Painter, W: number, H: number, c: Ink, postH: number): void {
  const cx = Math.round(W / 2);
  const boardH = Math.max(4, H - postH - 3);
  stalk(p, cx, H - postH, H - 1, 1, 1, c);
  p.box(1, 1, W - 2, boardH, c.body, c.dark);
  p.hline(2, 2, W - 4, c.lit);
  for (let y = 4; y < boardH - 1; y += 3) p.hline(3, y, Math.max(2, W - 6), c.dark);
}

/** A kelp frond banner hanging from a ridge: banner. */
function frond(p: Painter, W: number, H: number, r: Rng): void {
  p.hline(0, 0, W, KELP.dark);
  p.hline(0, 1, W, KELP.body);
  const blades = Math.max(2, Math.round(W / 8));
  for (let i = 0; i < blades; i++) {
    const x = 2 + Math.round(((W - 4) * i) / Math.max(1, blades - 1));
    const h = Math.round(H * (0.5 + r() * 0.45));
    for (let y = 2; y < h; y++) {
      const sway = Math.round(Math.sin((y / 8) + i) * (y / 22));
      p.px(x + sway, y, KELP.body);
      p.px(x + sway + 1, y, y % 5 === 0 ? KELP.lit : KELP.body);
    }
  }
}

/** A cluster of tube sponges reaching upward: telescope, chimney, vent. */
function tubes(p: Painter, W: number, H: number, r: Rng): void {
  const baseY = H - 1;
  const n = 4;
  for (let i = 0; i < n; i++) {
    const cx = 3 + Math.round(((W - 6) * i) / (n - 1));
    const h = Math.round(H * (0.5 + r() * 0.45));
    const hw = Math.max(1, Math.round(W / 14));
    stalk(p, cx, baseY - h, baseY, hw, hw + 1, TUBE);
    p.rect(cx - hw, baseY - h, hw * 2, 1, TUBE.dark);
    p.px(cx, baseY - h, '#2b1c12');
    if (i === 1) { p.px(cx, baseY - h - 1, GLOW); p.px(cx, baseY - h - 2, GLOW); }
  }
}

/** A basalt anvil on a coral stump: anvil. */
function anvil(p: Painter, W: number, H: number): void {
  const baseY = H - 1, stump = Math.max(2, Math.round(H * 0.3));
  p.rect(2, baseY - stump, W - 4, stump, CORAL.body);
  p.hline(2, baseY - stump, W - 4, CORAL.lit);
  const bodyY = 2, bodyH = Math.max(3, H - stump - 4);
  p.rect(Math.round(W * 0.2), bodyY, Math.round(W * 0.6), bodyH, BASALT.body);
  p.hline(Math.round(W * 0.14), bodyY, Math.round(W * 0.72), BASALT.lit);
  p.hline(Math.round(W * 0.2), bodyY + bodyH - 1, Math.round(W * 0.6), BASALT.dark);
  p.vline(Math.round(W * 0.2), bodyY + 1, bodyH - 2, BASALT.lit);
}

/** A tilted reading slab on a stalk: lectern. */
function lectern(p: Painter, W: number, H: number): void {
  const cx = Math.round(W / 2), postH = Math.max(3, Math.round(H * 0.42));
  stalk(p, cx, H - postH, H - 1, 1, 2, CORAL);
  const slabH = Math.max(3, H - postH - 2);
  for (let i = 0; i < slabH; i++) {
    const inset = Math.round((i / Math.max(1, slabH - 1)) * Math.round(W * 0.12));
    p.rect(inset + 1, 1 + i, W - 2 - inset * 2, 1, i === 0 ? SHELL.lit : SHELL.body);
    p.px(inset + 1, 1 + i, SHELL.dark);
    p.px(W - 2 - inset, 1 + i, SHELL.dark);
  }
}

/** A shell box with a mail slot: post box. */
function shellBox(p: Painter, W: number, H: number): void {
  const bodyH = Math.max(5, Math.round(H * 0.62));
  p.box(1, 1, W - 2, bodyH, SHELL.body, SHELL.dark);
  p.hline(2, 2, W - 4, SHELL.lit);
  p.hline(3, 4, W - 6, SHELL.dark);
  stalk(p, Math.round(W / 2), 1 + bodyH, H - 1, 1, 1, CORAL);
}

/** A shell counter under a kelp awning: stall. */
function counter(p: Painter, W: number, H: number, r: Rng): void {
  const awnH = Math.max(3, Math.round(H * 0.3));
  for (let y = 0; y < awnH; y++) {
    const inset = Math.round((y / Math.max(1, awnH - 1)) * 2);
    p.rect(inset, y, W - inset * 2, 1, y < 2 ? KELP.lit : KELP.body);
  }
  const top = awnH + Math.max(1, Math.round(H * 0.22));
  p.box(1, top, W - 2, H - top - 1, SHELL.body, SHELL.dark);
  p.hline(2, top + 1, W - 4, SHELL.lit);
  const n = Math.max(2, Math.round(W / 12));
  for (let i = 0; i < n; i++) p.disc(4 + Math.round(((W - 8) * i) / Math.max(1, n - 1)), top - 1, 1, r() < 0.5 ? CORAL.body : ANEM.lit);
}

/**
 * Reef replacement for `furniture.png` index `index`, at the same world
 * footprint the atlas sprite had. Indices follow TownScene's table:
 * 0 bench/porchBench, 1 flowerBox/planter, 2 barrel, 3 crate, 4 noticeBoard,
 * 5 signpost, 6/7 grave0/1/2, 15 banner.
 */
export function paintReefFurniture(index: number, worldW: number, worldH: number): HTMLCanvasElement {
  const W = Math.max(2, Math.round(worldW * S));
  const H = Math.max(2, Math.round(worldH * S));
  const r = mulberry(6100 + index * 6247);
  const p = new Painter(W, H);
  switch (index) {
    case 0: ledge(p, W, H, r); break;
    case 1: anemoneBed(p, W, H, r); break;
    case 2: drum(p, W, H); break;
    case 3: crate(p, W, H); break;
    case 4: plaque(p, W, H, SHELL, Math.max(3, Math.round(H * 0.45))); break;
    case 5: plaque(p, W, H, CORAL, Math.max(4, Math.round(H * 0.6))); break;
    case 15: frond(p, W, H, r); break;
    default: mound(p, Math.round(W / 2), H - 1, W, Math.max(4, Math.round(H * 0.9)), CORAL, r); break;
  }
  return submerge(p.canvas);
}

/**
 * Reef replacement for `equipment.png` index `index`. Indices follow
 * TownScene's table: 0 anvil, 1 workbench, 2 lectern, 3 telescope,
 * 4 postbox, 5 desk, 6 stall.
 */
export function paintReefEquipment(index: number, worldW: number, worldH: number): HTMLCanvasElement {
  const W = Math.max(2, Math.round(worldW * S));
  const H = Math.max(2, Math.round(worldH * S));
  const r = mulberry(8300 + index * 5231);
  const p = new Painter(W, H);
  switch (index) {
    case 0: anvil(p, W, H); break;
    case 1: slab(p, W, H, SHELL, Math.max(2, Math.round(H * 0.36))); break;
    case 2: lectern(p, W, H); break;
    case 3: tubes(p, W, H, r); break;
    case 4: shellBox(p, W, H); break;
    case 5: slab(p, W, H, CORAL, Math.max(2, Math.round(H * 0.3))); break;
    default: counter(p, W, H, r); break;
  }
  return submerge(p.canvas);
}
