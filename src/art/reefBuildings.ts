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
const WIN_LIT = '#ffd98a', WIN_DARK = '#6a5f52';

type Style = 'pitch' | 'dome' | 'wide' | 'awning';

const STYLE: Record<BuildingKind, Style> = {
  library: 'pitch', hall: 'pitch', workshop: 'pitch', post: 'pitch',
  observatory: 'dome', tavern: 'awning', forge: 'wide', house: 'pitch',
  market: 'awning',
};

function paintRoof(p: Painter, r: () => number, w: number, roofTop: number, roofBase: number, style: Style, body: string, lit: string, dark: string): void {
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
  // A coral head is a rounded, lumpy mound, not a gable. The pitched roof was
  // the single strongest land tell left on the whole building: coral colours on
  // a triangle still read as a cottage. Draw a semi-ellipse with lobed edges so
  // the silhouette itself is organic. `wide` flattens it into a low bank.
  const rad = Math.max(3, Math.round(w / 2) - 2);
  // A dome is wider than it is tall. Matching the mound height to the wall
  // height made a tall, steep cap whose sides read as straight roof slopes at
  // sprite scale; a coral head is a low, broad bulge.
  const peak = Math.max(4, Math.round(rad * (style === 'wide' ? 0.42 : 0.62)));
  for (let y = roofBase - peak; y <= roofBase; y++) {
    const t = (roofBase - y) / Math.max(1, peak);
    // The 2.4 exponent keeps the crown broad and rounded instead of tapering to
    // a point, which is the shape that still reads as a pitched roof.
    const arc = Math.round(rad * Math.pow(Math.max(0, 1 - Math.pow(t, 2.4)), 0.5));
    // Lobes: the mound bulges in irregular growths instead of a clean arc.
    const lobe = Math.round(Math.sin(t * 6.5) * rad * 0.14);
    const half = Math.max(1, arc + lobe);
    p.rect(mid - half, y, half * 2, 1, body);
    p.hline(mid - half, y, Math.max(1, Math.round(half * 0.55)), lit);
    p.px(mid - half, y, dark);
    p.px(mid + half - 1, y, dark);
  }
  // Shelves: coral grows in overlapping plates, so the mound is banded by
  // ridge lines instead of reading as one smooth filled polygon. Without these
  // the roof is a featureless solid slope, which is what a shader-flat roof
  // panel looks like rather than a living colony.
  for (let i = 0; i < Math.max(3, Math.round(rad / 2.5)); i++) {
    const y = roofBase - Math.round(r() * Math.max(1, peak));
    const t = (roofBase - y) / Math.max(1, peak);
    const arc = Math.round(rad * Math.sqrt(Math.max(0, 1 - t * t)));
    if (arc < 4) continue;
    const w2 = Math.max(3, Math.round(arc * (0.3 + r() * 0.55)));
    const x0 = mid - arc + Math.round(r() * Math.max(1, arc * 2 - w2));
    p.hline(x0, y, w2, dark);
    p.hline(x0, y - 1, w2, lit);
  }
  // Barnacled crown on the summit.
  p.hline(mid - 3, roofBase - peak, 6, lit);
  p.px(mid - 4, roofBase - peak + 1, lit);
  p.px(mid + 3, roofBase - peak + 1, lit);
}

