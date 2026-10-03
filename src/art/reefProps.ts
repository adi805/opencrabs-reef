/**
 * Procedural reef props.
 *
 * The props atlas is authored for a dry-land village: a stone fountain, a bell
 * chapel, timber market stalls, a plank footbridge, a street lamp and a hand
 * cart. `submerge()` cools their colours, but a fountain silhouette still
 * reads as a fountain, and once the buildings and the flora were remapped
 * these were the loudest remaining land tell in the frame. Every painter here
 * returns a canvas of exactly `worldW*2 x worldH*2`: the same footprint
 * `ReferenceArt.prop()` produced: so the placement code in TownScene needs no
 * change at all.
 */
import { Painter, mulberry, shade } from './painter';
import { submerge } from './reference';

/** Device texels per world pixel, the ratio every atlas frame is drawn at. */
const S = 2;
const ROCK = { body: '#8f8286', top: '#ab9ea2', dark: '#544a50', joint: '#6d6268' };
const KELP = { body: '#4e6a34', lit: '#7fa04a', dark: '#2b3a22' };
const CORAL = { body: '#b96b7f', lit: '#d99a92', dark: '#6b3446' };
const SHELL = { body: '#d8c3b0', dark: '#8d7261' };
const GLOW = '#78dcc8', CORE = '#e2fbf2';
const FRAME = '#3b3238';

type Rng = () => number;

/** A tapered column: the vent throat, the lamp post, the shrine obelisk. */
function column(p: Painter, cx: number, yTop: number, yBot: number, halfTop: number, halfBot: number, body: string, dark: string): void {
  for (let y = yTop; y <= yBot; y++) {
    const t = (y - yTop) / Math.max(1, yBot - yTop);
    const hw = Math.max(1, Math.round(halfTop + (halfBot - halfTop) * t));
    p.rect(cx - hw, y, hw * 2, 1, body);
    p.px(cx - hw, y, dark);
    p.px(cx + hw - 1, y, dark);
  }
}

/** Hydrothermal vent in a coral basin: the fountain, with the water going up. */
function vent(p: Painter, W: number, H: number, r: Rng): void {
  const cx = Math.round(W / 2);
  const baseY = Math.round(H * 0.62);
  const half = Math.round(W * 0.44);
  for (let y = baseY; y < H; y++) {
    const t = (y - baseY) / Math.max(1, H - baseY);
    const hw = Math.round(half * Math.min(1, 0.5 + t * 0.62));
    p.rect(cx - hw, y, hw * 2, 1, y === baseY ? ROCK.top : ROCK.body);
    p.px(cx - hw, y, ROCK.dark);
    p.px(cx + hw - 1, y, ROCK.dark);
  }
  p.hline(cx - half, baseY, half * 2, ROCK.top);
  // Algae clinging to the basin lip.
  for (let i = 0; i < Math.round(W * 0.5); i++) {
    p.px(Math.round(cx - half + r() * half * 2), baseY + 2 + Math.round(r() * (H - baseY - 3)), r() < 0.5 ? KELP.body : KELP.lit);
  }
  const top = Math.round(H * 0.26);
  column(p, cx, top, baseY + 4, Math.round(W * 0.07), Math.round(W * 0.14), ROCK.body, ROCK.dark);
  p.disc(cx, top, Math.round(W * 0.15), ROCK.top);
  p.disc(cx, top, Math.round(W * 0.08), CORE);
  // Mineral plume: the jet is bubbles now, not water.
  for (let i = 0; i < 12; i++) {
    const bx = Math.round(cx + (r() - 0.5) * W * 0.26);
    const by = Math.round(top - 2 - r() * H * 0.2);
    p.disc(bx, by, 1 + Math.round(r() * 2), i % 3 === 0 ? CORE : GLOW);
  }
}

