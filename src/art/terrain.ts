import { T, TILE } from './tiles';
import { mulberry } from './painter';
import type { TownMap } from '../world/map';

/**
 * The visible sea floor. Navigation stays on the discrete tile grid; this pass
 * turns that grid into one continuous reef surface.
 *
 * Every id below is a legacy land slot. The map data was authored as a village,
 * so this renderer is where land becomes reef: turf becomes oolite sand, the
 * walked paths become wet packed sand, cobble becomes coral-rock paving, the
 * old crop rows become a kelp bed, and the terrace becomes coral rock.
 */

const WATER = new Set<number>([T.water, T.water2, T.water3, T.waterLily0, T.waterLily1, T.waterStone, T.bridge, T.plank]);
const CURRENT = new Set<number>([T.path, T.path2, T.pathEdge, T.pathGrassy, T.pathStones, T.pathMud, T.trail, T.trail2, T.trampled, T.soot, T.earth, T.earth2, T.mud, T.mudWet]);
const PAVE = new Set<number>([T.cobble, T.cobble2, T.cobbleCracked, T.cobbleLeaves, T.cobbleMoss, T.cobbleWorn]);
const EDGE = new Set<number>([T.shore, T.shoreGrass, T.reeds0, T.reeds1]);
const KELP = new Set<number>([T.crop, T.crop2, T.tall0, T.tall1, T.tall2, T.seed0, T.seed1, T.seed2]);
const ROCK = new Set<number>([T.cliff, T.cliffTop, T.stairs, T.ledge, T.stoneWall, T.stoneWallV, T.rocks, T.mossStone, T.gravel, T.gravel2]);
const BLOOM = new Set<number>([T.flwWhite0, T.flwWhite1, T.flwBlue0, T.flwBlue1, T.flwYellow0, T.flwYellow1, T.flowers, T.clover, T.leaves, T.weeds, T.grassTall]);
const MAERL = new Set<number>([T.grassDry, T.grassDry2, T.grassWet, T.grassWet2]);

const SEABED = 0, LAGOON = 1, WET_SAND = 2, CORAL_PAVE = 3, REEF_EDGE = 4, KELP_BED = 5, CORAL_ROCK = 6, BLOOM_BED = 7, MAERL_BED = 8;
const FAMILIES = 9;

function familyOf(tile: number): number {
  if (WATER.has(tile)) return LAGOON;
  if (CURRENT.has(tile)) return WET_SAND;
  if (PAVE.has(tile)) return CORAL_PAVE;
  if (EDGE.has(tile)) return REEF_EDGE;
  if (KELP.has(tile)) return KELP_BED;
  if (ROCK.has(tile)) return CORAL_ROCK;
  if (BLOOM.has(tile)) return BLOOM_BED;
  if (MAERL.has(tile)) return MAERL_BED;
  return SEABED;
}

/** Base colour per family, at neutral grain. */
const BASE: readonly (readonly [number, number, number])[] = [
  [188, 172, 136], // oolite seabed
  [24, 72, 96],    // lagoon water
  [156, 140, 108], // wet packed sand
  [150, 133, 133], // coral-rock paving
  [106, 126, 96],  // algae margin along the water
  [56, 98, 78],    // kelp bed
  [134, 126, 118], // coral rock
  [178, 150, 142], // coral bloom over sand
  [198, 188, 170], // bleached maerl rubble
];

