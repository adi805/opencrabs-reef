/**
 * Procedural reef architecture.
 *
 * The buildings atlas is authored for a dry-land village: cut-stone walls,
 * terracotta roofs, brick chimneys. `submerge()` cools their colours but a
 * cottage silhouette still reads as a cottage, and in the frame the
 * architecture is the strongest remaining land tell. These painters raise the
 * town out of the reef instead: coral-rock walls, kelp and coral roofs,
 * barnacled ledges, vent stacks in place of chimneys.
 *
 * Every sprite keeps the exact footprint of the atlas frame it replaces. The
 * aspects below are measured from the shipped `buildings.png` (its trimmed
 * bounds equal its rects, so these are exact), which means the placement code
 * in TownScene needs no change at all.
 */
import { Painter, mulberry } from './painter';
import { submerge } from './reference';
import type { BuildingKind } from './buildings';

/** Device texels per world pixel, the ratio every atlas frame is drawn at. */
const S = 2;

/** Authored width/height per kind, measured from buildings.png. */
const ASPECT: Record<BuildingKind, number> = {
  library: 222 / 240, hall: 221 / 240, workshop: 222 / 239, post: 221 / 240,
  observatory: 222 / 203, tavern: 221 / 203, forge: 222 / 169, house: 221 / 203,
  market: 221 / 203,
};

const ROCK = { body: '#8f8286', top: '#ab9ea2', dark: '#544a50', joint: '#6d6268' };
const KELP = { body: '#4e6a34', lit: '#7fa04a', dark: '#2b3a22' };
const CORAL = { body: '#b96b7f', lit: '#d99a92', dark: '#6b3446' };
const WIN_LIT = '#ffd98a', WIN_DARK = '#6a5f52', FRAME = '#3b3238';

type Style = 'pitch' | 'dome' | 'wide' | 'awning';

const STYLE: Record<BuildingKind, Style> = {
  library: 'pitch', hall: 'pitch', workshop: 'pitch', post: 'pitch',
  observatory: 'dome', tavern: 'awning', forge: 'wide', house: 'pitch',
  market: 'awning',
};

function paintRoof(p: Painter, w: number, roofTop: number, roofBase: number, style: Style, body: string, lit: string, dark: string): void {
  const mid = Math.round(w / 2);
  if (style === 'dome') {
    // Observatory: a half-shell over the wall.
    const cy = roofBase, rad = Math.min(Math.round(w / 2) - 1, roofBase - roofTop);
    for (let y = roofTop; y <= roofBase; y++) {
      const dy = cy - y;
      const half = Math.round(Math.sqrt(Math.max(0, rad * rad - dy * dy)));
      if (half <= 0) continue;
      p.rect(mid - half, y, half * 2, 1, y - roofTop < rad * 0.35 ? lit : body);
      p.px(mid - half, y, dark);
      p.px(mid + half - 1, y, dark);
    }
    return;
  }
  // Pitched and wide roofs share a ridge; `wide` simply flattens the slope.
  const rise = style === 'wide' ? 0.5 : 1;
  for (let y = roofTop; y < roofBase; y++) {
    const t = (y - roofTop) / Math.max(1, roofBase - roofTop);
    const half = Math.round((w / 2 - 2) * Math.min(1, t * 1.35 * rise + 0.12));
    if (half <= 0) continue;
    p.rect(mid - half, y, half * 2, 1, body);
    // Lit slope on the left, shadowed eave on the right.
    p.hline(mid - half, y, Math.max(1, Math.round(half * 0.5)), lit);
    p.px(mid + half - 1, y, dark);
  }
  p.hline(mid - 2, roofTop, 4, lit);
}

function paintWindows(p: Painter, w: number, wallTop: number, wallH: number, lit: boolean, count: number): void {
  const glass = lit ? WIN_LIT : WIN_DARK;
  const wy = wallTop + Math.round(wallH * 0.22);
  const wh = Math.max(4, Math.round(wallH * 0.34));
  const ww = Math.max(5, Math.round(w * 0.12));
  const gap = (w - 4 - count * ww) / (count + 1);
  for (let i = 0; i < count; i++) {
    const x = Math.round(3 + gap * (i + 1) + ww * i);
    p.rect(x - 1, wy - 1, ww + 2, wh + 2, FRAME);
    p.rect(x, wy, ww, wh, glass);
    p.hline(x, wy, ww, lit ? '#fff0c0' : '#8a7c6a');
    p.vline(x + Math.round(ww / 2), wy, wh, FRAME);
  }
}

