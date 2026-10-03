/**
 * Procedural reef art.
 *
 * The shipped atlases are authored for dry land: deciduous trees, wooden rail
 * fences, tilled crop rows. Their *silhouettes* are what make the town read as
 * a village, and no palette key reaches a silhouette — recolouring a tree still
 * leaves a tree. This module paints the reef equivalents from code instead, so
 * the shapes themselves change: staghorn and brain coral where trees stood, sea
 * fans and kelp where the canopy was, a kelp farm where the crop field was.
 *
 * Everything is painted at two device texels per world pixel, the ratio
 * ReferenceArt uses, and passed through the same `submerge()` grade so
 * procedural art and atlas art sit under one light.
 */
import { Painter, mulberry } from './painter';
import { submerge } from './reference';

/** Device texels per world pixel, matching the atlas pipeline. */
const S = 2;

type Draw = (p: Painter, w: number, h: number) => void;

function bake(worldW: number, worldH: number, draw: Draw): HTMLCanvasElement {
  const p = new Painter(worldW * S, worldH * S);
  draw(p, worldW * S, worldH * S);
  return submerge(p.canvas);
}

/** A random-walk path of rounded points: the shape language of every limb here. */
function limb(seed: number, x0: number, y0: number, ang: number, steps: number, step: number, wobble: number): [number, number][] {
  const r = mulberry(seed);
  const pts: [number, number][] = [[Math.round(x0), Math.round(y0)]];
  let x = x0, y = y0, a = ang;
  for (let i = 0; i < steps; i++) {
    a += (r() - 0.5) * wobble;
    x += Math.cos(a) * step;
    y -= Math.sin(a) * step;
    pts.push([Math.round(x), Math.round(y)]);
  }
  return pts;
}

function stroke(p: Painter, pts: [number, number][], rad: number, col: string): void {
  for (const [x, y] of pts) p.disc(x, y, rad, col);
}

/** Variant 0: staghorn coral, the reef's shrub. */
export function paintStaghorn(variant: number): HTMLCanvasElement {
  const body = ['#c9747f', '#cf8a6a', '#b96b8a'][variant % 3]!;
  const dark = '#5e3040', lit = '#eaa896';
  return bake(30, 22, (p, w, h) => {
    const cx = Math.round(w / 2), base = h - 1;
    p.rect(cx - 9, base - 3, 18, 4, dark);
    p.rect(cx - 8, base - 3, 16, 2, body);
    const arms: [number, number, number, number][] = [
      [cx, base - 4, Math.PI / 2, 9],
      [cx - 1, base - 4, Math.PI / 2 + 0.52, 7],
      [cx + 1, base - 4, Math.PI / 2 - 0.52, 7],
    ];
    arms.forEach(([x, y, ang, steps], i) => {
      const main = limb(3100 + variant * 17 + i, x, y, ang, steps, 1.7, 0.2);
      stroke(p, main, 3, dark);
      stroke(p, main, 2, body);
      const [tx, ty] = main[main.length - 1]!;
      for (const side of [1, -1]) {
        const fork = limb(7100 + variant * 23 + i * 5 + (side > 0 ? 1 : 2), tx, ty, ang + side * 0.72, 5, 1.5, 0.18);
        stroke(p, fork, 2, dark);
        stroke(p, fork, 1, body);
        const [fx, fy] = fork[fork.length - 1]!;
        p.disc(fx, fy, 1, lit);
      }
      p.disc(tx, ty, 1, lit);
    });
  });
}

