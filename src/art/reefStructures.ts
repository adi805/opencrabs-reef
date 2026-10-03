/**
 * Procedural reef replacements for the masonry and fence pass.
 *
 * `paintStructures` used to draw wooden rails, a stone wall and tilled crop
 * rows out of the furniture atlas. Those are the second half of the village
 * silhouette: a coral town with garden fences still reads as a farm. These
 * painters keep the exact device sizes the draw loop already expects, so the
 * geometry code does not change at all — only what lands on the ground.
 *
 * The horizontal kelp rail is the parametric `paintKelpStrip` below, which the
 * fence pass calls with the run's own width.
 */
import { Painter, mulberry } from './painter';
import { submerge } from './reference';

const KELP = { body: '#4e6a34', blade: '#6f9440', lit: '#93b455', dark: '#25331a' };
// Coral rock, not masonry. At a grey-mauve it rendered as a mortared wall with
// flat-topped blocks, which is the single strongest land tell on the terrace
// edge. Warm it, and grow polyps on it.
const ROCK = { body: '#8f6f78', top: '#b5929a', dark: '#4a333c', polyp: '#e0a0ac', algae: '#7fa08c' };

/** 9x32 world px: the vertical boundary, a kelp column instead of a rail. */
export function paintKelpRailV(): HTMLCanvasElement {
  const W = 18, H = 64;
  const p = new Painter(W, H);
  const r = mulberry(4477);
  p.rect(5, 0, 8, H, KELP.dark);
  let x = 9;
  for (let y = H - 2; y > 3; y -= 2) {
    x += Math.sin(y * 0.2) * 0.5;
    p.rect(Math.round(x) - 1, y, 3, 2, KELP.body);
    if (((y / 2) | 0) % 3 === 1) {
      const side = ((y / 2) | 0) % 2 ? 1 : -1;
      for (let b = 0; b < 5; b++) {
        p.rect(Math.round(x) + side * (1 + b), y - Math.round(b * 0.5), 2, 2, b > 3 ? KELP.lit : KELP.blade);
      }
    }
  }
  for (let i = 0; i < 8; i++) p.rect(2 + i, H - 3 - Math.round(r() * 2), 2, 3, KELP.dark);
  return submerge(p.canvas);
}

/**
 * A horizontal kelp rail of any run width, planted along a holdfast line.
 *
 * The fence pass hands over the run's own pixel width, so this cannot be a
 * fixed sprite: blades are laid on a stable grid and only a blade near the
 * right edge may be clipped, which keeps neighbouring runs seamless.
 */
export function paintKelpStrip(w: number, h: number, seed: number): HTMLCanvasElement {
  const p = new Painter(w, h);
  const r = mulberry(seed);
  const base = h - 3;
  p.rect(0, base, w, 3, KELP.dark);
  p.rect(0, base + 1, w, 1, KELP.body);
  let x = 2;
  while (x < w - 1) {
    const tall = 3 + Math.round(r() * Math.max(1, h - 8));
    const lean = r() < 0.5 ? -1 : 1;
    for (let s = 0; s < tall; s++) {
      const bx = x + Math.round(s * lean * 0.3);
      p.rect(bx, base - s, 2, 2, s > tall - 3 ? KELP.lit : KELP.body);
      if (s % 3 === 1 && bx + lean * 2 > 0 && bx + lean * 2 < w - 1) p.px(bx + lean * 2, base - s, KELP.blade);
    }
    x += 4 + Math.round(r() * 3);
  }
  return submerge(p.canvas);
}

/** 48x20 world px: the reef wall band, coral rock instead of cut stone. */
export function paintCoralWallH(): HTMLCanvasElement {
  const W = 96, H = 40;
  const p = new Painter(W, H);
  const r = mulberry(6131);
  // A rubble apron, then an irregular ridge of overlapping coral heads. The
  // heads are discs, never rectangles: a flat-topped block reads as a dressed
  // stone course, which is exactly the battlement this replaces.
  p.rect(0, H - 4, W, 4, ROCK.dark);
  let x = -6;
  while (x < W + 4) {
    const rad = 6 + Math.round(r() * 7);
    const cy = H - 3 - Math.round(rad * (0.35 + r() * 0.5));
    p.disc(x, cy, rad, ROCK.body);
    p.disc(x - Math.round(rad * 0.25), cy - Math.round(rad * 0.3), Math.round(rad * 0.45), ROCK.top);
    // Encrustation: polyps and coralline algae on the sunward face.
    const n = 1 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const a = r() * Math.PI;
      const px = x + Math.round(Math.cos(a) * rad * 0.6);
      const py = cy - Math.round(Math.sin(a) * rad * 0.5);
      p.disc(px, py, 1 + (r() < 0.35 ? 1 : 0), r() < 0.7 ? ROCK.polyp : ROCK.algae);
    }
    x += rad + 2 + Math.round(r() * 4);
  }
  return submerge(p.canvas);
}

