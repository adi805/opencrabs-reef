# Runtime sprite atlases

These original sprite atlases were created for Hermes Town and are shipped as runtime assets under the repository's MIT License.

The files are sprite sheets rather than flattened screenshots. Layout, collisions, residents, workstations, lighting, particles, and lifecycle behavior are implemented in TypeScript.

## Files

- `buildings.png`: seven work buildings plus the cottage family.
- `vegetation.png`: trees, saplings, and shrubs.
- `props.png`: fountain, chapel, market stalls, bridge, rocks, lamp, and cart.
- `furniture.png`: benches, planters, storage, signs, graves, fences, walls, stairs, and banners.
- `equipment.png`: anvil, workbench, lectern, telescope, post box, desk, serving table, and crops.

The source sheets use a reserved magenta chroma key in empty regions. `src/art/reference.ts` defines the authored source rectangles, removes the key, trims each region, downsamples it to the runtime pixel density, and preserves alpha.

## Resolution

These sheets ship at half the authored resolution. Every frame is downsampled by the pipeline anyway, so the removed pixels were payload and per-pixel despill work rather than visible detail; the palette is untouched at 256 colours, because colour depth is what keeps the shading ramps readable. Cutting the palette instead was measured and rejected: the sprite pipeline needs about 64 colours per sheet to hold its ramps, which puts the full-resolution set at 2572 KB, over the 2048 KB budget. Halving the resolution lands at 1180 KB with the full 256-colour palette.

The rectangles in `reference.ts` stay in authored space and are multiplied by `SHEET_SCALE` when read, so they remain comparable against the original art and against upstream. `cell()`-derived grids (furniture, equipment) already scale with the image and need no adjustment.

Residents are drawn in code at the same pixel density so identity colors and lifecycle animation frames remain deterministic.