/** Coral shrine: the chapel, without a bell tower or a slate roof. */
function shrine(p: Painter, W: number, H: number, r: Rng): void {
  const wallH = Math.round(H * 0.52), wallTop = H - wallH;
  const roofBase = wallTop + 2, roofTop = Math.round(H * 0.06);
  for (let y = roofTop; y < roofBase; y++) {
    const t = (y - roofTop) / Math.max(1, roofBase - roofTop);
    const hw = Math.round((W / 2 - 2) * Math.min(1, t * 1.3 + 0.15));
    p.rect(W / 2 - hw, y, hw * 2, 1, KELP.body);
    p.hline(W / 2 - hw, y, Math.max(1, Math.round(hw * 0.5)), KELP.lit);
    p.px(W / 2 + hw - 1, y, KELP.dark);
  }
  p.rect(1, wallTop, W - 2, wallH - 1, ROCK.body);
  p.hline(1, wallTop, W - 2, ROCK.top);
  p.hline(1, H - 2, W - 2, ROCK.dark);
  p.vline(1, wallTop, wallH - 1, ROCK.dark);
  p.vline(W - 2, wallTop, wallH - 1, ROCK.dark);
  for (let x = 4; x < W - 4; x += 8 + Math.round(r() * 6)) p.vline(x, wallTop + 2, wallH - 4, ROCK.joint);
  const dw = Math.max(6, Math.round(W * 0.13)), dx = Math.round((W - dw) / 2);
  const dh = Math.round(wallH * 0.6);
  p.rect(dx - 1, H - dh - 2, dw + 2, dh + 1, FRAME);
  p.rect(dx, H - dh, dw, dh - 1, '#2f2a33');
  // A coral obelisk on the ridge, where the bell would hang.
  const ox = Math.round(W * 0.68);
  column(p, ox, Math.round(H * 0.02), roofTop + 6, 2, 3, CORAL.body, CORAL.dark);
  p.disc(ox, Math.round(H * 0.02), 3, CORAL.lit);
  p.rect(dx + 2, H - Math.round(wallH * 0.45), Math.max(2, dw - 4), 2, GLOW);
}

/** Kelp-awning stall over a shell counter: the market. */
function stall(p: Painter, W: number, H: number, r: Rng, alt: boolean): void {
  const postY = Math.round(H * 0.3), counterY = Math.round(H * 0.62);
  const post = alt ? CORAL.dark : ROCK.dark;
  p.rect(2, postY, 3, H - postY - 2, post);
  p.rect(W - 5, postY, 3, H - postY - 2, post);
  for (let i = 0; i < Math.round(W / 7); i++) {
    const x = 1 + Math.round(r() * (W - 3));
    const len = Math.round(H * (0.1 + r() * 0.12));
    p.rect(x, postY - len, 2, len, r() < 0.5 ? KELP.lit : KELP.body);
    p.px(x, postY - len, KELP.dark);
  }
  p.hline(1, postY, W - 2, alt ? CORAL.body : KELP.body);
  p.rect(1, counterY, W - 2, 4, SHELL.body);
  p.hline(1, counterY + 4, W - 2, SHELL.dark);
  p.vline(4, counterY + 5, H - counterY - 6, ROCK.dark);
  p.vline(W - 5, counterY + 5, H - counterY - 6, ROCK.dark);
  for (let i = 0; i < Math.round(W / 12); i++) {
    const x = 4 + Math.round(r() * (W - 12));
    const c = r();
    p.rect(x, counterY - 3, 4, 3, c < 0.4 ? SHELL.body : c < 0.7 ? CORAL.lit : KELP.lit);
  }
}

/** Coral arch span: the canal footbridge and the dock. */
function arch(p: Painter, W: number, H: number, r: Rng): void {
  const deck = Math.round(H * 0.34);
  const half = Math.round(W * 0.42);
  for (let y = deck; y < H; y++) {
    const t = (y - deck) / Math.max(1, H - deck);
    const hw = Math.round(half * (0.35 + t * 0.7));
    p.rect(W / 2 - hw, y, hw * 2, 1, ROCK.body);
    p.px(W / 2 - hw, y, ROCK.dark);
    p.px(W / 2 + hw - 1, y, ROCK.dark);
  }
  p.rect(0, deck - 3, W, 4, ROCK.top);
  p.hline(0, deck - 4, W, ROCK.dark);
  for (let x = 2; x < W - 2; x += 7 + Math.round(r() * 6)) p.vline(x, deck - 8, 4, KELP.lit);
  for (let i = 0; i < Math.round(W * 0.4); i++) {
    p.px(Math.round(r() * W), deck + 2 + Math.round(r() * (H - deck - 3)), r() < 0.5 ? '#cfa0b0' : '#9fb8b0');
  }
}