/** Variant 1: a gorgonian sea fan, all lattice and no trunk. */
export function paintSeafan(variant: number): HTMLCanvasElement {
  const body = ['#8a6aa8', '#a86a8a', '#6a7aa8'][variant % 3]!;
  const lit = '#d2b6e0', dark = '#3f3050';
  return bake(26, 30, (p, w, h) => {
    const cx = Math.round(w / 2), base = h - 1, stemTop = base - 20;
    p.rect(cx - 5, base - 4, 10, 5, dark);
    p.rect(cx - 4, base - 4, 8, 3, body);
    p.rect(cx - 2, stemTop, 4, base - stemTop, dark);
    p.rect(cx - 1, stemTop, 2, base - stemTop, body);
    const ribs = 11, span = h - stemTop - 4;
    const lenAt = (i: number) => span * (0.55 + 0.45 * Math.sin(Math.PI * (i / (ribs - 1))));
    const angAt = (i: number) => Math.PI * (0.12 + 0.76 * (i / (ribs - 1)));
    for (let i = 0; i < ribs; i++) {
      const a = angAt(i), len = lenAt(i);
      const ex = cx + Math.cos(a) * len, ey = stemTop - Math.sin(a) * len;
      const steps = Math.max(2, Math.round(len));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const x = Math.round(cx + (ex - cx) * t), y = Math.round(stemTop + (ey - stemTop) * t);
        p.px(x, y, i % 2 ? body : lit);
        p.px(x + 1, y, body);
      }
      p.px(Math.round(ex), Math.round(ey), lit);
    }
    // Cross ribs make it a lattice rather than a bundle of sticks.
    for (const frac of [0.42, 0.72]) {
      for (let i = 0; i < ribs - 1; i++) {
        for (const j of [i, i + 1]) {
          const a = angAt(j), l = lenAt(j) * frac;
          p.px(Math.round(cx + Math.cos(a) * l), Math.round(stemTop - Math.sin(a) * l), dark);
        }
      }
    }
  });
}

/** Variant 2: a kelp stalk. Tall and thin, the silhouette the village never had. */
export function paintKelp(variant: number): HTMLCanvasElement {
  const body = '#5f7a3a', blade = '#7fa04a', lit = '#9dbb5f', dark = '#2f4020';
  return bake(18, 56, (p, w, h) => {
    const base = h - 1, cx = Math.round(w / 2);
    p.rect(cx - 6, base - 4, 12, 5, dark);
    p.rect(cx - 5, base - 4, 10, 3, body);
    let x = cx, y = base - 5;
    const rows = Math.floor((h - 10) / 2);
    for (let i = 0; i < rows; i++) {
      x += Math.sin(i * 0.38 + variant) * 0.8;
      p.rect(Math.round(x) - 1, y, 3, 2, i % 4 === 0 ? lit : body);
      if (i % 3 === 1) {
        const side = ((i / 3) | 0) % 2 ? 1 : -1;
        for (let b = 0; b < 10; b++) {
          p.rect(Math.round(x) + side * (1 + b * 0.85), Math.round(y + b * 0.3), 2, 2, b > 6 ? lit : blade);
        }
      }
      y -= 2;
    }
    p.px(Math.round(x), y, lit);
  });
}

/** Variant 3: brain coral. Low, wide, grooved. */
export function paintBrain(variant: number): HTMLCanvasElement {
  const body = ['#c9a06a', '#c98a8a', '#a8a06a'][variant % 3]!;
  const lit = '#e6c894', dark = '#6f5636';
  return bake(34, 18, (p, w, h) => {
    const top = (x: number) => {
      const u = (x / (w - 1)) * 2 - 1;
      return h - 5 - Math.round(Math.sqrt(Math.max(0, 1 - u * u)) * (h - 11));
    };
    for (let x = 0; x < w; x++) {
      const t = top(x);
      p.rect(x, t, 1, h - 1 - t, body);
      p.px(x, t, lit);
    }
    for (let k = 0; k < 3; k++) {
      for (let x = 0; x < w; x++) {
        const y = top(x) + 4 + k * 5 + Math.round(Math.sin(x * 0.45 + k * 1.9) * 1.6);
        if (y > 0 && y < h - 2) p.px(x, y, dark);
      }
    }
    p.rect(0, h - 3, w, 3, dark);
  });
}

/** Variant 4: a cluster of tube sponges. */
export function paintTubes(variant: number): HTMLCanvasElement {
  const body = ['#d98a4a', '#c96a6a', '#d9b04a'][variant % 3]!;
  const lit = '#f2c188', dark = '#7f4423', mouth = '#241713';
  return bake(20, 26, (p, w, h) => {
    const tubes: [number, number, number][] = [[2, 15, 6], [7, 22, 5], [12, 11, 6], [16, 18, 4]];
    p.rect(1, h - 4, w - 2, 4, dark);
    for (const [tx, th, tw] of tubes) {
      const top = h - 3 - th;
      p.rect(tx, top, tw, h - 3 - top, body);
      p.rect(tx + tw - 1, top, 1, h - 3 - top, dark);
      p.rect(tx, top, tw, 1, lit);
      p.rect(tx, top + 1, tw, 2, mouth);
    }
  });
}