/** 12x32 world px: the reef wall, seen down its length. */
export function paintCoralWallV(): HTMLCanvasElement {
  const W = 24, H = 64;
  const p = new Painter(W, H);
  const r = mulberry(3329);
  let y = -4;
  while (y < H) {
    const hh = 16 + Math.round(r() * 14);
    p.rect(2, y, W - 5, hh, ROCK.body);
    p.rect(2, y, 2, hh, ROCK.top);
    p.rect(W - 5, y, 3, hh, ROCK.dark);
    for (let k = 0; k < 2; k++) {
      p.disc(5 + Math.round(r() * (W - 12)), y + 4 + Math.round(r() * Math.max(1, hh - 8)), 1, ROCK.polyp);
    }
    y += hh - 4;
  }
  return submerge(p.canvas);
}

/** 48x32 world px: the ramp that climbs the reef shelf. */
export function paintReefRamp(): HTMLCanvasElement {
  const W = 96, H = 64;
  const p = new Painter(W, H);
  for (let y = 0; y < H; y += 8) {
    p.rect(0, y, W, 8, y % 16 ? ROCK.body : ROCK.dark);
    p.rect(0, y, W, 2, ROCK.top);
    for (let x = (y / 8) % 2 ? 0 : 8; x < W; x += 16) p.rect(x, y + 4, 6, 1, ROCK.dark);
  }
  return submerge(p.canvas);
}

/** 32x15 world px: the kelp farm that replaced the crop rows. */
export function paintKelpFarm(): HTMLCanvasElement {
  const W = 64, H = 30;
  const p = new Painter(W, H);
  const r = mulberry(2233);
  p.rect(0, H - 7, W, 7, '#4a3e2e');
  p.rect(0, H - 3, W, 3, '#5c4d3a');
  for (let i = 0; i < 8; i++) {
    const height = 12 + Math.round(r() * 9);
    let x = 4 + i * 8;
    p.rect(x - 1, H - 9, 3, 3, '#241d14');
    for (let s = 0; s < height; s++) {
      x += Math.sin(s * 0.4 + i) * 0.6;
      p.rect(Math.round(x), H - 10 - s, 2, 2, s % 4 === 0 ? KELP.lit : KELP.body);
      if (s % 3 === 1) {
        const side = ((s / 3) | 0) % 2 ? 1 : -1;
        p.rect(Math.round(x) + side * 2, H - 11 - s, 2, 2, KELP.blade);
      }
    }
  }
  return submerge(p.canvas);
}

/** 32x17 world px: the horizontal garden boundary, as a row of kelp fronds. */
export function paintKelpRailH(): HTMLCanvasElement {
  const W = 64, H = 34;
  const p = new Painter(W, H);
  const r = mulberry(8811);
  p.rect(0, H - 5, W, 5, KELP.dark);
  p.rect(0, H - 5, W, 2, KELP.body);
  for (let i = 0; i < 7; i++) {
    const height = 18 + Math.round(r() * 12);
    let x = 5 + i * 9 + Math.round(r() * 3);
    for (let s = 0; s < height; s++) {
      x += Math.sin(s * 0.3 + i) * 0.5;
      p.rect(Math.round(x), H - 6 - s, 2, 2, s % 5 === 0 ? KELP.lit : KELP.body);
      if (s % 4 === 2) {
        const side = ((s / 4) | 0) % 2 ? 1 : -1;
        for (let b = 0; b < 5; b++) {
          p.rect(Math.round(x) + side * (1 + b), H - 7 - s + Math.round(b * 0.4), 2, 2, b > 3 ? KELP.lit : KELP.blade);
        }
      }
    }
  }
  return submerge(p.canvas);
}