/** A coral-rock, kelp-roofed building at the atlas footprint for its kind. */
export function paintReefBuilding(kind: BuildingKind, worldW: number, lit: boolean): HTMLCanvasElement {
  const w = Math.round(worldW * S);
  const h = Math.round((worldW / ASPECT[kind]) * S);
  const p = new Painter(w, h);
  const r = mulberry(9001 + kind.length * 977 + kind.charCodeAt(0) * 31);
  const style = STYLE[kind];

  const wallH = Math.round(h * (style === 'wide' ? 0.5 : 0.4));
  const wallTop = h - wallH;
  const roofBase = wallTop + Math.round(h * 0.07);
  const roofTop = Math.round(h * (style === 'wide' ? 0.16 : 0.03));

  // Roof first: coral plates, or kelp thatch, per kind.
  const coralRoof = kind === 'tavern' || kind === 'market' || kind === 'observatory';
  const body = coralRoof ? CORAL.body : KELP.body;
  const litC = coralRoof ? CORAL.lit : KELP.lit;
  const darkC = coralRoof ? CORAL.dark : KELP.dark;
  paintRoof(p, w, roofTop, roofBase, style, body, litC, darkC);

  // Kelp fronds / coral nubs sprouting along the ridge.
  const tufts = Math.max(3, Math.round(w / 9));
  for (let i = 0; i < tufts; i++) {
    const x = Math.round(3 + r() * (w - 6));
    const tall = 3 + Math.round(r() * 6);
    const col = r() < 0.5 ? litC : body;
    for (let s = 0; s < tall; s++) p.px(x + Math.round(Math.sin(s * 0.7 + i) * 1.4), roofTop + s - 1, s === tall - 1 ? col : darkC);
  }

  // Coral-rock wall band.
  p.rect(1, wallTop, w - 2, wallH - 1, ROCK.body);
  p.hline(1, wallTop, w - 2, ROCK.top);
  p.hline(1, h - 2, w - 2, ROCK.dark);
  p.vline(1, wallTop, wallH - 1, ROCK.dark);
  p.vline(w - 2, wallTop, wallH - 1, ROCK.dark);
  for (let x = 4; x < w - 4; x += 7 + Math.round(r() * 5)) p.vline(x, wallTop + 2, wallH - 4, ROCK.joint);

  // Door.
  const dw = Math.max(6, Math.round(w * 0.14)), dx = Math.round((w - dw) / 2);
  p.rect(dx - 1, h - Math.round(wallH * 0.55) - 2, dw + 2, Math.round(wallH * 0.55) + 1, FRAME);
  p.rect(dx, h - Math.round(wallH * 0.55), dw, Math.round(wallH * 0.55) - 1, '#2f2a33');

  paintWindows(p, w, wallTop, wallH, lit, style === 'wide' ? 2 : 3);

  // Barnacle speckle along the wall and the roof eave.
  for (let i = 0; i < Math.round(w * 0.6); i++) {
    const x = 2 + Math.round(r() * (w - 4));
    const y = wallTop + 1 + Math.round(r() * (wallH - 3));
    p.px(x, y, r() < 0.5 ? '#cfa0b0' : '#9fb8b0');
  }

  // The forge keeps a vent stack, because a chimney is a land shape but a
  // hydrothermal plume is the same silhouette with the right colour.
  if (kind === 'forge') {
    const sx = Math.round(w * 0.78), sw = Math.max(4, Math.round(w * 0.09));
    p.rect(sx, Math.round(h * 0.02), sw, roofBase - Math.round(h * 0.02), ROCK.dark);
    p.rect(sx + 1, Math.round(h * 0.02), sw - 2, roofBase - Math.round(h * 0.02) - 2, ROCK.body);
    p.rect(sx - 1, Math.round(h * 0.02), sw + 2, 2, ROCK.top);
  }

  return submerge(p.canvas);
}