export function paintTerrain(map: TownMap): HTMLCanvasElement {
  const w = map.grid.w * TILE * 2, h = map.grid.h * TILE * 2;
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const pixels = ctx.createImageData(w, h), d = pixels.data;
  const mask = new Uint8Array(w * h);
  const r = mulberry(72178);
  const kinds = map.ground.map(row => row.map(familyOf));
  const get = (x: number, y: number) => kinds[Math.max(0, Math.min(map.grid.h - 1, y))]![Math.max(0, Math.min(map.grid.w - 1, x))]!;
  const weights = new Float32Array(FAMILIES);
  // Precomputed waves. This raster is ~9M pixels; eight sine calls per pixel
  // cost seconds of load time on a contended box, and the terrain is already
  // the slowest thing on the page.
  const warpX = new Float32Array(h); for (let y = 0; y < h; y++) warpX[y] = Math.sin(y * 0.19) * 1.6;
  const warpY = new Float32Array(w); for (let x = 0; x < w; x++) warpY[x] = Math.sin(x * 0.17) * 1.6;
  const rowBroad = new Float32Array(h); for (let y = 0; y < h; y++) rowBroad[y] = Math.sin(y * 0.018) * 2 + Math.sin(y * 0.043) * 5 + Math.sin(y * 0.25) * 2;
  const colBroad = new Float32Array(w); for (let x = 0; x < w; x++) colBroad[x] = Math.sin(x * 0.027) * 6 + Math.sin(x * 0.011) * 5 + Math.sin(x * 0.31) * 3;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const fx = (x + warpX[y]!) / (TILE * 2) - 0.5;
    const fy = (y + warpY[x]!) / (TILE * 2) - 0.5;
    const tx = Math.floor(fx), ty = Math.floor(fy), u = fx - tx, v = fy - ty;
    weights.fill(0);
    weights[get(tx, ty)]! += (1 - u) * (1 - v);
    weights[get(tx + 1, ty)]! += u * (1 - v);
    weights[get(tx, ty + 1)]! += (1 - u) * v;
    weights[get(tx + 1, ty + 1)]! += u * v;
    // Stochastic coverage breaks up the last few pixels of a material edge.
    weights[SEABED]! += (r() - 0.5) * 0.2;
    let kind = SEABED;
    for (let k = 1; k < FAMILIES; k++) if (weights[k]! > weights[kind]!) kind = k;
    // The algae margin is a narrow, irregular rim, never a rectangular band.
    if (kind === REEF_EDGE && weights[LAGOON]! < 0.08) kind = SEABED;
    const c = BASE[kind]!;
    const grain = (r() - 0.5) * (kind === LAGOON ? 4 : 13);
    const broad = rowBroad[y]! + colBroad[x]!;
    const i = (y * w + x) * 4;
    for (let ch = 0; ch < 3; ch++) d[i + ch] = c[ch]! + grain + broad;
    d[i + 3] = 255;
    mask[y * w + x] = kind;
  }
  ctx.putImageData(pixels, 0, 0);

  // Sand ripples: the floor is not flat, it is combed by the current. Drawn as
  // soft bands so they read as relief rather than as stripes.
  for (let band = 0, y0 = 0; y0 < h; y0 += 14, band++) {
    ctx.fillStyle = `rgba(255,246,214,${band % 2 ? 0.05 : 0.03})`;
    for (let x = 0; x < w; x += 6) {
      const lift = Math.round(Math.sin(x * 0.021 + band * 1.7) * 3 + Math.sin(x * 0.007 - band) * 4);
      ctx.fillRect(x, y0 + lift, 6, 1);
    }
  }

  // Coral-rock paving: irregular plates that span tile boundaries, each with a
  // cool mortar, a lit upper face, and an occasional coralline joint.
  for (let y = 0, row = 0; y < h; y += 9, row++) {
    for (let x = row % 2 ? -6 : 0; x < w;) {
      const sw = 8 + Math.floor(r() * 7), sh = 6 + Math.floor(r() * 3);
      if (x >= 0 && mask[y * w + x] === CORAL_PAVE) {
        const light = Math.floor(r() * 26);
        ctx.fillStyle = `rgb(${156 + light},${140 + light},${140 + light})`;
        ctx.beginPath(); ctx.moveTo(x + 1, y); ctx.lineTo(x + sw - 2, y);
        ctx.lineTo(x + sw, y + 1); ctx.lineTo(x + sw - 1, y + sh - 1);
        ctx.lineTo(x + 1, y + sh); ctx.lineTo(x, y + 2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(226,238,232,.22)'; ctx.fillRect(x + 1, y, sw - 3, 1);
        if (r() < 0.16) { ctx.fillStyle = '#a86a7a'; ctx.fillRect(x, y + sh, 2, 1); }
      }
      x += sw + 1;
    }
  }

  // Scatter pass: rubble, weed, anemones, kelp fronds, shell grit.
  for (let i = 0; i < w * h / 12; i++) {
    const x = Math.floor(r() * w), y = Math.floor(r() * h), k = mask[y * w + x];
    if (k === SEABED) {
      const v = r();
      if (v < 0.35) { ctx.fillStyle = v < 0.18 ? '#d8c69c' : '#a8926a'; ctx.fillRect(x, y, 1, 1 + Math.floor(r() * 3)); }
      else if (v < 0.42) { ctx.fillStyle = '#7f8f86'; ctx.fillRect(x, y, 2, 1); }
      else if (v < 0.47) { ctx.fillStyle = ['#e0846c', '#cfa0c0', '#f0c882', '#8fd0c8'][Math.floor(r() * 4)]!; ctx.fillRect(x, y - 1, 2, 2); }
    } else if (k === WET_SAND && r() < 0.2) {
      ctx.fillStyle = r() < 0.5 ? '#cdbb96' : '#94825f'; ctx.fillRect(x, y, 2, 1);
    } else if (k === LAGOON && r() < 0.22) {
      ctx.fillStyle = 'rgba(150,214,214,.26)'; ctx.fillRect(x, y, 2 + Math.floor(r() * 5), 1);
    } else if (k === REEF_EDGE && r() < 0.45) {
      for (let j = 0; j < 4; j++) {
        ctx.strokeStyle = j % 2 ? '#4a9a86' : '#1f5f5a';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + j * 2 - 3, y - 8 - r() * 18); ctx.stroke();
      }
    } else if (k === KELP_BED && r() < 0.55) {
      // Kelp: a holdfast and a stalk that leans with the current.
      const lean = (r() - 0.5) * 6;
      ctx.strokeStyle = r() < 0.5 ? '#3f8a6a' : '#2c6b54';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + lean, y - 10 - r() * 16); ctx.stroke();
      ctx.fillStyle = 'rgba(216,196,150,.5)'; ctx.fillRect(x - 1, y, 3, 1);
    } else if (k === BLOOM_BED && r() < 0.3) {
      ctx.fillStyle = ['#e0846c', '#cfa0c0', '#f0c882', '#d4788c'][Math.floor(r() * 4)]!;
      ctx.fillRect(x, y, 2, 2);
      ctx.fillStyle = 'rgba(255,240,220,.6)'; ctx.fillRect(x, y, 1, 1);
    } else if (k === CORAL_ROCK && r() < 0.25) {
      ctx.fillStyle = r() < 0.5 ? '#9a9288' : '#6e6862'; ctx.fillRect(x, y, 2 + Math.floor(r() * 2), 1);
    } else if (k === MAERL_BED && r() < 0.25) {
      ctx.fillStyle = '#efe6d0'; ctx.fillRect(x, y, 1, 1);
    }
  }

  // Caustics: sunlight refracted through the surface, drifting across the floor.
  ctx.globalCompositeOperation = 'lighter';
  for (let b = 0; b < 30; b++) {
    const y0 = r() * h;
    ctx.strokeStyle = `rgba(150,214,214,${(0.025 + r() * 0.045).toFixed(3)})`;
    ctx.lineWidth = 1 + r() * 3;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 24) ctx.lineTo(x, y0 + Math.sin(x * 0.012 + b) * 22 + Math.sin(x * 0.031 + b * 2) * 8);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
  return canvas;
}
