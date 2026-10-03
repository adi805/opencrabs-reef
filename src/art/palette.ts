/**
 * One constrained palette: the reef. Sunlit teal shallows, kelp greens, coral
 * pinks, bleached sand and driftwood, bioluminescent light, deep ink-blue outlines.
 *
 * Every land colour keeps its key so no consumer had to change, and each family
 * was translated rather than replaced wholesale: the value ramp that makes the
 * town legible at small sprite sizes survives. Where a land colour carried
 * meaning (lamp = warm interior light, ember = forge heat) the reef keeps an
 * equivalent signal — bioluminescent cyan-green for lit windows, hydrothermal
 * orange for the forge.
 */
export const PAL = {
  ink: '#0e1519',
  outline: '#16242b',
  // Turf becomes kelp on rock: same three-step ramp, cooled.
  grass: '#3d6b5a',
  grass2: '#366151',
  grass3: '#487a63',
  // Topsoil becomes bleached reef sand.
  dirt: '#a89468',
  dirt2: '#94815a',
  // Cobble becomes cut coral-rock: warmer and faintly pink, still low chroma.
  cobble: '#7d6f72',
  cobble2: '#8c8082',
  cobble3: '#675c61',
  // Water is the dominant material now, so it owns the deepest, clearest blues.
  water: '#1f4d5f',
  water2: '#2a5e74',
  wood: '#6f5f4a',
  wood2: '#544738',
  wood3: '#8b7859',
  plaster: '#c2b096',
  plaster2: '#a6947e',
  stone: '#7f8388',
  stone2: '#666a6f',
  // Roofs carry the reef's colour: coral, anemone, sea-fan, abalone.
  roofBrown: '#8a5448',
  roofBrown2: '#66392f',
  roofSlate: '#3b4f5c',
  roofSlate2: '#2b3b46',
  roofMoss: '#3f6b5e',
  roofMoss2: '#2f5449',
  roofPlum: '#5a4a78',
  roofPlum2: '#423657',
  glassDark: '#2b4552',
  // Lamps are living light, not flame.
  lamp: '#78dcc8',
  lampCore: '#e2fbf2',
  leaf: '#2f6b52',
  leaf2: '#24523f',
  leaf3: '#42805f',
  trunk: '#5c4650',
  skin: '#e0b394',
  skin2: '#c08d70',
  // Exhaust becomes bubble trails and vent smoke.
  smoke: '#8fb3bd',
  ember: '#ef8a52',
} as const;

/**
 * Resident identity colours. The reef's people run crustacean-warm — shell reds
 * and oranges against anemone purple and kelp green — so a crowd reads warm on a
 * cold ground plane instead of dissolving into it.
 */
export const HAIR = ['#3a2429', '#6b3a3a', '#b3763f', '#c9a06a', '#8a3a4a', '#3c4a52', '#b9b3ae'];
export const CLOTH = ['#a4483c', '#2f6b7a', '#3f6b58', '#6b4a7a', '#b3813f', '#43545c', '#7a6a4a', '#2f6b66'];