/** Boulder coral: the loose rock, with polyps instead of lichen. */
function coralHead(p: Painter, W: number, H: number, r: Rng): void {
  const cx = Math.round(W / 2), cy = Math.round(H * 0.6);
  const rad = Math.max(3, Math.round(Math.min(W, H) * 0.46));
  p.disc(cx, cy, rad, CORAL.body);
  p.disc(cx - 1, cy - 1, Math.round(rad * 0.72), CORAL.lit);
  for (let i = 0; i < rad * 3; i++) {
    const a = r() * Math.PI * 2, d = r() * rad;
    p.px(Math.round(cx + Math.cos(a) * d), Math.round(cy + Math.sin(a) * d * 0.7), r() < 0.5 ? CORAL.dark : '#e7c7bd');
  }
  p.rect(cx - rad, H - 3, rad * 2, 3, ROCK.dark);
}

/** Bioluminescent lamp: the same silhouette, the light is alive now. */
/** A bioluminescent coral stalk: the street lamp, grown rather than built. */
function lamp(p: Painter, W: number, H: number): void {
  const cx = Math.round(W / 2);
  const yBot = H - 1, yTop = Math.max(3, Math.round(H * 0.24));
  for (let y = yBot; y >= yTop; y--) {
    const t = (yBot - y) / Math.max(1, yBot - yTop);
    const dx = Math.round(Math.sin(t * 2.4) * Math.max(1, W * 0.14));
    const hw = Math.max(1, Math.round(1.4 + t * 0.9));
    p.rect(cx + dx - hw, y, hw * 2, 1, t > 0.5 ? CORAL.body : shade(CORAL.body, 0.85));
    p.px(cx + dx - hw, y, CORAL.dark);
    p.px(cx + dx + hw - 1, y, CORAL.lit);
  }
  const span = Math.max(2, Math.round(W * 0.32));
  p.disc(cx - span, Math.round(yBot - (yBot - yTop) * 0.46), 1, GLOW);
  p.disc(cx + span, Math.round(yBot - (yBot - yTop) * 0.66), 1, GLOW);
  p.disc(cx, yTop, Math.max(2, Math.round(W * 0.36)), shade(GLOW, 0.72));
  p.disc(cx, yTop, Math.max(1, Math.round(W * 0.2)), CORE);
}

/** Shell sled: the hand cart, with a shell hull and a kelp load. */
function sled(p: Painter, W: number, H: number, r: Rng): void {
  const bodyY = Math.round(H * 0.42), bodyH = Math.round(H * 0.42);
  for (let y = bodyY; y < bodyY + bodyH; y++) {
    const t = (y - bodyY) / Math.max(1, bodyH);
    const hw = Math.round((W / 2 - 3) * (1 - t * 0.45));
    p.rect(W / 2 - hw, y, hw * 2, 1, y < bodyY + 2 ? SHELL.body : shade(SHELL.body, 0.86 - t * 0.2));
    p.px(W / 2 - hw, y, SHELL.dark);
    p.px(W / 2 + hw - 1, y, SHELL.dark);
  }
  p.hline(2, bodyY, W - 4, '#f0e2d4');
  for (let i = 0; i < Math.round(W / 5); i++) {
    const x = 4 + Math.round(r() * (W - 8));
    const len = 3 + Math.round(r() * Math.round(H * 0.2));
    p.rect(x, bodyY - len, 2, len, r() < 0.5 ? KELP.lit : KELP.body);
  }
  p.rect(2, bodyY + bodyH + 1, W - 4, 2, ROCK.dark);
  p.px(2, bodyY + bodyH + 3, ROCK.dark);
  p.px(W - 3, bodyY + bodyH + 3, ROCK.dark);
}

/**
 * Reef replacement for props-atlas index `index`, at the same world footprint
 * the atlas sprite had. Indices follow TownScene's `art.prop()` table:
 * 0 fountain, 1 chapel, 2/3 market stalls, 4 bridge, 5 rock, 6 lamp, 7 cart.
 */
export function paintReefProp(index: number, worldW: number, worldH: number): HTMLCanvasElement {
  const W = Math.max(2, Math.round(worldW * S));
  const H = Math.max(2, Math.round(worldH * S));
  const r = mulberry(4200 + index * 7919);
  const p = new Painter(W, H);
  switch (index) {
    case 0: vent(p, W, H, r); break;
    case 1: shrine(p, W, H, r); break;
    case 2: stall(p, W, H, r, false); break;
    case 3: stall(p, W, H, r, true); break;
    case 4: arch(p, W, H, r); break;
    case 6: lamp(p, W, H); break;
    case 7: sled(p, W, H, r); break;
    default: coralHead(p, W, H, r);
  }
  return submerge(p.canvas);
}
