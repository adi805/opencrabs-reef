import { CLOTH, HAIR, PAL } from './palette';
import { Painter, hashString, mulberry, outline, shade } from './painter';

/**
 * Original 20×30 resident, NOT enlarged to fill its cell. Six pixels of
 * horizontal gutter and five above the body leave room for tools and ink.
 * Native texels, row-major grid; scene scale is independent of atlas scale.
 * Side work is authored left and mirrored by the renderer for right.
 *
 * The residents are crabs: a domed carapace, two eyestalks, a pair of pincers
 * and six jointed legs. The body grid, the baseline and every prop anchor are
 * unchanged, so placement and tools still line up with the old rig.
 */
export const FRAME_W = 32;
export const FRAME_H = 40;
export const CHARACTER_SCALE = 1;
export const FRAME_COLUMNS = 16;
/** Bottom edge of the planted legs, measured from the cell top. */
export const CHARACTER_BASELINE = 35;
export const WALK_FRAME_COUNT = 8;
export const IDLE_FRAME_COUNT = 4;
export const WORK_FRAME_COUNT = 4;
export const REACTION_FRAME_COUNT = 4;
export const REACTION_DURATION = 1.2;

export type Facing = 'down' | 'left' | 'right' | 'up';
export const FACINGS: readonly Facing[] = ['down', 'left', 'right', 'up'];
export type WorkStyle = 'hammer' | 'read' | 'bellows' | 'parcel' | 'gaze' | 'desk' | 'sit' | 'haggle';
export const WORK_STYLES: readonly WorkStyle[] = ['hammer', 'read', 'bellows', 'parcel', 'gaze', 'desk', 'sit', 'haggle'];
type Orient = 'side' | 'down' | 'up';
const ORIENTS: readonly Orient[] = ['side', 'down', 'up'];
type Reaction = 'complete' | 'fail';
const REACTIONS: readonly Reaction[] = ['complete', 'fail'];
const IDLE_START = FACINGS.length * WALK_FRAME_COUNT;
const WORK_START = IDLE_START + FACINGS.length * IDLE_FRAME_COUNT;
const REACTION_START = WORK_START + WORK_STYLES.length * ORIENTS.length * WORK_FRAME_COUNT;
export const FRAME_COUNT = REACTION_START + REACTIONS.length * FACINGS.length * REACTION_FRAME_COUNT;

function wrap(index: number, count: number): number {
  return Number.isFinite(index) ? ((Math.floor(index) % count) + count) % count : 0;
}
export function walkFrame(facing: Facing, index: number): number {
  return FACINGS.indexOf(facing) * WALK_FRAME_COUNT + wrap(index, WALK_FRAME_COUNT);
}
export function idleFrame(facing: Facing, index: number): number {
  return IDLE_START + FACINGS.indexOf(facing) * IDLE_FRAME_COUNT + wrap(index, IDLE_FRAME_COUNT);
}
export function workFrame(style: WorkStyle, facing: Facing, index: number): number {
  const orient: Orient = facing === 'down' ? 'down' : facing === 'up' ? 'up' : 'side';
  return WORK_START + (WORK_STYLES.indexOf(style) * ORIENTS.length + ORIENTS.indexOf(orient)) * WORK_FRAME_COUNT + wrap(index, WORK_FRAME_COUNT);
}
export function sitFrame(facing: Facing, index: number): number { return workFrame('sit', facing, index); }
export const SIT_FRAME = sitFrame('down', 0);
export function reactionFrame(kind: Reaction, facing: Facing, index: number): number {
  return REACTION_START + (REACTIONS.indexOf(kind) * FACINGS.length + FACINGS.indexOf(facing)) * REACTION_FRAME_COUNT + wrap(index, REACTION_FRAME_COUNT);
}

