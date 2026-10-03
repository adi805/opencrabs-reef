import { T, TILE } from './tiles';
import { paintCoralWallH, paintCoralWallV, paintKelpFarm, paintKelpRailH, paintKelpRailV, paintReefRamp } from './reefStructures';
import { TOWN_OX, TOWN_OY, type TownMap } from '../world/map';

/** Draw complete reef sections over continuous ground. */
export function paintStructures(map: TownMap): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = map.grid.w * TILE * 2; canvas.height = map.grid.h * TILE * 2;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(2, 2); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  const kelpH = paintKelpRailH(), kelpV = paintKelpRailV();
  const wallH = paintCoralWallH(), wallV = paintCoralWallV();
  const ramp = paintReefRamp(), farm = paintKelpFarm();
  const horizontal = (g: number) => g === T.fence || g === T.fenceEnd ? 'fence' : g === T.cliff || g === T.stoneWall ? 'wall' : g === T.stairs ? 'stairs' : g === T.crop || g === T.crop2 ? 'crop' : '';
  for (let y = 0; y < map.grid.h; y++) for (let x = 0; x < map.grid.w;) {
    const kind = horizontal(map.ground[y]![x]!);
    if (!kind) { x++; continue; }
    const start = x;
    while (x < map.grid.w && horizontal(map.ground[y]![x]!) === kind) x++;
    // The central hall has one continuous ramp flight, painted below.
    if (kind === 'stairs' && y === TOWN_OY + 14 && start === TOWN_OX + 30) continue;
    const sprite = kind === 'fence' ? kelpH : kind === 'wall' ? wallH : kind === 'stairs' ? ramp : farm;
    const section = kind === 'wall' ? 3 : kind === 'stairs' ? x - start : 2;
    const height = sprite.height / 2;
    for (let tx = start; tx < x; tx += section) {
      const width = Math.min(section, x - tx) * TILE;
      ctx.drawImage(sprite, tx * TILE - 0.5, (y + 1) * TILE - height, width + 1, height);
    }
  }
  for (let x = 0; x < map.grid.w; x++) for (let y = 0; y < map.grid.h;) {
    const tile = map.ground[y]![x]!;
    if (tile !== T.fenceV && tile !== T.stoneWallV) { y++; continue; }
    const start = y;
    while (y < map.grid.h && map.ground[y]![x] === tile) y++;
    const sprite = tile === T.stoneWallV ? wallV : kelpV;
    for (let ty = start; ty < y; ty += 2) {
      ctx.drawImage(sprite, x * TILE + 3, ty * TILE - 5, sprite.width / 2, Math.min(2, y - ty) * TILE + 1);
    }
  }
  const hallRamp = paintReefRamp();
  for (let part = 0; part < 2; part++) ctx.drawImage(hallRamp, (TOWN_OX + 30) * TILE, (TOWN_OY + 11) * TILE + part * 40, 48, 40);
  return canvas;
}