/** Variant 5: an anemone crown, all tentacles. */
export function paintAnemone(variant: number): HTMLCanvasElement {
  const body = ['#7a5a9a', '#9a5a7a', '#5a7a9a'][variant % 3]!;
  const tip = '#e0c4f0', dark = '#38294e';
  return bake(24, 18, (p, w, h) => {
    const r = mulberry(6600 + variant);
    const cx = Math.round(w / 2), base = h - 4;
    p.disc(cx, base, 8, dark);
    p.disc(cx, base - 1, 7, body);
    for (let i = 0; i < 22; i++) {
      const a = Math.PI * (0.06 + 0.88 * (i / 21));
      const len = 10 + r() * 14;
      const steps = Math.round(len);
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        p.px(
          Math.round(cx + Math.cos(a) * len * t),
          Math.round(base - 2 - Math.sin(a) * len * t),
          t > 0.78 ? tip : body,
        );
      }
    }
  });
}

/** The bush and hedge slot: a low cluster of coral nubs and anemone heads. */
export function paintReefNub(variant: number): HTMLCanvasElement {
  const heads = ['#c9747f', '#8a6aa8', '#5f8a5a', '#d9a04a'];
  return bake(18, 12, (p, w, h) => {
    const r = mulberry(2400 + variant);
    p.rect(1, h - 3, w - 2, 3, '#33402c');
    for (let i = 0; i < 7; i++) {
      const cx = 3 + Math.round(r() * (w - 6));
      const cy = h - 4 - Math.round(r() * 5);
      const rad = 2 + Math.round(r() * 2);
      const col = heads[(variant + i) % heads.length]!;
      p.disc(cx, cy, rad, '#1f2a24');
      p.disc(cx, cy - 1, Math.max(1, rad - 1), col);
      p.px(cx, cy - rad, '#e8c8b0');
    }
  });
}

/**
 * The fence slot, laid on its side: a run of kelp along a low holdfast.
 * Parametric in world pixels so the structure pass can stretch one tile to
 * whatever length the fence run it is replacing happens to be.
 */
export function paintKelpStrip(worldW: number, worldH: number, seed: number): HTMLCanvasElement {
  const body = '#4e6a34', blade = '#6f9440', lit = '#93b455', dark = '#25331a';
  return bake(worldW, worldH, (p, w, h) => {
    const r = mulberry(seed);
    const base = h - 1;
    p.rect(0, base - 4, w, 5, dark);
    p.rect(0, base - 4, w, 3, body);
    const stems = Math.max(2, Math.round(worldW / 5));
    for (let i = 0; i < stems; i++) {
      const tall = 6 + Math.round(r() * Math.max(1, h - 16));
      let x = Math.round(((i + 0.5) / stems) * (w - 4)) + 2;
      for (let s = 0; s < tall; s += 2) {
        x += Math.sin((s + i * 4) * 0.35) * 0.6;
        p.rect(Math.round(x) - 1, base - 5 - s, 2, 2, s % 6 === 0 ? lit : body);
        if (s % 4 === 0) {
          const side = ((s / 4) | 0) % 2 ? 1 : -1;
          for (let b = 0; b < 3; b++) {
            p.rect(Math.round(x) + side * (1 + b), base - 6 - s - Math.round(b * 0.7), 2, 2, b > 1 ? lit : blade);
          }
        }
      }
      p.px(Math.round(x), base - 6 - tall, lit);
    }
  });
}

const FLORA = [paintStaghorn, paintSeafan, paintKelp, paintBrain, paintTubes, paintAnemone] as const;

/** The six flora variants the map's `tree` prop resolves to, in variant order. */
export function paintReefFlora(variant: number): HTMLCanvasElement {
  return FLORA[variant % FLORA.length]!(variant);
}

/** Tall variants sway harder, because a kelp stipe is not a tree trunk. */
export function reefFloraSway(variant: number): number {
  return [0.01, 0.014, 0.026, 0.006, 0.012, 0.018][variant % 6]!;
}