// Seconds per authored pose. Hammer: prepare, anticipate, impact, recover.
// Idle holds neutral; the blink is short, and never raises/lowers the legs.
export const IDLE_DURATIONS: readonly number[] = [2.8, 0.65, 0.12, 0.65];
export const WORK_DURATIONS: Readonly<Record<WorkStyle, readonly number[]>> = {
  hammer: [0.28, 0.24, 0.12, 0.36],
  read: [0.9, 0.35, 0.24, 0.65],
  bellows: [0.4, 0.25, 0.38, 0.32],
  parcel: [0.45, 0.3, 0.4, 0.45],
  gaze: [0.7, 0.35, 0.55, 0.5],
  desk: [0.3, 0.24, 0.3, 0.55],
  sit: [2.4, 0.7, 0.12, 0.7],
  haggle: [0.55, 0.3, 0.5, 0.45],
};
export const REACTION_DURATIONS: readonly number[] = [0.15, 0.25, 0.45, 0.35];
/** Loop idle/work; reactions are one-shot and hold their recovered last pose. */
export function poseFrameAt(kind: 'idle' | 'work' | 'reaction', elapsedSeconds: number, styleOrReaction?: WorkStyle | Reaction): number {
  const durations = kind === 'idle' ? IDLE_DURATIONS : kind === 'reaction' ? REACTION_DURATIONS
    : WORK_DURATIONS[styleOrReaction && WORK_STYLES.includes(styleOrReaction as WorkStyle) ? styleOrReaction as WorkStyle : 'desk'];
  const total = durations.reduce((sum, duration) => sum + duration, 0);
  const elapsed = Number.isFinite(elapsedSeconds) ? Math.max(0, elapsedSeconds) : 0;
  let time = kind === 'reaction' ? Math.min(elapsed, total) : elapsed % total;
  for (let i = 0; i < durations.length - 1; i++) {
    if (time < durations[i]!) return i;
    time -= durations[i]!;
  }
  return durations.length - 1;
}

export type RoleClass = 'coordinator' | 'research' | 'fabrication' | 'review' | 'tooling' | 'general' | 'scheduled';

/**
 * A crab's look. The field names are inherited from the humanoid rig that this
 * replaced, so read them as: hair = carapace marking colour, cloth/cloth2 =
 * shell top and shaded flank, pants = leg colour, skin = underside and
 * eyestalk, hat = crest/barnacle crest variant, apron = a raised shell plate,
 * beard = a barnacle cluster.
 */
export interface Look {
  hair: string;
  cloth: string;
  cloth2: string;
  pants: string;
  skin: string;
  hat: 'none' | 'cap' | 'hood' | 'band' | 'brim' | 'goggles';
  apron: boolean;
  beard: boolean;
}

/** A stable look from a stable id, nudged by role so jobs read at a glance. */
export function lookFor(id: string, role: RoleClass): Look {
  const r = mulberry(hashString(id));
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(r() * arr.length)]!;
  const cloth = pick(CLOTH);
  const look: Look = {
    hair: pick(HAIR),
    cloth,
    cloth2: shade(cloth, 0.72),
    pants: pick(['#4a4548', '#3f3a44', '#4a3d36', '#3a4048']),
    skin: r() < 0.7 ? PAL.skin : PAL.skin2,
    hat: r() < 0.35 ? 'brim' : 'none',
    apron: false,
    beard: r() < 0.2,
  };
  switch (role) {
    case 'coordinator': look.hat = 'brim'; look.cloth = pick(['#6b4a7a', '#5e3f78', '#3f5e7a']); break;
    case 'research': look.hat = r() < 0.5 ? 'hood' : 'none'; look.cloth = pick(['#3f5e7a', '#2f6b66', '#4a4a56']); break;
    case 'fabrication': look.apron = true; look.hat = r() < 0.4 ? 'goggles' : 'none'; look.cloth = pick(['#7a3a2a', '#a0703a', '#7a6a3a']); break;
    case 'review': look.hat = 'band'; look.cloth = pick(['#4a4a56', '#7a6a3a', '#2f6b66']); break;
    case 'tooling': look.apron = r() < 0.5; look.hat = r() < 0.5 ? 'cap' : 'none'; look.cloth = pick(['#4f6b3a', '#4a4a56', '#3f5e7a']); break;
    case 'scheduled': look.hat = 'hood'; look.cloth = pick(['#2f3a5a', '#3a3350', '#2f4a4a']); look.beard = false; break;
    default: break;
  }
  look.cloth2 = shade(look.cloth, 0.72);
  return look;
}

