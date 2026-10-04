import type { BuildingKind } from '../art/buildings';
import type { Facing } from '../art/characters';
import { T, TILE } from '../art/tiles';
import { mulberry } from '../art/painter';
import type { Place } from '../sim/toolMap';
import type { Grid, Point } from './pathfind';
import { buildCountryside } from './countryside';
import { hasWorldSprite } from './dressing';

/** The authored town, in its own local tile space. */
export const LOCAL_W = 64;
export const LOCAL_H = 42;
/** Where the town sits inside the world. */
export const TOWN_OX = 26;
export const TOWN_OY = 16;
/** The whole world: countryside around the town. */
export const MAP_W = 116;
export const MAP_H = 76;

export type PropKind =
  | 'tree' | 'lamp' | 'well' | 'bench' | 'crate' | 'barrel' | 'anvil' | 'workbench' | 'lectern' | 'telescope'
  | 'postbox' | 'desk' | 'stall' | 'bush' | 'rock' | 'log' | 'mushroom' | 'hay' | 'signpost' | 'porchBench'
  | 'firewood' | 'cart' | 'tools' | 'stoneMarker' | 'grave0' | 'grave1' | 'grave2' | 'deadTree' | 'clothesline' | 'shed'
  | 'fallenLog' | 'choppingBlock' | 'wheelbarrow' | 'beehive' | 'campfire' | 'shrine' | 'brokenWheel' | 'mailSacks' | 'parcels' | 'noticeBoard'
  | 'banner' | 'tavernSign' | 'lantern' | 'flowerBox' | 'planter' | 'timberPile' | 'sawhorse' | 'coalPile' | 'metalStack' | 'bridgePost'
  | 'awning' | 'bookCrates' | 'fountain' | 'chapel' | 'sunflowers' | 'marketStall0' | 'marketStall1' | 'moonSign' | 'teapotSign' | 'hedge' | 'dock';

export interface Building {
  id: string;
  kind: BuildingKind;
  x: number; y: number; w: number; h: number;
  /** Walkable tile in front of the door. */
  door: Point;
  /** Tiles beside the door where a finished resident may sit. */
  porch: Point[];
  label: string;
}

export interface Station {
  id: string;
  place: Place;
  tile: Point;
  facing: Facing;
  prop: { kind: PropKind; x: number; y: number };
}

export interface Prop { kind: PropKind; x: number; y: number; variant?: number; blocks?: Point[] }

export interface TownMap {
  ground: number[][];
  /** Terrain height 0..1 per tile, for tone and cloud shading. */
  height: Float32Array;
  /** Where grazing animals live: centre in world px and wander range. */
  critters?: { kind: 'chicken' | 'cat' | 'sheep' | 'duck'; x: number; y: number; range: number }[];
  /** Animated props in world px. */
  clotheslines?: Point[];
  /** Chimneys that trickle smoke all day, in world px. */
  idleSmoke?: Point[];
  grid: Grid;
  buildings: Building[];
  stations: Station[];
  props: Prop[];
  homes: Building[];
  lamps: Point[];
  entrance: Point;
}

const inb = (x: number, y: number) => x >= 0 && y >= 0 && x < LOCAL_W && y < LOCAL_H;

/** Rasterize a polyline of tile points with the given width. */
function stroke(points: Point[], width: number, put: (x: number, y: number) => void): void {
  const half = Math.floor(width / 2);
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!, b = points[i + 1]!;
    const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    for (let s = 0; s <= steps; s++) {
      const x = Math.round(a.x + ((b.x - a.x) * s) / steps), y = Math.round(a.y + ((b.y - a.y) * s) / steps);
      for (let dy = -half; dy < width - half; dy++) for (let dx = -half; dx < width - half; dx++) if (inb(x + dx, y + dy)) put(x + dx, y + dy);
    }
  }
}

/**
 * A meandering channel instead of a street. Every lane on the map used to be a
 * straight two-point stroke, and a set of straight lanes meeting at right
 * angles is a street grid: it was the last thing in the frame that still read
 * as a village plan rather than a reef flat. The endpoints are untouched, so
 * every station stays reachable and pathing is unchanged; only the line
 * between them wanders, the way a sand channel scoured by a current does.
 */
function bend(points: Point[], amplitude: number, put: (x: number, y: number) => void, width: number): void {
  const out: Point[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!, b = points[i + 1]!;
    const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y), 2);
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
    const phase = (i * 2.3) % 6.283;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      // Zero offset at both ends, so the waypoints themselves never move.
      const env = Math.sin(Math.PI * t);
      const off = Math.sin(t * 7.1 + phase) * amplitude * env;
      out.push({ x: a.x + (b.x - a.x) * t + nx * off, y: a.y + (b.y - a.y) * t + ny * off });
    }
  }
  out.push(points[points.length - 1]!);
  stroke(out, width, put);
}

