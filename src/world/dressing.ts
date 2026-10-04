import type { PropKind } from './map';

/** Placement anchors retained from the map, independent of rendered sprite size.
 * Props absent from this catalog are removed before building collision data. */
export const PROP_ANCHORS: Partial<Record<PropKind, readonly [number, number]>> = {
  // No street furniture. Lampposts, benches, signposts and notice boards are
  // town furniture: a post planted in the seabed with a globe on top reads as a
  // streetlight in every frame, whatever it is painted, and the vision pass
  // named it every time. Their entries are removed here, which drops the props
  // before they are ever placed.
  tree: [32, 40],
  crate: [12, 12], barrel: [10, 13], anvil: [16, 12], workbench: [22, 14],
  lectern: [14, 16], telescope: [16, 20], postbox: [10, 16], desk: [20, 12], stall: [20, 12],
  bush: [18, 12], rock: [14, 10], cart: [28, 18],
  grave0: [12, 14], grave1: [12, 14], grave2: [12, 14],
  flowerBox: [18, 10], planter: [14, 16],
  fountain: [36, 30], chapel: [40, 46], marketStall0: [30, 28], marketStall1: [30, 28],
  hedge: [16, 12], dock: [20, 14],
};

export const hasWorldSprite = (kind: PropKind): boolean => kind in PROP_ANCHORS;

export const TREE_ANCHORS: readonly (readonly [number, number])[] = [[32, 40], [32, 40], [48, 52], [24, 52], [16, 22], [32, 40]];