const INK = '#2a1f1c';
const HAT = '#8a6a3f';
const HAT_DARK = '#6b4f2e';
const STRAP = '#5a3d24';
const BUCKLE = '#d9b34a';

export function paintCharacterSheet(look: Look): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = FRAME_COLUMNS * FRAME_W * CHARACTER_SCALE;
  canvas.height = Math.ceil(FRAME_COUNT / FRAME_COLUMNS) * FRAME_H * CHARACTER_SCALE;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const put = (index: number, facing: Facing, mode: Mode, phase: number) => {
    const frame = drawFrame(look, facing, mode, phase);
    ctx.drawImage(frame.canvas, index % FRAME_COLUMNS * FRAME_W * CHARACTER_SCALE,
      Math.floor(index / FRAME_COLUMNS) * FRAME_H * CHARACTER_SCALE,
      FRAME_W * CHARACTER_SCALE, FRAME_H * CHARACTER_SCALE);
  };
  for (const facing of FACINGS) {
    for (let i = 0; i < WALK_FRAME_COUNT; i++) put(walkFrame(facing, i), facing, 'walk', i);
    for (let i = 0; i < IDLE_FRAME_COUNT; i++) put(idleFrame(facing, i), facing, 'idle', i);
    for (const kind of REACTIONS) for (let i = 0; i < REACTION_FRAME_COUNT; i++) put(reactionFrame(kind, facing, i), facing, kind, i);
  }
  for (const style of WORK_STYLES) for (const orient of ORIENTS) for (let i = 0; i < WORK_FRAME_COUNT; i++) {
    const facing = orient === 'side' ? 'left' : orient;
    put(workFrame(style, facing, i), facing, style, i);
  }
  return canvas;
}

type Mode = 'walk' | 'idle' | WorkStyle | Reaction;
type Point = { x: number; y: number };
// Contact, recoil, passing, rise; repeat on the opposite side. Drives the body
// bob and the claw swing; the six legs plant rather than slide.
const GAIT = [
  { reach: -2, nearLift: 0, farLift: 0, bob: 0 },
  { reach: -1, nearLift: 1, farLift: 0, bob: 1 },
  { reach: 0, nearLift: 2, farLift: 0, bob: 0 },
  { reach: 1, nearLift: 1, farLift: 0, bob: -1 },
  { reach: 2, nearLift: 0, farLift: 0, bob: 0 },
  { reach: 1, nearLift: 0, farLift: 1, bob: 1 },
  { reach: 0, nearLift: 0, farLift: 2, bob: 0 },
  { reach: -1, nearLift: 0, farLift: 1, bob: -1 },
] as const;