export function buildTownLocal(): TownMap {
  const r = mulberry(4321);
  const ground: number[][] = [];
  for (let y = 0; y < LOCAL_H; y++) {
    ground.push([]);
    for (let x = 0; x < LOCAL_W; x++) {
      const v = r();
      // Reef floor, not a lawn: pale oolite sand with kelp beds growing across
      // it in patches. The dither is what stops the open ground reading as one
      // flat material, and the kelp (bank family) is drawn with fronds.
      ground[y]!.push(
        v < 0.4 ? T.grass : v < 0.6 ? T.grass2 : v < 0.72 ? T.grass3 : v < 0.78 ? T.grassTall
          : v < 0.9 ? T.shore : v < 0.97 ? T.reeds0 : T.reeds1,
      );
    }
  }
  const road = new Set<number>();
  const water = new Set<number>();
  const key = (x: number, y: number) => y * LOCAL_W + x;

  // ---- roads
  const putRoad = (x: number, y: number) => road.add(key(x, y));
  bend([{ x: 1, y: 22 }, { x: 8, y: 20 }, { x: 16, y: 22 }, { x: 23, y: 21 }], 3.0, putRoad, 3);           // west channel
  bend([{ x: 40, y: 21 }, { x: 48, y: 23 }, { x: 56, y: 21 }, { x: 62, y: 22 }], 3.0, putRoad, 3);          // east channel
  bend([{ x: 31, y: 1 }, { x: 31, y: 16 }], 2.8, putRoad, 3);                                               // north channel (plateau)
  bend([{ x: 31, y: 27 }, { x: 30, y: 34 }, { x: 31, y: 40 }], 3.0, putRoad, 3);                            // south channel
  bend([{ x: 2, y: 40 }, { x: 15, y: 39 }, { x: 28, y: 40 }, { x: 44, y: 39 }, { x: 60, y: 40 }], 3.4, putRoad, 2); // home channel, south of the houses
  bend([{ x: 10, y: 12 }, { x: 10, y: 21 }], 2.7, putRoad, 2);                                              // library channel
  bend([{ x: 51, y: 12 }, { x: 51, y: 21 }], 2.7, putRoad, 2);                                              // workshop channel
  bend([{ x: 9, y: 24 }, { x: 9, y: 31 }], 2.5, putRoad, 2);                                                // post channel
  bend([{ x: 19, y: 24 }, { x: 20, y: 31 }], 2.7, putRoad, 2);                                              // observatory channel
  bend([{ x: 42, y: 24 }, { x: 43, y: 31 }], 2.7, putRoad, 2);                                              // tavern channel
  bend([{ x: 50, y: 24 }, { x: 50, y: 31 }], 2.5, putRoad, 2);                                              // forge channel

  // ---- lagoon channel and tide pool
  // The town sits on a reef flat, so water is not a river to be crossed: it is
  // the medium the lanes run through. The channel meanders and swells into
  // basins instead of running straight, and the lanes that reach it continue as
  // packed-sand causeways. A straight channel with plank spans was the single
  // strongest land tell left in the frame: nothing underwater has bridges.
  const putWater = (x: number, y: number) => water.add(key(x, y));
  // Open water, not a canal. A narrow strip running the full height of the map
  // reads as a river with a current, and a river frames everything beside it as
  // dry land: it was the single strongest land tell left in the frame. The east
  // of the reef flat is simply lagoon, meeting the town at an irregular shore,
  // so the lanes end at water instead of crossing it on a span.
  for (let y = 0; y < LOCAL_H; y++) {
    const shore = 56 + Math.round(Math.sin(y * 0.47) * 2.4 + Math.sin(y * 0.15 + 1.1) * 1.7);
    for (let x = shore; x < LOCAL_W; x++) putWater(x, y);
  }
  // Basins where the channel widens, plus the old pond folded into one of them.
  for (const [cx, cy, rr] of [[60, 5, 5], [59, 20, 5.5], [60, 34, 5]] as const) {
    for (let y = Math.max(0, cy - 7); y <= Math.min(LOCAL_H - 1, cy + 7); y++) {
      for (let x = Math.max(0, cx - 7); x <= Math.min(LOCAL_W - 1, cx + 7); x++) {
        if (Math.hypot(x - cx, (y - cy) * 1.15) < rr) putWater(x, y);
      }
    }
  }
  // Causeways: the east street and the home street keep their packed-sand
  // surface across the water, so pathing still reaches the east bank.
  for (const y of [22, 40]) bend([{ x: 55, y }, { x: 63, y }], 2.3, putRoad, 2);

  // ---- write ground
  // The square is a lagoon, not a cobbled plaza. A grey cobblestone centre was
  // the frame's most repeated land tell, and no palette key makes paving read
  // as sea floor. Keep a sand rim, and the streets that cross it, as walkable
  // causeways so resident pathing still reaches every station, and flood the
  // middle into a shallow lagoon.
  // The basin shore wobbles with angle instead of following the tile grid. A
  // rectangular lagoon still read as a man-made plaza: the corner tiles gave it
  // away no matter what the water was painted with.
  const sqCx = 31.5;
  const sqCy = 22;
  const sqRx = 9.8;
  const sqRy = 6.4;
  const shoreRadius = (x: number, y: number) => {
    const a = Math.atan2(y + 0.5 - sqCy, x + 0.5 - sqCx);
    return 1 + 0.17 * Math.sin(a * 3 + 0.7) + 0.11 * Math.sin(a * 5 - 1.9) + 0.07 * Math.sin(a * 7 + 2.3);
  };
  const RIM = 0.78; // inner fraction of the basin that floods
  let n = 0;
  for (let y = 0; y < LOCAL_H; y++) for (let x = 0; x < LOCAL_W; x++) {
    const k = key(x, y);
    const q = Math.hypot((x + 0.5 - sqCx) / sqRx, (y + 0.5 - sqCy) / sqRy) / shoreRadius(x, y);
    const inSquare = q <= 1;
    const onRim = inSquare && q > RIM;
    if (water.has(k) && road.has(k)) ground[y]![x] = (n++ % 9 === 4) ? T.path2 : T.path; // sand causeway, not a bridge
    else if (water.has(k)) ground[y]![x] = (x + y) % 3 ? T.water : T.water2;
    else if (inSquare && !onRim && !road.has(k)) ground[y]![x] = (x + y) % 3 ? T.water : T.water2;
    else if (inSquare || road.has(k)) ground[y]![x] = (n++ % 7 === 3) ? T.path2 : T.path;
  }
  // shore around water
  for (let y = 0; y < LOCAL_H; y++) for (let x = 0; x < LOCAL_W; x++) {
    if (water.has(key(x, y)) || road.has(key(x, y))) continue;
    const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inb(x + dx!, y + dy!) && water.has(key(x + dx!, y + dy!)));
    if (near) ground[y]![x] = T.shore;
  }
  // Cobblestone paving is gone with the plaza: the square is a lagoon now, so
  // the old crack/moss/worn paving pass had no cobble tile left to decorate.
  // roads: edges erode into grass, grass creeps in, stones and mud show through
  const isPathTile = (x: number, y: number) => inb(x, y) && (ground[y]![x] === T.path || ground[y]![x] === T.path2);
  const eroded: [number, number, number][] = [];
  for (let y = 1; y < LOCAL_H - 1; y++) for (let x = 1; x < LOCAL_W - 1; x++) {
    const g = ground[y]![x]!;
    if (g === T.path || g === T.path2) {
      const sides = [isPathTile(x - 1, y), isPathTile(x + 1, y), isPathTile(x, y - 1), isPathTile(x, y + 1)].filter((b) => !b).length;
      const v = r();
      if (sides >= 1 && v < 0.35) eroded.push([x, y, T.pathEdge]);
      else if (sides === 0 && v < 0.05) eroded.push([x, y, T.pathGrassy]);
      else if (v < 0.07) eroded.push([x, y, T.pathStones]);
      else if (v < 0.1) eroded.push([x, y, T.pathMud]);
    } else if ((g === T.grass || g === T.grass2 || g === T.grass3) && r() < 0.18) {
      const n4 = [isPathTile(x - 1, y), isPathTile(x + 1, y), isPathTile(x, y - 1), isPathTile(x, y + 1)].filter(Boolean).length;
      if (n4 >= 1 && r() < 0.5) eroded.push([x, y, T.pathEdge]);
      else if (n4 >= 1) eroded.push([x, y, T.trampled]);
    }
  }
  for (const [x, y, t] of eroded) { ground[y]![x] = t; if (t === T.pathEdge || t === T.pathGrassy || t === T.pathStones || t === T.pathMud) road.add(key(x, y)); }
  // plateau: the cliff face wanders instead of sitting on one row. A
  // dead-straight scarp running the width of the map reads as a landscaped
  // retaining wall, which is a garden feature rather than a reef edge.
  for (let x = 1; x < LOCAL_W - 1; x++) {
    const cy = Math.max(13, Math.min(15, 14 + Math.round(Math.sin(x * 0.31) * 1.2 + Math.sin(x * 0.11 + 0.7) * 0.9)));
    // Break the scarp into buttresses. A band that runs the whole map reads as
    // a built retaining wall however much its edge wanders, so leave eroded
    // gaps where the rock has slumped into a walkable rubble slope instead.
    if (Math.sin(x * 0.083 + 1.3) > 0.45) {
      for (let y = cy; y <= 15; y++) {
        if (water.has(key(x, y)) || road.has(key(x, y))) continue;
        ground[y]![x] = (x + y) % 3 ? T.pathEdge : T.pathStones;
      }
      continue;
    }
    for (let y = cy; y <= 15; y++) {
      if (water.has(key(x, y))) continue;
      if (road.has(key(x, y))) { ground[y]![x] = T.path2; continue; }
      ground[y]![x] = T.cliff;
    }
    if (!road.has(key(x, cy - 1)) && !water.has(key(x, cy - 1)) && ground[cy - 1]![x] !== T.shore) ground[cy - 1]![x] = T.cliffTop;
  }
  // a natural ramp climbs from the lagoon to the hall: wet sand, not paving
  for (let y = 11; y <= 15; y++) for (let x = 30; x <= 32; x++) if (ground[y]![x] !== T.stairs) ground[y]![x] = (x + y) % 2 ? T.path : T.path2;
  // kelp bed on the plateau between the library and the hall: the old crop
  // rows are planted kelp now, so the tiles are the reef's, not the farm's.
  for (let y = 7; y <= 10; y++) for (let x = 18; x <= 23; x++) ground[y]![x] = (x + y) % 2 ? T.tall0 : T.tall1;
  for (let x = 17; x <= 24; x += 2) ground[6]![x] = r() < 0.6 ? T.tall0 : T.weeds;
  for (let y = 7; y <= 10; y += 2) ground[y]![24] = r() < 0.6 ? T.tall1 : T.clover;
  // fenced yards behind two houses
  for (const hx of [10, 43]) for (let x = hx - 1; x <= hx + 5; x += 2) ground[32]![x] = r() < 0.5 ? T.weeds : T.clover;
  // soot and trampled ground around the forge, a vegetable garden by the observatory
  for (let y = 23; y <= 24; y++) for (let x = 45; x <= 55; x++) if (ground[y]![x] === T.grass || ground[y]![x] === T.grass2 || ground[y]![x] === T.grass3) ground[y]![x] = r() < 0.6 ? T.soot : T.trampled;
  for (let y = 30; y <= 31; y++) for (let x = 45; x <= 55; x++) if ((ground[y]![x] === T.grass || ground[y]![x] === T.grass2) && r() < 0.5) ground[y]![x] = T.soot;
  for (let y = 23; y <= 24; y++) for (let x = 12; x <= 15; x++) ground[y]![x] = (x + y) % 2 ? T.tall0 : T.tall1;
  for (let y = 22; y <= 25; y += 2) ground[y]![16] = r() < 0.6 ? T.tall1 : T.weeds;
  for (let x = 11; x <= 16; x += 2) ground[25]![x] = r() < 0.5 ? T.weeds : T.tall0;
  // tavern beer garden: a fenced corner with a gap toward the lane
  for (let x = 34; x <= 37; x += 2) ground[27]![x] = r() < 0.5 ? T.tall0 : T.weeds;
  for (let y = 28; y <= 30; y += 2) ground[y]![34] = r() < 0.5 ? T.weeds : T.clover;
  // observatory equipment yard
  for (let x = 23; x <= 26; x += 2) ground[26]![x] = r() < 0.5 ? T.rocks : T.weeds;
  for (let y = 27; y <= 29; y += 2) ground[y]![26] = r() < 0.5 ? T.rocks : T.clover;
  // scattered ground detail, in loose clusters
  for (let i = 0; i < 120; i++) {
    const cx = Math.floor(r() * LOCAL_W), cy = Math.floor(r() * LOCAL_H);
    const kind = r();
    for (let k = 0; k < 4; k++) {
      const x = cx + Math.floor((r() - 0.5) * 5), y = cy + Math.floor((r() - 0.5) * 4);
      if (!inb(x, y)) continue;
      const g = ground[y]![x]!;
      if (!(g === T.grass || g === T.grass2 || g === T.grass3)) continue;
      ground[y]![x] = kind < 0.3 ? (r() < 0.5 ? T.flwWhite0 : T.flwYellow0) : kind < 0.45 ? T.flwBlue0 : kind < 0.65 ? T.clover : kind < 0.8 ? T.tall0 : kind < 0.9 ? T.rocks : T.weeds;
    }
  }

  // ---- buildings
  const mk = (id: string, kind: BuildingKind, x: number, y: number, w: number, h: number, label: string): Building => ({
    id, kind, x, y, w, h, door: { x: x + Math.floor(w / 2), y: y + h }, porch: [], label,
  });
  const buildings: Building[] = [
    mk('hall', 'hall', 26, 6, 11, 5, 'Reef Hall'),
    mk('library', 'library', 4, 6, 11, 5, 'Coral Archive'),
    mk('workshop', 'workshop', 46, 6, 10, 5, 'Shell Workshop'),
    mk('forge', 'forge', 47, 25, 9, 5, 'Vent Forge'),
    mk('post', 'post', 3, 25, 10, 5, 'Tide Post'),
    mk('observatory', 'observatory', 16, 25, 7, 5, 'Lighthouse'),
    mk('tavern', 'tavern', 38, 25, 8, 5, 'Kelp Bar'),
  ];
  buildings[0]!.door = { x: 31, y: 11 };
  buildings[1]!.door = { x: 10, y: 11 };
  buildings[2]!.door = { x: 51, y: 11 };
  const homes: Building[] = [];
  // Scattered burrows, not a suburban terrace. Seven identical houses on one
  // straight row at y=35 was the single strongest land tell left in the frame:
  // a rigid grid of front doors facing a walkway reads as a village street no
  // matter what the walls are painted with. Each home is offset in y as well as
  // x, and the widths vary, so the row never resolves into a line. `hy` stays
  // in 33..35 so the three-row approach below each footprint still reaches the
  // home street at y=39 and every door stays connected.
  const homeSpots: readonly (readonly [number, number, number])[] = [
    [2, 34, 5], [10, 33, 6], [16, 35, 4], [23, 33, 5], [35, 35, 6], [43, 33, 4], [49, 34, 5],
  ];
  homeSpots.forEach(([hx, hy, hw], i) => {
    const h = mk(`home-${i}`, 'house', hx, hy, hw, 4, `House ${i + 1}`);
    h.porch = [{ x: hx, y: hy + 4 }, { x: hx + hw - 1, y: hy + 4 }];
    homes.push(h);
  });

  // ---- stations: outdoors, in front of buildings, prop beside the stand
  const stations: Station[] = [];
  const st = (place: Place, tile: Point, facing: Facing, prop: PropKind, px: number, py: number) => {
    stations.push({ id: `${place}-${stations.length}`, place, tile, facing, prop: { kind: prop, x: px, y: py } });
  };
  st('library', { x: 5, y: 13 }, 'right', 'lectern', 6 * TILE + 1, 13 * TILE - 2);
  st('library', { x: 7, y: 13 }, 'right', 'lectern', 8 * TILE + 1, 13 * TILE - 2);
  st('library', { x: 14, y: 13 }, 'left', 'lectern', 13 * TILE + 1, 13 * TILE - 2);
  st('library', { x: 12, y: 13 }, 'left', 'lectern', 11 * TILE + 1, 13 * TILE - 2);
  st('workshop', { x: 47, y: 13 }, 'right', 'workbench', 48 * TILE - 3, 13 * TILE + 1);
  st('workshop', { x: 47, y: 15 }, 'right', 'workbench', 48 * TILE - 3, 15 * TILE + 1);
  st('workshop', { x: 55, y: 13 }, 'left', 'workbench', 53 * TILE + 3, 13 * TILE + 1);
  st('workshop', { x: 55, y: 15 }, 'left', 'workbench', 53 * TILE + 3, 15 * TILE + 1);
  st('forge', { x: 46, y: 31 }, 'right', 'anvil', 47 * TILE, 31 * TILE + 2);
  st('forge', { x: 53, y: 31 }, 'left', 'anvil', 52 * TILE, 31 * TILE + 2);
  st('forge', { x: 45, y: 23 }, 'right', 'anvil', 46 * TILE, 23 * TILE + 2);
  st('forge', { x: 55, y: 23 }, 'left', 'anvil', 54 * TILE, 23 * TILE + 2);
  st('post', { x: 5, y: 31 }, 'right', 'postbox', 6 * TILE + 3, 31 * TILE - 4);
  st('post', { x: 12, y: 31 }, 'left', 'postbox', 11 * TILE + 3, 31 * TILE - 4);
  st('post', { x: 5, y: 23 }, 'right', 'crate', 6 * TILE + 2, 23 * TILE + 2);
  st('observatory', { x: 16, y: 31 }, 'right', 'telescope', 17 * TILE, 31 * TILE - 6);
  st('observatory', { x: 22, y: 31 }, 'left', 'telescope', 21 * TILE, 31 * TILE - 6);
  st('observatory', { x: 24, y: 28 }, 'up', 'telescope', 24 * TILE, 27 * TILE - 4);
  st('hall', { x: 27, y: 12 }, 'right', 'desk', 28 * TILE - 2, 12 * TILE + 2);
  st('hall', { x: 35, y: 12 }, 'left', 'desk', 33 * TILE + 2, 12 * TILE + 2);
  st('hall', { x: 25, y: 9 }, 'up', 'desk', 25 * TILE - 2, 8 * TILE + 3);
  st('hall', { x: 37, y: 9 }, 'up', 'desk', 37 * TILE - 2, 8 * TILE + 3);
  st('tavern', { x: 36, y: 28 }, 'down', 'bench', 36 * TILE - 2, 29 * TILE + 2);
  st('tavern', { x: 37, y: 31 }, 'down', 'bench', 37 * TILE - 2, 32 * TILE + 2);
  st('tavern', { x: 45, y: 31 }, 'down', 'bench', 45 * TILE - 2, 32 * TILE + 2);
  st('tavern', { x: 36, y: 30 }, 'down', 'bench', 36 * TILE - 2, 31 * TILE + 2);
  st('tavern', { x: 40, y: 31 }, 'down', 'barrel', 40 * TILE + 3, 32 * TILE + 2);
  st('market', { x: 24, y: 19 }, 'right', 'stall', 25 * TILE - 2, 19 * TILE + 2);
  st('market', { x: 24, y: 21 }, 'right', 'stall', 25 * TILE - 2, 21 * TILE + 2);
  st('market', { x: 38, y: 19 }, 'left', 'stall', 36 * TILE + 2, 19 * TILE + 2);
  st('market', { x: 38, y: 21 }, 'left', 'stall', 36 * TILE + 2, 21 * TILE + 2);
  st('market', { x: 28, y: 25 }, 'up', 'crate', 28 * TILE + 2, 24 * TILE + 2);
  st('market', { x: 34, y: 25 }, 'up', 'crate', 34 * TILE + 2, 24 * TILE + 2);

  // ---- props
  const props: Prop[] = [];
  // the fountain is the heart of the square; the old well moved to the tavern corner
  props.push({ kind: 'fountain', x: 30 * TILE + 6, y: 20 * TILE - 2, blocks: [{ x: 30, y: 20 }, { x: 31, y: 20 }, { x: 32, y: 20 }, { x: 30, y: 21 }, { x: 31, y: 21 }, { x: 32, y: 21 }] });
  props.push({ kind: 'well', x: 44 * TILE + 4, y: 31 * TILE - 8, blocks: [{ x: 44, y: 30 }, { x: 45, y: 30 }, { x: 44, y: 31 }] });
  const plaza: [PropKind, number, number, boolean][] = [
    ['planter', 28 * TILE + 1, 19 * TILE, true], ['planter', 34 * TILE + 1, 19 * TILE, true], ['planter', 28 * TILE + 1, 23 * TILE - 4, true], ['planter', 34 * TILE + 1, 23 * TILE - 4, true],
    ['flowerBox', 29 * TILE - 1, 17 * TILE + 2, true], ['flowerBox', 33 * TILE - 1, 17 * TILE + 2, true],
    ['banner', 25 * TILE + 2, 16 * TILE - 12, true], ['banner', 37 * TILE + 2, 16 * TILE - 12, true], ['banner', 25 * TILE + 2, 26 * TILE - 12, true], ['banner', 37 * TILE + 2, 26 * TILE - 12, true],
    ['noticeBoard', 30 * TILE - 3, 26 * TILE - 8, true], ['cart', 22 * TILE + 2, 23 * TILE - 2, true], ['crate', 23 * TILE + 8, 24 * TILE + 2, true], ['barrel', 24 * TILE + 3, 24 * TILE, true],
    ['barrel', 39 * TILE + 3, 24 * TILE, true], ['crate', 39 * TILE + 2, 25 * TILE + 2, true], ['lantern', 29 * TILE + 4, 25 * TILE - 6, false], ['lantern', 33 * TILE + 4, 25 * TILE - 6, false],
    ['bench', 30 * TILE, 22 * TILE + 6, true], ['bench', 33 * TILE - 4, 22 * TILE + 6, true],
    ['marketStall0', 26 * TILE - 2, 17 * TILE - 12, true], ['marketStall1', 35 * TILE + 2, 17 * TILE - 12, true],
    ['flowerBox', 30 * TILE - 2, 15 * TILE + 2, true], ['flowerBox', 32 * TILE + 2, 15 * TILE + 2, true],
    ['planter', 29 * TILE - 2, 16 * TILE + 2, true], ['planter', 33 * TILE + 4, 16 * TILE + 2, true],
    ['lantern', 25 * TILE + 8, 20 * TILE - 6, false], ['lantern', 37 * TILE + 8, 20 * TILE - 6, false],
    ['flowerBox', 27 * TILE - 2, 24 * TILE + 8, true], ['flowerBox', 35 * TILE + 2, 24 * TILE + 8, true],
  ];
  // hedges: low green lines that frame the square and the hall approach
  const hedgeRuns: [number, number, number, boolean][] = [[21, 17, 4, false], [21, 23, 4, false], [41, 17, 4, false], [41, 23, 4, false], [24, 12, 3, true], [36, 12, 3, true], [3, 13, 2, true], [15, 13, 2, true]];
  for (const [hx, hy, len, horiz] of hedgeRuns) for (let i = 0; i < len; i++) {
    const tx = horiz ? hx + i : hx, ty = horiz ? hy : hy + i;
    if (stations.some((st) => st.tile.x === tx && st.tile.y === ty)) continue;
    props.push({ kind: 'hedge', x: tx * TILE, y: ty * TILE + 3, blocks: [{ x: tx, y: ty }] });
  }
  for (const [kind, x, y, blocks] of plaza) props.push({ kind, x, y, blocks: blocks ? [{ x: Math.floor((x + 6) / TILE), y: Math.floor((y + 8) / TILE) }] : [] });
  const lamps: Point[] = [
    { x: 23, y: 17 }, { x: 39, y: 17 }, { x: 23, y: 27 }, { x: 39, y: 27 },
    { x: 7, y: 19 }, { x: 55, y: 19 }, { x: 8, y: 31 }, { x: 54, y: 31 }, { x: 29, y: 3 }, { x: 33, y: 37 }, { x: 22, y: 13 }, { x: 40, y: 13 },
  ];
  for (const l of lamps) props.push({ kind: 'lamp', x: l.x * TILE + 3, y: l.y * TILE - 14, blocks: [l] });
  for (const s of stations) props.push({ kind: s.prop.kind, x: s.prop.x, y: s.prop.y });
  props.push({ kind: 'bench', x: 26 * TILE, y: 23 * TILE + 2, blocks: [{ x: 26, y: 23 }, { x: 27, y: 23 }] });
  props.push({ kind: 'bench', x: 35 * TILE, y: 23 * TILE + 2, blocks: [{ x: 35, y: 23 }, { x: 36, y: 23 }] });
  // what each building keeps outside its door
  const outside: [PropKind, number, number][] = [
    // library: books under an awning, a bench, a notice board
    ['awning', 5 * TILE - 2, 12 * TILE - 12], ['bookCrates', 5 * TILE, 12 * TILE + 2], ['bench', 12 * TILE, 12 * TILE + 3], ['noticeBoard', 15 * TILE + 4, 12 * TILE - 6], ['planter', 3 * TILE + 2, 12 * TILE - 2],
    // workshop: timber, sawhorse, debris
    ['timberPile', 46 * TILE - 2, 12 * TILE + 3], ['sawhorse', 52 * TILE + 4, 12 * TILE + 3], ['crate', 56 * TILE + 2, 12 * TILE - 2], ['log', 55 * TILE, 16 * TILE + 4], ['brokenWheel', 45 * TILE + 2, 16 * TILE],
    // forge: coal, stacked iron, a trough of water
    ['coalPile', 44 * TILE, 30 * TILE + 4], ['coalPile', 55 * TILE + 2, 30 * TILE + 6], ['metalStack', 46 * TILE + 4, 30 * TILE + 2], ['barrel', 54 * TILE + 4, 30 * TILE - 2], ['metalStack', 44 * TILE + 2, 23 * TILE + 4],
    // tavern: sign, lanterns, barrels round the back, tables in the beer garden
    ['teapotSign', 38 * TILE + 3, 30 * TILE - 24], ['tavernSign', 45 * TILE + 3, 30 * TILE - 22], ['barrel', 46 * TILE + 2, 26 * TILE - 2], ['barrel', 46 * TILE + 8, 27 * TILE], ['barrel', 46 * TILE + 3, 28 * TILE + 2], ['stall', 35 * TILE + 2, 28 * TILE + 2], ['lantern', 34 * TILE + 8, 28 * TILE - 4], ['crate', 37 * TILE + 8, 30 * TILE + 2],
    // observatory: an equipment yard with a spare telescope and charts, planters
    ['telescope', 24 * TILE, 27 * TILE], ['crate', 25 * TILE, 28 * TILE + 4], ['moonSign', 17 * TILE + 2, 30 * TILE - 22], ['planter', 15 * TILE + 2, 30 * TILE - 2], ['stoneMarker', 23 * TILE + 3, 30 * TILE - 2],
    // post office: sacks, parcels, a notice board, a handcart
    ['mailSacks', 4 * TILE, 30 * TILE + 2], ['parcels', 13 * TILE - 2, 30 * TILE], ['noticeBoard', 3 * TILE - 2, 26 * TILE - 4], ['cart', 2 * TILE - 4, 32 * TILE - 4],
    // town hall: notice board, flower beds, planters flanking the steps
    ['noticeBoard', 25 * TILE - 6, 11 * TILE - 8], ['flowerBox', 27 * TILE - 2, 11 * TILE + 6], ['flowerBox', 34 * TILE + 2, 11 * TILE + 6], ['planter', 29 * TILE - 2, 11 * TILE + 4], ['planter', 33 * TILE + 2, 11 * TILE + 4],
    // vignettes: chopping block by the wood, a garden with a wheelbarrow, bees, a campfire by the pond, a shrine on the lane, a bench under the big tree
    ['choppingBlock', 44 * TILE + 2, 10 * TILE + 2], ['wheelbarrow', 12 * TILE, 26 * TILE + 2], ['tools', 15 * TILE + 8, 25 * TILE - 4],
    ['beehive', 18 * TILE + 2, 4 * TILE], ['beehive', 20 * TILE + 2, 4 * TILE + 4], ['beehive', 22 * TILE + 2, 4 * TILE],
    ['campfire', 52 * TILE, 5 * TILE + 4], ['log', 50 * TILE, 6 * TILE + 6], ['shrine', 20 * TILE + 2, 19 * TILE - 12], ['fallenLog', 4 * TILE, 18 * TILE + 4],
  ];
  for (const [kind, x, y] of outside) props.push({ kind, x, y, blocks: kind === 'lantern' || kind === 'tavernSign' || kind === 'awning' ? [] : [{ x: Math.floor((x + 6) / TILE), y: Math.floor((y + 8) / TILE) }] });
  // the big old tree by the west street with a bench beneath it
  props.push({ kind: 'tree', x: 5 * TILE - 24, y: 17 * TILE - 46, variant: 2, blocks: [{ x: 5, y: 17 }, { x: 4, y: 17 }] });
  props.push({ kind: 'bench', x: 6 * TILE + 2, y: 18 * TILE + 2, blocks: [{ x: 6, y: 18 }] });
  props.push({ kind: 'signpost', x: 29 * TILE + 1, y: 28 * TILE - 6, blocks: [{ x: 29, y: 28 }] });
  props.push({ kind: 'signpost', x: 33 * TILE + 1, y: 15 * TILE - 6, blocks: [{ x: 33, y: 15 }] });
  // clutter near buildings
  const clutter: [PropKind, number, number][] = [
    ['crate', 45 * TILE + 2, 14 * TILE + 2], ['log', 44 * TILE, 12 * TILE + 4], ['log', 44 * TILE + 4, 10 * TILE + 6],
    ['hay', 45 * TILE, 30 * TILE + 4], ['barrel', 56 * TILE + 3, 30 * TILE - 2], ['barrel', 56 * TILE + 3, 28 * TILE + 6], ['log', 44 * TILE, 27 * TILE + 4],
    ['barrel', 37 * TILE + 3, 30 * TILE - 2], ['barrel', 46 * TILE + 3, 29 * TILE + 4], ['crate', 13 * TILE + 2, 29 * TILE + 2], ['crate', 3 * TILE + 2, 29 * TILE + 2],
    ['bush', 3 * TILE, 12 * TILE + 2], ['bush', 16 * TILE, 12 * TILE + 2], ['bush', 25 * TILE - 4, 11 * TILE + 2], ['bush', 37 * TILE + 2, 11 * TILE + 2],
    ['bush', 15 * TILE, 30 * TILE + 2], ['bush', 23 * TILE + 2, 30 * TILE + 2], ['bush', 2 * TILE, 30 * TILE + 2], ['rock', 24 * TILE, 15 * TILE + 4],
    ['rock', 41 * TILE + 4, 26 * TILE + 2], ['rock', 3 * TILE, 15 * TILE + 8], ['rock', 58 * TILE, 15 * TILE], ['hay', 19 * TILE, 12 * TILE + 2],
    ['mushroom', 20 * TILE + 3, 33 * TILE + 2], ['mushroom', 2 * TILE + 3, 18 * TILE], ['mushroom', 47 * TILE, 33 * TILE + 2],
  ];
  for (const [kind, x, y] of clutter) props.push({ kind, x, y, blocks: [{ x: Math.floor((x + 6) / TILE), y: Math.floor((y + 6) / TILE) }] });
  homes.forEach((h, i) => {
    props.push({ kind: 'porchBench', x: h.x * TILE, y: 39 * TILE + 6 });
    props.push({ kind: 'porchBench', x: (h.x + 4) * TILE, y: 39 * TILE + 6 });
    // every house is somebody's: sunflowers, a flower box, something left by the wall
    props.push({ kind: 'sunflowers', x: (h.x + (i % 2 ? 3 : 1)) * TILE + 2, y: 38 * TILE - 6, blocks: [] });
    if (i % 3 !== 1) props.push({ kind: 'flowerBox', x: (h.x + (i % 2 ? 0 : 3)) * TILE + 1, y: 38 * TILE + 8, blocks: [] });
    const side: PropKind = (['barrel', 'log', 'crate', 'firewood', 'wheelbarrow', 'barrel', 'hay', 'crate'] as PropKind[])[i]!;
    props.push({ kind: side, x: (h.x + 5) * TILE + 2, y: 37 * TILE + 4, blocks: [{ x: h.x + 5, y: 37 }] });
    // low fences separate the back gardens
    // kelp clumps separate the back gardens instead of fence posts
    if (i !== 3 && i !== 7) for (let y = 33; y <= 34; y += 2) ground[y]![h.x + 5] = r() < 0.6 ? T.tall1 : T.weeds;
    for (let x = h.x; x <= h.x + 4; x += 2) if (ground[32]![x] === T.grass || ground[32]![x] === T.grass2 || ground[32]![x] === T.grass3) ground[32]![x] = r() < 0.5 ? T.tall0 : T.weeds;
    if (i % 2 === 0) for (let y = 33; y <= 34; y++) for (let x = h.x + 1; x <= h.x + 3; x++) ground[y]![x] = (x + y) % 2 ? T.tall0 : T.tall1;
    else for (let x = h.x + 1; x <= h.x + 3; x++) ground[33]![x] = x % 2 ? T.flwYellow0 : T.flwWhite0;
    if (i % 2) props.push({ kind: 'bush', x: (h.x + 5) * TILE - 1, y: 39 * TILE + 2, blocks: [] });
    if (i !== 3 && i !== 7) { ground[38]![h.x + 5] = r() < 0.5 ? T.rocks : T.weeds; }
  });

  // trees frame every big building at its flanks and back corners
  for (const b of buildings) {
    const spots: Point[] = [{ x: b.x - 2, y: b.y + b.h - 1 }, { x: b.x + b.w + 1, y: b.y + b.h - 1 }, { x: b.x - 1, y: b.y + 1 }, { x: b.x + b.w, y: b.y + 1 }, { x: b.x + 1, y: b.y - 2 }, { x: b.x + b.w - 2, y: b.y - 2 }];
    for (const sp of spots) {
      if (!inb(sp.x, sp.y)) continue;
      const g = ground[sp.y]![sp.x]!;
      if (!(g === T.grass || g === T.grass2 || g === T.grass3 || g === T.flowers || g === T.cliffTop)) continue;
      if (stations.some((st) => Math.abs(st.tile.x - sp.x) <= 1 && Math.abs(st.tile.y - sp.y) <= 1)) continue;
      if (props.some((pp) => (pp.blocks ?? []).some((bl) => bl.x === sp.x && bl.y === sp.y))) continue;
      if (r() < 0.75) props.push({ kind: 'tree', x: sp.x * TILE - 8, y: sp.y * TILE - 24, variant: r() < 0.3 ? 3 : Math.floor(r() * 2), blocks: [sp] });
      else props.push({ kind: 'bush', x: sp.x * TILE - 1, y: sp.y * TILE + 2, blocks: [sp] });
    }
  }
  // flowers and shrubs hug the foundations of the big buildings
  for (const b of buildings) {
    for (let x = b.x - 1; x <= b.x + b.w; x++) {
      const y = b.y + b.h;
      if (!inb(x, y) || Math.abs(x - b.door.x) <= 1) continue;
      const g = ground[y]![x]!;
      if (!(g === T.grass || g === T.grass2 || g === T.grass3)) continue;
      const v = r();
      if (v < 0.35) ground[y]![x] = v < 0.15 ? T.flwWhite0 : v < 0.25 ? T.flwYellow0 : T.flwBlue0;
      else if (v < 0.5) props.push({ kind: 'bush', x: x * TILE - 1, y: y * TILE + 2, blocks: [{ x, y }] });
      else if (v < 0.6) ground[y]![x] = T.weeds;
    }
  }

  // Keep continuous outdoor approaches between workstations and the lanes.
  // Dressing must not strand a station against a fence or a building facade.
  const approaches = new Set<number>();
  const approach = (x: number, y: number, w: number, h: number) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (inb(xx, yy)) approaches.add(key(xx, yy));
  };
  for (const b of buildings) approach(b.x - 1, b.y + b.h, b.w + 2, 3);
  approach(25, 9, 1, 5); approach(37, 9, 1, 5); approach(35, 28, 3, 5);
  for (let i = props.length - 1; i >= 0; i--) {
    if (props[i]!.blocks?.some(p => approaches.has(key(p.x, p.y)))) props.splice(i, 1);
  }

  // Tide pools. The open floor is not one flat sheet of sand: flood the pockets
  // nothing stands on or walks through, so the town reads as reef flats crossed
  // by sandy causeways instead of a village green. Runs before the trees so
  // nothing is planted in water, and before the cost grid so the flooded tiles
  // are simply not walkable. A blobby mask keeps the rims rounded rather than
  // checkerboarded, and each pool gets an algae margin.
  {
    const occupied = new Set<number>();
    for (const k of road) occupied.add(k);
    for (const k of water) occupied.add(k);
    for (const k of approaches) occupied.add(k);
    const mark = (x: number, y: number) => { if (inb(x, y)) occupied.add(key(x, y)); };
    for (const b of [...buildings, ...homes]) for (let j = b.y - 1; j <= b.y + b.h; j++) for (let i = b.x - 1; i <= b.x + b.w; i++) mark(i, j);
    for (const s of stations) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) mark(s.tile.x + dx, s.tile.y + dy);
    for (const p of props) for (const b of p.blocks ?? []) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) mark(b.x + dx, b.y + dy);
    for (const l of lamps) mark(l.x, l.y);
    const pools = mulberry(90210);
    for (let y = 1; y < LOCAL_H - 1; y++) for (let x = 1; x < LOCAL_W - 1; x++) {
      const k = key(x, y);
      if (occupied.has(k)) continue;
      const g = ground[y]![x]!;
      if (!(g === T.grass || g === T.grass2 || g === T.grass3 || g === T.grassTall)) continue;
      // Broad lagoon basins, so water is the medium the town sits in rather
      // than a canal threading a green. Each sits in ground that lies open
      // between the lanes; the occupancy guard above keeps every road, station
      // and footprint dry, so the pools read as flooded reef flats and the
      // causeways between them stay walkable. The radii are deliberately wide:
      // at the old size water covered only ~16% of the frame, which is why the
      // scene still read as land with ponds on it.
      const basin =
        Math.hypot((x - 9) / 8.5, (y - 17.5) / 5) < 1 ||
        Math.hypot((x - 51) / 9, (y - 17.5) / 5) < 1 ||
        Math.hypot((x - 21) / 8, (y - 6.5) / 6.5) < 1 ||
        Math.hypot((x - 41) / 8, (y - 6.5) / 6.5) < 1 ||
        Math.hypot((x - 10) / 11, (y - 32.5) / 4.5) < 1 ||
        Math.hypot((x - 50) / 11, (y - 32.5) / 4.5) < 1 ||
        Math.hypot((x - 31) / 7, (y - 33.5) / 4) < 1;
      const blob = Math.sin(x * 0.31) * Math.cos(y * 0.27) + Math.sin((x + y) * 0.13);
      if (!basin && (blob < 0.05 || pools() > 0.75)) continue;
      ground[y]![x] = pools() < 0.5 ? T.water : T.water2;
      water.add(k);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx, ny = y + dy;
        if (!inb(nx, ny) || water.has(key(nx, ny)) || occupied.has(key(nx, ny))) continue;
        const gg = ground[ny]![nx]!;
        if (gg === T.grass || gg === T.grass2 || gg === T.grass3) ground[ny]![nx] = T.shore;
      }
    }
  }

  // Retire unsupported decoration and its collision footprint together.
  for (let i = props.length - 1; i >= 0; i--) if (!hasWorldSprite(props[i]!.kind)) props.splice(i, 1);

  // ---- walkability
  const cost = new Uint8Array(LOCAL_W * LOCAL_H);
  for (let y = 0; y < LOCAL_H; y++) for (let x = 0; x < LOCAL_W; x++) {
    const g = ground[y]![x]!;
    const isRoad = g === T.path || g === T.path2 || g === T.bridge || g === T.stairs
      || g === T.pathEdge || g === T.pathStones || g === T.pathMud || g === T.pathGrassy;
    const blocked = g === T.water || g === T.water2 || g === T.cliff;
    cost[y * LOCAL_W + x] = blocked ? 0 : isRoad ? 1 : g === T.trampled || g === T.soot ? 2 : g === T.shore ? 4 : 3;
  }
  const block = (x: number, y: number) => { if (inb(x, y)) cost[y * LOCAL_W + x] = 0; };
  for (const b of [...buildings, ...homes]) for (let j = b.y; j < b.y + b.h; j++) for (let i = b.x; i < b.x + b.w; i++) block(i, j);
  for (let x = 0; x < LOCAL_W; x++) { block(x, 0); block(x, LOCAL_H - 1); }
  for (let y = 0; y < LOCAL_H; y++) { block(0, y); block(LOCAL_W - 1, y); }
  for (const p of props) for (const b of p.blocks ?? []) block(b.x, b.y);
  for (const s of stations) block(Math.floor((s.prop.x + 6) / TILE), Math.floor((s.prop.y + 8) / TILE));

  // ---- trees: thick at the edges, sparse inside, never on roads or near doors
  let placed = 0, tries = 0;
  const treeCells = new Set<number>();
  while (placed < 190 && tries++ < 30000) {
    const x = 1 + Math.floor(r() * (LOCAL_W - 2)), y = 2 + Math.floor(r() * (LOCAL_H - 3));
    const edge = x < 5 || x > LOCAL_W - 7 || y < 5 || y > LOCAL_H - 5;
    if (r() > (edge ? 0.95 : 0.4)) continue;
    const g = ground[y]![x]!;
    if (!(g === T.grass || g === T.grass2 || g === T.grass3 || g === T.flowers || g === T.grassTall || g === T.rocks)) continue;
    if (cost[y * LOCAL_W + x] === 0) continue;
    let ok = true;
    for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1 && ok; dx++) {
      if (!inb(x + dx, y + dy)) { ok = false; break; }
      const gg = ground[y + dy]![x + dx]!;
      if (treeCells.has(key(x + dx, y + dy)) || road.has(key(x + dx, y + dy)) || gg === T.cliff || gg === T.stairs || gg === T.cliffTop) ok = false;
    }
    for (const b of [...buildings, ...homes]) if (x >= b.x - 1 && x < b.x + b.w + 1 && y >= b.y - 3 && y < b.y + b.h + 2) ok = false;
    for (const s of stations) if (Math.abs(s.tile.x - x) <= 1 && Math.abs(s.tile.y - y) <= 1) ok = false;
    if (!ok) continue;
    const tv = r();
    const variant = tv < 0.12 ? 3 : tv < 0.22 ? 4 : tv < 0.3 ? 5 : Math.floor(r() * 2);
    props.push({ kind: 'tree', x: x * TILE - 8, y: y * TILE - 24, variant });
    block(x, y);
    treeCells.add(key(x, y));
    placed++;
    // Subtle ground variation under the crown.
    const below = ground[y + 1]?.[x];
    if (below !== undefined && (below === T.grass || below === T.grass2 || below === T.grass3) && r() < 0.5) ground[y + 1]![x] = r() < 0.7 ? T.leaves : T.clover;
  }
  for (const s of stations) cost[s.tile.y * LOCAL_W + s.tile.x] = 1;
  for (const b of [...buildings, ...homes]) { cost[b.door.y * LOCAL_W + b.door.x] = 1; for (const p of b.porch) cost[p.y * LOCAL_W + p.x] = 1; }

  return {
    ground,
    height: new Float32Array(LOCAL_W * LOCAL_H),
    grid: { w: LOCAL_W, h: LOCAL_H, cost },
    buildings,
    stations,
    props,
    homes,
    lamps,
    entrance: { x: 20, y: 40 },
  };
}

/** The town embedded in its countryside. */
export function buildTownMap(): TownMap {
  return buildCountryside(buildTownLocal());
}

export function tileCenter(p: Point): { x: number; y: number } {
  return { x: p.x * TILE + TILE / 2, y: p.y * TILE + TILE / 2 };
}
