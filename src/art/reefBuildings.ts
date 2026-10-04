/**
 * Procedural reef architecture.
 *
 * The buildings atlas is authored for a dry-land village: cut-stone walls,
 * terracotta roofs, brick chimneys. `submerge()` cools their colours but a
 * cottage silhouette still reads as a cottage. Earlier passes painted coral
 * colours onto a wall band topped by a roof band, eroded the sides and broke
 * the top edge: every one of those frames still came back "rectangular houses
 * with pitched roofs and front doors", because a box with a hat is a house no
 * matter what colour the box is.
 *
 * This module does not draw a wall and a roof. It draws one coral head: a
 * single organic mound whose profile is a broad bulge, banded by growth
 * plates, pierced by a cave mouth instead of a door and glowing crevices
 * instead of windows. There is no straight vertical edge and no gable.
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

const ROCK = { body: '#8f8286', top: '#ab9ea2', dark: '#544a50' };
const KELP = { body: '#4e6a34', lit: '#7fa04a', dark: '#2b3a22' };
const CORAL = { body: '#b96b7f', lit: '#d99a92', dark: '#6b3446' };
const WIN_LIT = '#ffd98a', WIN_DARK = '#5a4f46';

/** A coral head at the atlas footprint for its kind. */
export function paintReefBuilding(kind: BuildingKind, worldW: number, lit: boolean): HTMLCanvasElement {
  const w = Math.round(worldW * S);
  const h = Math.round((worldW / ASPECT[kind]) * S);
  const p = new Painter(w, h);
  const r = mulberry(9001 + kind.length * 977 + kind.charCodeAt(0) * 31);
  const phase = r() * 6.283;

  const apex = Math.max(2, Math.round(h * 0.06));
  const baseY = h - 1;
  const mid = Math.round(w / 2);
  const maxHalf = Math.max(4, w / 2 - 1);

  const warm = kind === 'tavern' || kind === 'market' || kind === 'observatory';
  const body = warm ? CORAL.body : KELP.body;
  const litC = warm ? CORAL.lit : KELP.lit;
  const darkC = warm ? CORAL.dark : KELP.dark;

  // Broad coral head: widest around 55% down, tapering up, flaring slightly at
  // the foot where it meets the seabed. Two sine terms give the outline an
  // irregular swell so no run of rows shares a half-width.
  const halfAt = (y: number): number => {
    const t = (y - apex) / Math.max(1, baseY - apex);
    const prof = Math.sin(Math.PI * (0.17 + 0.83 * t));
    let half = maxHalf * Math.pow(Math.max(0, prof), 0.5);
    half += Math.sin(t * 6.3 + phase) * maxHalf * 0.075;
    half += Math.sin(t * 15.7 + phase * 2.1) * maxHalf * 0.035;
    return Math.max(2, Math.round(half));
  };

  // 1. The body. One mound, drawn row by row; lit crown on the sunward flank.
  for (let y = apex; y <= baseY; y++) {
    const half = halfAt(y);
    p.rect(mid - half, y, half * 2, 1, body);
    p.hline(mid - half, y, Math.max(1, Math.round(half * 0.55)), litC);
    p.px(mid - half, y, darkC);
    p.px(mid + half - 1, y, darkC);
  }

  // 2. Growth plates. Broken, offset bands of encrusting coral, never a
  //    continuous horizontal course: an unbroken line with a highlight above
  //    it is a shingle row and puts the roof straight back on the coral.
  const bands = Math.max(4, Math.round(h / 9));
  for (let i = 0; i < bands; i++) {
    const y = apex + 2 + Math.round(r() * (h - apex - 4));
    const half = halfAt(y);
    if (half < 5) continue;
    const seg = Math.max(3, Math.round(half * (0.35 + r() * 0.5)));
    const x0 = mid - half + Math.round(r() * Math.max(1, half * 2 - seg));
    for (let d = 0; d < seg; d++) {
      const yy = y + Math.round(Math.sin(d * 0.5 + i) * 1.3);
      p.px(x0 + d, yy, darkC);
      if (r() < 0.65) p.px(x0 + d, yy - 1, litC);
    }
  }

  // 3. Colonies encrusting the flank: sponge and coralline algae knobs, each
  //    with a lit cap so the surface reads as growth rather than paint.
  for (let i = 0; i < Math.round(w / 9); i++) {
    const y = apex + 3 + Math.round(r() * Math.max(1, h - apex - 6));
    const half = halfAt(y);
    if (half < 6) continue;
    const cx = mid - half + 2 + Math.round(r() * Math.max(1, half * 2 - 4));
    const rad = 2 + Math.round(r() * 3);
    p.disc(cx, y, rad, r() < 0.5 ? '#8a6f7c' : '#6f7f78');
    p.px(cx, y - rad, '#c9b0bd');
  }

  // 4. Cave mouth, not a door. A rough arch sunk into the foot of the mound,
  //    its top edge chewed so it is an opening in growth rather than a frame.
  const dw = Math.max(6, Math.round(w * 0.17));
  const dx = mid - Math.round(dw / 2);
  const dh = Math.max(6, Math.round(h * 0.26));
  for (let i = 0; i < dw; i++) {
    const edge = Math.abs(i - dw / 2) / Math.max(1, dw / 2);
    const top = h - dh + Math.round(edge * edge * dh * 0.55);
    const jitter = Math.round(r() * 2);
    p.vline(dx + i, top + jitter, h - top - jitter, '#1d1a20');
  }
  p.hline(dx + 1, h - dh, Math.max(1, dw - 2), '#3b3238');

  // 5. Glowing crevices, not windows. Irregular blobs of bioluminescence, no
  //    frame and no mullion: a regular grid of equal rectangles is carpentry.
  const glass = lit ? WIN_LIT : WIN_DARK;
  const nGlow = kind === 'forge' ? 1 : 2 + Math.round(r() * 2);
  for (let i = 0; i < nGlow; i++) {
    const y = apex + Math.round(h * (0.3 + r() * 0.35));
    const half = halfAt(y);
    if (half < 7) continue;
    const cx = mid + Math.round((r() * 2 - 1) * (half - 5));
    const rad = 2 + Math.round(r() * 2);
    p.disc(cx, y, rad, glass);
    if (lit) p.px(cx, y - rad, '#fff3d0');
  }

  // 6. Kelp and coral tufts sprouting from the crown and the shoulders.
  const tufts = Math.max(3, Math.round(w / 11));
  for (let i = 0; i < tufts; i++) {
    const y = apex + Math.round(r() * h * 0.3);
    const half = halfAt(y);
    const x = mid + Math.round((r() * 2 - 1) * half);
    const tall = 3 + Math.round(r() * 6);
    const col = r() < 0.5 ? litC : body;
    for (let s = 0; s < tall; s++) p.px(x + Math.round(Math.sin(s * 0.7 + i) * 1.3), y - s, s === tall - 1 ? col : darkC);
  }

  // 7. Barnacle speckle over the whole head.
  for (let i = 0; i < Math.round(w * 0.7); i++) {
    const y = apex + 1 + Math.round(r() * (h - apex - 2));
    const half = halfAt(y);
    const x = mid - half + 1 + Math.round(r() * Math.max(1, half * 2 - 2));
    p.px(x, y, r() < 0.5 ? '#cfa0b0' : '#9fb8b0');
  }

  // 8. The forge's hydrothermal vent: a low splayed mound clearing the crown,
  //    tapering to an open mouth. Kept low on purpose: a vent that rises most
  //    of the building height still reads as a brick chimney.
  if (kind === 'forge') {
    const sw = Math.max(8, Math.round(w * 0.3));
    const cx = Math.round(w * 0.62);
    const base = apex + Math.round(h * 0.34);
    const rise = Math.max(5, Math.round(h * 0.14));
    for (let i = 0; i < rise; i++) {
      const t = i / Math.max(1, rise - 1);
      const half = Math.max(3, Math.round((sw / 2) * (1 - t * 0.72)));
      p.rect(cx - half, base - i, half * 2, 1, i % 4 === 0 ? ROCK.top : ROCK.body);
      p.px(cx - half, base - i, ROCK.dark);
      p.px(cx + half - 1, base - i, ROCK.dark);
    }
    const mw = Math.max(2, Math.round(sw * 0.2));
    const mouth = base - rise + 1;
    p.rect(cx - mw, mouth, mw * 2, 2, '#2a2329');
    p.hline(cx - mw - 1, mouth + 2, mw * 2 + 2, ROCK.dark);
  }

  return submerge(p.canvas);
}