/** All coordinates below stay on the original 20×30 body grid. */
function drawFrame(look: Look, facing: Facing, mode: Mode, phase: number): Painter {
  const p = new Painter(FRAME_W, FRAME_H);
  const mirror = facing === 'right';
  const f = mirror ? 'left' : facing;
  const side = f === 'left', back = f === 'up';
  let lean = 0;
  const px = (x: number, y: number, c: string) => {
    const sourceX = x + 6 + lean;
    const sx = mirror ? FRAME_W - 1 - sourceX : sourceX;
    const sy = y + 5;
    // One transparent pixel of gutter on every side. The sprite-sheet test
    // pins this invariant, and it is also why a claw can never clip into the
    // neighbouring cell. Every draw below goes through here, so no pose,
    // lean offset or prop can break it.
    if (sx < 1 || sx > FRAME_W - 2 || sy < 1 || sy > FRAME_H - 2) return;
    p.px(sx, sy, c);
  };
  const rect = (x: number, y: number, w: number, h: number, c: string) => {
    for (let j = 0; j < h; j++) for (let k = 0; k < w; k++) px(x + k, y + j, c);
  };
  const stroke = (a: Point, b: Point, color: string, width = 2) => {
    const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y), 1);
    for (let i = 0; i <= steps; i++) rect(Math.round(a.x + (b.x - a.x) * i / steps), Math.round(a.y + (b.y - a.y) * i / steps), width, width, color);
  };
  const walking = mode === 'walk', idle = mode === 'idle', sitting = mode === 'sit';
  const reaction = mode === 'complete' || mode === 'fail';
  const working = !walking && !idle && !sitting && !reaction;
  const gait = GAIT[walking ? phase : 2]!;
  const oy = sitting ? 3 : walking ? gait.bob : mode === 'fail' ? [0, 1, 2, 0][phase]! : 0;
  const headDip = mode === 'complete' ? [0, -1, -1, 0][phase]!
    : mode === 'fail' ? [0, 1, 1, 1][phase]!
    : working && (mode === 'read' || mode === 'desk') && phase === 2 ? 1 : 0;
  const blink = (idle || sitting) && phase === 2 || reaction && phase === 2;
  const hairDark = shade(look.hair, 0.7);
  const skinDark = shade(look.skin, 0.82);



  // A weight transfer, not a perpetual vertical idle bounce.
  lean = idle && (phase === 1 || phase === 2) ? (side ? -1 : 1)
    : mode === 'fail' && phase === 2 && side ? -1 : 0;
  const shoulder = 13 + oy;
  let handL: Point = { x: 0, y: shoulder + 6 };
  let handR: Point = { x: side ? 12 : 19, y: shoulder + 6 };
  if (walking) {
    if (side) {
      // Oppose the near leg. Far arm is the same length, only shaded/occluded.
      handL = { x: 5 - gait.reach, y: shoulder + (Math.abs(gait.reach) === 2 ? 5 : 6) };
      handR = { x: 12 + gait.reach, y: handL.y };
    } else {
      const swing = [1, 1, 0, -1, -1, -1, 0, 1][phase]!;
      handL = { x: 3 - swing, y: shoulder + 6 - Math.abs(swing) };
      handR = { x: 15 - swing, y: shoulder + 6 - Math.abs(swing) };
    }
  } else if (sitting) {
    handL = { x: side ? 3 : 5, y: 22 };
    handR = { x: side ? 9 : 13, y: 22 };
  } else if (reaction) {
    // Completion: carapace up and one raised claw. Failure: both claws fold
    // inward and the eyestalks dip. Never the same shrug.
    const lift = [0, 1, 2, 0][phase]!;
    if (mode === 'complete') {
      const raised = phase === 1 || phase === 2;
      if (side) handL = { x: raised ? 2 : 5, y: shoulder + [5, 3, 2, 6][phase]! };
      else handR = { x: raised ? 18 : 15, y: shoulder + [5, 3, 2, 6][phase]! };
    } else {
      handL = { x: (side ? 5 : 3) + lift, y: shoulder + 6 - lift };
      handR = { x: (side ? 12 : 15) - lift, y: shoulder + 6 - lift };
    }
  } else if (working) {
    // Hands are authored with the prop, not independent decorative pixels.
    // Up-facing work is offset at the shoulder so the action is not hidden
    // under a large hat or painted implausibly across the resident's back.
    if (side) {
      switch (mode) {
        case 'hammer': handL = [{x:0,y:13},{x:-1,y:10},{x:0,y:17},{x:2,y:16}][phase]!; break;
        case 'read': handL = [{x:1,y:17},{x:1,y:16},{x:2,y:15},{x:2,y:18}][phase]!; break;
        case 'bellows': handL = [{x:1,y:14},{x:0,y:15},{x:2,y:18},{x:2,y:16}][phase]!; break;
        case 'parcel': handL = [{x:3,y:18},{x:2,y:16},{x:0,y:16},{x:2,y:18}][phase]!; break;
        case 'gaze': handL = [{x:3,y:11},{x:3,y:10},{x:2,y:10},{x:4,y:12}][phase]!; break;
        case 'desk': handL = [{x:1,y:17},{x:0,y:16},{x:2,y:17},{x:3,y:15}][phase]!; break;
        case 'haggle': handL = [{x:3,y:18},{x:0,y:16},{x:1,y:14},{x:4,y:17}][phase]!; break;
      }
      if (mode === 'read' || mode === 'parcel' || mode === 'bellows') handR = { x: handL.x + 4, y: handL.y };
    } else {
      switch (mode) {
        case 'hammer': handR = [{x:18,y:13},{x:20,y:10},{x:17,y:18},{x:18,y:16}][phase]!; break;
        case 'read':
          handL = {x:back ? 3 : 5,y:[17,16,17,18][phase]!};
          handR = {x:back ? 16 : [13,13,12,13][phase]!,y:[17,16,14,18][phase]!}; break;
        case 'bellows':
          handL = {x:back ? 3 : 5,y:[15,16,18,17][phase]!};
          handR = {x:back ? 17 : 13,y:[15,16,18,17][phase]!}; break;
        case 'parcel':
          handL = {x:back ? 3 : 5,y:[18,17,16,18][phase]!};
          handR = {x:back ? [16,16,17,16][phase]! : 13,y:handL.y}; break;
        case 'gaze': handR = [{x:15,y:12},{x:15,y:10},{x:16,y:10},{x:16,y:13}][phase]!; break;
        case 'desk': handR = [{x:15,y:17},{x:16,y:16},{x:14,y:17},{x:16,y:14}][phase]!; handL = {x:5,y:18}; break;
        case 'haggle': handR = [{x:15,y:18},{x:18,y:16},{x:17,y:14},{x:14,y:17}][phase]!; break;
      }
    }
  }

  // ---------------------------------------------------------------- anatomy
  // OpenCrabs Reef: the residents are crabs. Same body grid, same baseline and
  // the same prop anchors as before; the anatomy is what changed. A wide domed
  // carapace, two eyestalks, a pair of pincers held out at the sides, and six
  // jointed legs staggered in y so each reads as its own limb.
  const shell = look.cloth, shellDark = look.cloth2, shellLite = shade(look.cloth, 1.18);
  const under = look.skin, underDark = skinDark;
  const mark = look.hair, markDark = hairDark;
  const baseY = oy + (sitting ? 2 : 0);

  // Carapace: [left x, width] per row, crown to rim. Narrower than the frame so
  // the claws and legs stay outside it, and wider than it is tall: that
  // proportion is what separates a crab shell from a torso.
  const CARA: readonly (readonly [number, number])[] = [
    [7, 6], [5, 10], [4, 12], [3, 14], [3, 14], [4, 12], [5, 10], [7, 6],
  ];

  const carapace = () => {
    for (let i = 0; i < CARA.length; i++) {
      const [cx, cw] = CARA[i]!;
      const y = 13 + i + baseY;
      rect(cx, y, cw, 1, shell);
      rect(cx + cw - 4, y, 4, 1, shellDark);
      if (i < 3) rect(cx + 1, y, cw - 5, 1, shellLite);
    }
    // Shell texture: scattered speckle, never a straight band. Two full-width
    // horizontal bars here read as a belt or a garment sash across the shell.
    for (let i = 0; i < 6; i++) {
      const sx = 4 + ((i * 5 + (i % 2) * 3) % 11);
      px(sx, 17 + baseY + (i % 2), markDark);
      px(sx + 1, 18 + baseY - (i % 2), mark);
    }
    for (let i = 0; i < 4; i++) px(6 + i * 2, 20 + baseY, markDark);
    if (look.apron) { rect(8, 14 + baseY, 5, 3, shade(shell, 1.3)); rect(8, 14 + baseY, 5, 1, shellLite); }
    if (look.beard) for (let i = 0; i < 3; i++) rect(6 + i * 3, 21 + baseY + (i % 2), 2, 1, '#c9d8cf');
    // Crest variants, not headwear: raised bumps along the shell ridge. Bars
    // at these y values read as a hat brim, a visor or a belt.
    if (look.hat === 'brim') for (let i = 0; i < 3; i++) px(7 + i * 3, 12 + baseY - (i === 1 ? 1 : 0), mark);
    else if (look.hat === 'cap') { px(9, 12 + baseY, mark); px(10, 11 + baseY, mark); px(11, 12 + baseY, mark); }
    else if (look.hat === 'band') for (let i = 0; i < 3; i++) px(5 + i * 4, 19 + baseY + (i % 2), mark);
    else if (look.hat === 'goggles') { px(7, 14 + baseY, '#c9d8cf'); px(12, 14 + baseY, '#c9d8cf'); }
  };

  // Six legs, three to a side. Each starts and lands lower than the last, so a
  // bank reads as three limbs instead of one thick mass with a splayed foot.
  const legs = (dir: number, far: boolean) => {
    for (let i = 0; i < 3; i++) {
      const lift = (walking && (i + phase + (dir > 0 ? 1 : 0)) % 2 === 0 ? 1 : 0) + (sitting ? 2 : 0);
      // Each leg hangs off its OWN hip point and carries its own tone. Sharing
      // one hip made the three strokes converge into a single thick limb with
      // three tips at the floor; separate hips plus a tone gradient is what
      // makes the count read as three legs.
      const col = far ? shade(look.pants, 0.5) : shade(look.pants, [1.2, 0.85, 0.6][i]!);
      const hipX = dir < 0 ? 4 + i * 2 : 15 - i * 2;
      const hipY = 16 + i * 2 + baseY;
      const kneeX = hipX + dir * (4 - i), kneeY = 20 + i * 2 + baseY - lift;
      const footX = hipX + dir * (6 - i), footY = 30 - i + oy - lift;
      stroke({ x: hipX, y: hipY }, { x: kneeX, y: kneeY }, col, 1);
      stroke({ x: kneeX, y: kneeY }, { x: footX, y: footY }, shade(col, 0.78), 1);
      px(kneeX, kneeY, shade(col, 1.3));
      px(footX, footY, INK);
    }
  };

  // Pincer: a short arm out to the pose's grip point, then one broad palm with
  // two jaws and an open notch between them. Two straight digits would read as
  // a hand again, so the gap is the whole point. The clamp keeps the widest
  // work poses inside the frame instead of clipping against the border.
  const claw = (root: Point, tip: Point, dir: number, far: boolean) => {
    const col = far ? shellDark : shell;
    const lite = far ? shellDark : shellLite;
    // 2px arm. The palm is wider than the arm, so the limb has a joint read.
    stroke(root, tip, col, 2);
    // Palm sits outboard of the carapace and is outlined, so it never merges
    // into the shell. The bounds keep every pose (walk, work, reaction) inside
    // the 32px frame with a transparent gutter on all four sides.
    const px0 = dir > 0 ? Math.min(tip.x, 16) : Math.max(tip.x - 5, -3);
    const py0 = tip.y - 2;
    rect(px0, py0, 6, 5, INK);
    // Two prongs with an open gap between them. A single solid block reads as
    // a mitten or a vent; the dark notch is what makes it a pincer.
    rect(px0 + 1, py0 + 1, 4, 1, col);
    rect(px0 + 1, py0 + 3, 4, 1, col);
    px(px0 + 2, py0 + 1, lite);
    // Inboard shoulder, joining the palm back to the arm.
    rect(dir > 0 ? px0 : px0 + 5, py0 + 2, 1, 1, col);
  };

  // The pincer jaw that closes over a held prop, so nothing floats free.
  const gripOver = (point: Point, far: boolean) => {
    const col = far ? shellDark : shell;
    rect(point.x - 1, point.y - 1, 3, 2, col);
    rect(point.x - 1, point.y + 1, 3, 1, under);
    px(point.x, point.y - 1, far ? col : shellLite);
  };

  const eyestalks = () => {
    const top = 5 + baseY + headDip;
    const stalk = (x: number) => {
      rect(x, top + 3, 1, 5, under);
      px(x, top + 7, underDark);
      rect(x - 1, top, 3, 3, INK);
      rect(x - 1, top, 3, 1, underDark);
      px(x + 1, top + 1, blink ? underDark : '#eef6f4');
    };
    if (side) stalk(13); else { stalk(5); stalk(14); }
  };

  // A pincer has to clear the carapace or it reads as a lump on the shell, so
  // the tip is pushed out past the rim. Work poses keep their authored grip.
  const splay = (tip: Point, dir: number): Point =>
    ({ x: dir > 0 ? Math.max(tip.x, 19) : Math.min(tip.x, 0), y: tip.y });
  // Far limbs, then the shell, then the near limbs: the carapace occludes the
  // far legs, and the near claw ends up in front of everything it should.
  if (side) { legs(1, true); claw({ x: 14, y: 16 + baseY }, splay(handR, 1), 1, true); }
  carapace();
  legs(-1, false);
  if (!side) legs(1, false);
  eyestalks();
  claw({ x: 5, y: 16 + baseY }, splay(handL, -1), -1, false);
  if (!side) claw({ x: 14, y: 16 + baseY }, splay(handR, 1), 1, false);

  // Props share the exact grip coordinates above. No detached dust/spark
  // substitutes for claw motion. Bellows has leather folds, not a hammer.
  if (working) {
    const grip = side ? handL : handR;
    if (mode === 'hammer') {
      if (phase <= 1) {
        rect(grip.x, grip.y - 5, 1, 6, STRAP);
        rect(grip.x - 2, grip.y - 7, side ? 4 : 5, 3, '#8b9090');
        rect(grip.x - 2, grip.y - 7, side ? 4 : 5, 1, '#b5b8b8');
      } else if (phase === 2) {
        if (side) {
          rect(grip.x - 3, grip.y, 4, 1, STRAP);
          rect(grip.x - 4, grip.y - 1, 3, 4, '#8b9090');
          rect(grip.x - 4, grip.y - 1, 3, 1, '#b5b8b8');
        } else {
          rect(grip.x, grip.y, 1, 5, STRAP);
          rect(grip.x - 1, grip.y + 4, 5, 3, '#8b9090');
          rect(grip.x - 1, grip.y + 4, 5, 1, '#b5b8b8');
        }
      } else {
        stroke(grip, {x:grip.x - 2,y:grip.y - 3}, STRAP, 1);
        rect(grip.x - 4, grip.y - 5, 4, 3, '#8b9090');
        rect(grip.x - 4, grip.y - 5, 4, 1, '#b5b8b8');
      }
    } else if (mode === 'read') {
      const bx = side ? handL.x - 3 : back ? handR.x - 1 : handL.x;
      const by = (back ? handR.y : handL.y) - 2;
      const width = side || back ? 7 : 10;
      rect(bx, by, width, 6, STRAP);
      rect(bx, by, width, 5, '#d8caa2');
      rect(bx + Math.floor(width / 2), by, 1, 5, '#a89a74');
      rect(bx + 1, by + 1, 2, 1, '#a89a74');
      if (phase === 1 || phase === 2) {
        // A page lifted by the moving wrist, then laid over the spine.
        rect(bx + (phase === 1 ? width - 3 : 2), by - (phase === 1 ? 1 : 2), 3, 4, '#f1ead8');
      }
    } else if (mode === 'bellows') {
      const bx = side ? grip.x - 2 : back ? grip.x - 1 : 6;
      const by = grip.y - 1;
      const height = 23 - by;
      rect(bx, by, 6, height, '#78503a');
      for (let y = by + 2; y < 22; y += 2) rect(bx + 1, y, 4, 1, STRAP);
      rect(bx - 1, by, 8, 1, HAT);
      rect(bx - 1, 22, 8, 1, HAT_DARK);
      rect(bx - 2, 21, 2, 1, '#8b9090');
    } else if (mode === 'parcel') {
      const bx = side ? handL.x - 3 : back ? handR.x - 1 : 5;
      const by = (back ? handR.y : handL.y) - 4;
      const width = side || back ? 7 : 10;
      rect(bx, by, width, 6, '#9f7950');
      rect(bx, by, width, 1, '#c0955f');
      rect(bx + Math.floor(width / 2), by, 1, 6, '#d5be89');
      rect(bx, by + 3, width, 1, '#d5be89');
    } else if (mode === 'gaze') {
      if (side) {
        // Bring to eye, focus, scan left, lower. The eyepiece meets the face.
        const gy = grip.y - 1;
        rect(grip.x - 5, gy, 9, 2, '#b99a58');
        rect(grip.x - 6, gy - 1, 2, 4, '#8a7a3a');
        rect(grip.x - 6, gy, 1, 2, '#7fb2dd');
        rect(grip.x + 2, gy, 1, 2, STRAP);
      } else {
        // End-on telescope is shorter through perspective, same moving grip.
        rect(grip.x - 1, grip.y - 2, 4, 4, '#8a7a3a');
        rect(grip.x, grip.y - 1, 2, 2, '#b99a58');
        rect(grip.x, grip.y - 1, 1, 1, '#7fb2dd');
        rect(grip.x + 1, grip.y + 1, 1, 2, STRAP);
      }
    } else if (mode === 'desk') {
      // Quill strokes travel with the wrist; phase 3 lifts clear of the page.
      rect(grip.x, grip.y - 4, 1, 6, '#c9b58f');
      rect(grip.x + 1, grip.y - 4, 1, 3, '#e0d3a0');
      px(grip.x, grip.y + 2, INK);
    } else if (mode === 'haggle') {
      // A held coin offered, turned in the palm, considered, withdrawn.
      rect(grip.x, grip.y - 2, phase === 2 ? 1 : 2, 2, BUCKLE);
      px(grip.x, grip.y - 2, '#f0d68b');
    }
    // The pincer closes over the held object, preserving its wrist anchor.
    gripOver(grip, false);
    if (mode === 'read' || mode === 'parcel' || mode === 'bellows') {
      gripOver(side ? handR : handL, side);
    }
  }

  // The ink outline paints the raw painter, bypassing the px gutter guard, and
  // it widens the silhouette by one pixel on every side. Clear the outermost
  // ring afterwards so every frame keeps the transparent gutter the sheet test
  // pins, whatever the pose, the lean offset or the prop does.
  outline(p, INK);
  p.ctx.clearRect(0, 0, FRAME_W, 1);
  p.ctx.clearRect(0, FRAME_H - 1, FRAME_W, 1);
  p.ctx.clearRect(0, 0, 1, FRAME_H);
  p.ctx.clearRect(FRAME_W - 1, 0, 1, FRAME_H);
  return p;
}