function paintWindows(p: Painter, r: () => number, w: number, wallTop: number, wallH: number, lit: boolean, count: number): void {
  const glass = lit ? WIN_LIT : WIN_DARK;
  const gap = (w - 4) / (count + 1);
  for (let i = 0; i < count; i++) {
    // Glowing crevices, not a row of identical panes: a regular grid of equal
    // rectangles with a mullion is the strongest carpentry signal on the whole
    // sprite, and it survives any material change underneath it.
    const ww = Math.max(4, Math.round(w * (0.09 + r() * 0.07)));
    const wh = Math.max(3, Math.round(wallH * (0.24 + r() * 0.2)));
    const x = Math.round(3 + gap * (i + 1) + gap * (r() * 0.3 - 0.15)) - Math.round(ww / 2);
    const wy = wallTop + Math.round(wallH * (0.18 + r() * 0.12));
    p.disc(x + Math.round(ww / 2), wy + Math.round(wh / 2), Math.max(2, Math.round((ww + wh) / 4)), glass);
    p.rect(x, wy, ww, wh, glass);
    p.hline(x + 1, wy - 1, Math.max(1, ww - 2), lit ? '#fff0c0' : '#6f6455');
    for (let e = 0; e < ww; e += 2) p.px(x + e, wy + wh, '#3b3238');
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
  paintRoof(p, r, w, roofTop, roofBase, style, body, litC, darkC);

  // Kelp fronds / coral nubs sprouting along the ridge.
  const tufts = Math.max(3, Math.round(w / 9));
  for (let i = 0; i < tufts; i++) {
    const x = Math.round(3 + r() * (w - 6));
    const tall = 3 + Math.round(r() * 6);
    const col = r() < 0.5 ? litC : body;
    for (let s = 0; s < tall; s++) p.px(x + Math.round(Math.sin(s * 0.7 + i) * 1.4), roofTop + s - 1, s === tall - 1 ? col : darkC);
  }

  // Coral-rock wall band. The first cut filled the band flat and dropped
  // evenly spaced vertical seams across it, which is precisely how plank
  // siding looks: straight regular lines are the one thing coral never has,
  // and at half scale they were the strongest reason the buildings still read
  // as cottages. Build the face from irregular strata, encrusted growths and a
  // broken top edge instead, and let noise carry the grain.
  p.rect(1, wallTop, w - 2, wallH - 1, ROCK.body);
  p.hline(1, h - 2, w - 2, ROCK.dark);
  p.vline(1, wallTop, wallH - 1, ROCK.dark);
  p.vline(w - 2, wallTop, wallH - 1, ROCK.dark);
  // Strata: courses of uneven length and thickness, each with a lit crown.
  for (let y = wallTop + 2; y < h - 3; y += 3 + Math.round(r() * 4)) {
    const seg = 4 + Math.round(r() * (w * 0.3));
    const x0 = 2 + Math.round(r() * Math.max(1, w - seg - 4));
    p.hline(x0, y, seg, ROCK.joint);
    p.hline(x0, y - 1, Math.max(2, Math.round(seg * 0.55)), ROCK.top);
  }
  p.noise(2, wallTop + 1, w - 4, Math.max(1, wallH - 3), ROCK.dark, 0.16, 7);
  p.noise(2, wallTop + 1, w - 4, Math.max(1, wallH - 3), ROCK.top, 0.1, 11);
  // Growths on the face: coral and sponge colonies, not rivets on a plank.
  for (let i = 0; i < Math.round(w / 13); i++) {
    const cx = 4 + Math.round(r() * Math.max(1, w - 8));
    const cy = wallTop + 3 + Math.round(r() * Math.max(1, wallH - 9));
    const rad = 2 + Math.round(r() * 3);
    p.disc(cx, cy, rad, r() < 0.5 ? '#8a6f7c' : '#6f7f78');
    p.px(cx, cy - rad, '#c9b0bd');
  }
  // Coral overgrows the wall line, so the top edge is broken, never true.
  for (let x = 2; x < w - 3; x += 2 + Math.round(r() * 5)) {
    const up = 1 + Math.round(r() * 2);
    p.vline(x, wallTop - up, up + 1, ROCK.top);
  }
  // Carve the outline. This is the lever that matters: the fill and the
  // surface were already reef, and the vision read still came back "straight
  // sided box with sharp 90 degree corners". A plumb wall is straight because
  // a mason cut it; coral accretes, so the silhouette has to wander. Erode the
  // sides on a two-frequency profile (a long swell plus a short bump), chew
  // the base, and let the roof overhang the narrower foot it leaves behind.
  // Amplitude is deliberately large: at the 0.5 draw scale anything under
  // ~6 texels is a single game pixel and reads as no change at all.
  const wander = (t: number, phase: number): number =>
    Math.max(0, Math.round(4 + Math.sin(t * 0.085 + phase) * 3.5 + Math.sin(t * 0.29 + phase * 2.1) * 2.5));
  for (let y = wallTop; y < h; y++) {
    const l = wander(y, 0.7);
    const rr = wander(y, 2.3);
    if (l > 0) p.ctx.clearRect(1, y, l, 1);
    if (rr > 0) p.ctx.clearRect(w - 1 - rr, y, rr, 1);
  }
  for (let x = 1; x < w - 1; x++) {
    const d = wander(x, 4.1);
    if (d > 0) p.ctx.clearRect(x, h - 1 - d, 1, d + 1);
  }
  // Colonies on the cut edge, so the new outline is growth, not a clean bite.
  for (let i = 0; i < Math.round(w / 9); i++) {
    const cy = wallTop + 2 + Math.round(r() * Math.max(1, wallH - 5));
    const rad = 3 + Math.round(r() * 5);
    const side = r() < 0.5 ? 1 : -1;
    const cx = side < 0 ? 2 + Math.round(r() * 5) : w - 3 - Math.round(r() * 5);
    p.disc(cx, cy, rad, r() < 0.5 ? ROCK.body : ROCK.top);
    p.px(cx + side * rad, cy, ROCK.dark);
  }

  // Door. An opening in growth, not a framed rectangle: a coral mouth is a
  // rough arch, and the frame band was reading as carpentry.
  const dw = Math.max(6, Math.round(w * 0.15)), dx = Math.round((w - dw) / 2);
  const dh = Math.round(wallH * 0.55);
  p.rect(dx, h - dh, dw, dh, '#1d1a20');
  for (let i = 0; i < dw; i++) {
    const cut = Math.round(Math.abs(i - dw / 2) / Math.max(1, dw / 2) * Math.max(1, dw * 0.3));
    p.ctx.clearRect(dx + i, h - dh, 1, Math.max(0, cut - Math.round(r() * 2)));
  }
  p.hline(dx + 1, h - dh, Math.max(1, dw - 2), '#3b3238');

  paintWindows(p, r, w, wallTop, wallH, lit, style === 'wide' ? 2 : 3);

  // Barnacle speckle along the wall and the roof eave.
  for (let i = 0; i < Math.round(w * 0.6); i++) {
    const x = 2 + Math.round(r() * (w - 4));
    const y = wallTop + 1 + Math.round(r() * (wallH - 3));
    p.px(x, y, r() < 0.5 ? '#cfa0b0' : '#9fb8b0');
  }

  // The forge's stack was a chimney silhouette: a tall, narrow, capped column
  // is a chimney no matter what colour it is painted, and it was the second
  // strongest land tell after the roofs. A hydrothermal vent is the same
  // placement with the opposite profile: short, splayed at the base, tapering
  // to an open mouth that the plume emitter sits on.
  if (kind === 'forge') {
    const sx = Math.round(w * 0.78), sw = Math.max(5, Math.round(w * 0.16));
    const base = roofBase - Math.round(h * 0.02);
    const top = Math.round(h * 0.06);
    const rows = base - top;
    for (let i = 0; i < rows; i++) {
      const t = i / Math.max(1, rows);
      const half = Math.max(2, Math.round((sw / 2) * (1 - t * 0.62)));
      const cx = sx + Math.round(sw / 2);
      p.rect(cx - half, base - i, half * 2, 1, i % 5 === 0 ? ROCK.top : ROCK.body);
      p.px(cx - half, base - i, ROCK.dark);
      p.px(cx + half - 1, base - i, ROCK.dark);
    }
    // An open mouth, ringed and shadowed, instead of a flat cap.
    const mw = Math.max(3, Math.round(sw * 0.42));
    p.rect(sx + Math.round(sw / 2) - mw, top - 1, mw * 2, 3, '#2a2329');
    p.hline(sx + Math.round(sw / 2) - mw, top + 2, mw * 2, ROCK.dark);
  }

  return submerge(p.canvas);
}