/** Small emote bubble sprites keyed by name. */
export function paintEmote(kind: 'ok' | 'fail' | 'think' | 'zzz' | 'wait'): HTMLCanvasElement {
  const p = new Painter(12, 12);
  p.disc(6, 5, 5, '#f7f1e3');
  p.rect(4, 10, 2, 2, '#f7f1e3');
  switch (kind) {
    case 'ok': p.px(3, 5, '#3b7a2a'); p.px(4, 6, '#3b7a2a'); p.px(5, 7, '#3b7a2a'); p.px(6, 6, '#3b7a2a'); p.px(7, 5, '#3b7a2a'); p.px(8, 4, '#3b7a2a'); p.px(9, 3, '#3b7a2a'); break;
    case 'fail': p.rect(5, 2, 2, 5, '#b8322a'); p.rect(5, 8, 2, 1, '#b8322a'); break;
    case 'think': p.rect(3, 4, 6, 1, PAL.stone2); p.rect(3, 6, 4, 1, PAL.stone2); break;
    case 'zzz': p.rect(3, 3, 3, 1, PAL.stone2); p.px(4, 4, PAL.stone2); p.rect(3, 5, 3, 1, PAL.stone2); p.rect(7, 5, 3, 1, PAL.stone2); p.px(8, 6, PAL.stone2); p.rect(7, 7, 3, 1, PAL.stone2); break;
    case 'wait': p.rect(4, 2, 4, 1, PAL.stone2); p.rect(4, 8, 4, 1, PAL.stone2); p.px(5, 3, PAL.stone2); p.px(6, 3, PAL.stone2); p.px(5, 7, PAL.stone2); p.px(6, 7, PAL.stone2); p.px(5, 5, PAL.stone2); p.px(6, 5, PAL.stone2); break;
  }
  outline(p, PAL.outline);
  return p.canvas;
}
