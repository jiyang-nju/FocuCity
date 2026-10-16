export function seedNumber(seed) {
  if (typeof seed === 'number') return seed | 0;
  let h = 2166136261;
  for (const c of String(seed || 'moss')) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h | 0;
}
function rand(x, y, seed = 1) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ h >>> 13, 1274126177);
  return ((h ^ h >>> 16) >>> 0) / 4294967295;
}
function noise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = rand(ix, iy, seed), b = rand(ix + 1, iy, seed), c = rand(ix, iy + 1, seed), d = rand(ix + 1, iy + 1, seed);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}
function legacyTerrainAt(x, y, seed = 1) {
  const s = seedNumber(seed), radial = Math.hypot(x, y);
  if (radial < 4.5) return 'grass';
  const phase = (s % 1000) * .007;
  const river = 8.5 + Math.sin(y * .14 + phase) * 2.5 + Math.sin(y * .049) * 4;
  const lakeX = 12 + Math.sin(phase) * 2;
  const lake = (x - lakeX) ** 2 / 24 + (y - 7) ** 2 / 31;
  if (Math.abs(x - river) < 1.05 + noise(x * .2, y * .2, s + 8) * .65 || lake < 1) return 'water';
  const hills = noise(x * .083, y * .083, s + 12);
  if (radial > 10 && hills > .73 || radial > 19 && hills > .64) return 'mountain';
  const trees = noise(x * .17, y * .17, s + 41);
  if (radial > 4.9 && trees > .53 && rand(x, y, s + 72) > .12) return 'forest';
  return 'grass';
}

// Versioned generation keeps every old city on its original land. New worlds
// have a connected watershed plus scattered lakes and shoreline biomes.
export function terrainAt(x, y, seed = 1, version = 1) {
  if (version !== 2) return legacyTerrainAt(x, y, seed);
  const s = seedNumber(seed), radial = Math.hypot(x, y);
  if (radial < 5.5) return 'grass';
  const phase = (s % 1000) * .007;
  const band = Math.round((x - 12) / 68);
  const riverX = 12 + band * 68 + Math.sin(y * .055 + phase + band) * 7 + Math.sin(y * .16 + band) * 2;
  const branchBand = Math.round((y - 37) / 93);
  const branchY = 37 + branchBand * 93 + Math.sin(x * .065 + phase + branchBand * 2) * 12;
  const riverDistance = Math.abs(x - riverX) - (1.4 + noise(x * .08, y * .08, s + 8) * 1.3);
  const branchDistance = Math.abs(y - branchY) - (1.1 + noise(x * .1, y * .1, s + 18));
  let lakeDistance = Infinity;
  const gx = Math.floor((x + 20) / 72), gy = Math.floor((y - 14) / 72);
  for (let dx = 0; dx <= 1; dx++) for (let dy = 0; dy <= 1; dy++) {
    const ix = gx + dx, iy = gy + dy;
    const cx = ix * 72 - 20 + (rand(ix, iy, s + 91) - .5) * 14;
    const cy = iy * 72 + 14 + (rand(ix, iy, s + 92) - .5) * 14;
    const rx = 5 + rand(ix, iy, s + 93) * 8, ry = 4 + rand(ix, iy, s + 94) * 7;
    const shape = Math.hypot((x - cx) / rx, (y - cy) / ry);
    lakeDistance = Math.min(lakeDistance, (shape - 1) * Math.min(rx, ry));
  }
  const shoreDistance = Math.min(riverDistance, branchDistance, lakeDistance);
  if (shoreDistance < 0) return 'water';
  if (shoreDistance < 1.65) return noise(x * .16, y * .16, s + 82) > .52 ? 'wetland' : 'sand';
  const hills = noise(x * .048, y * .048, s + 12) * .72 + noise(x * .12, y * .12, s + 66) * .28;
  if (radial > 11 && hills > .69 || radial > 28 && hills > .62) return 'mountain';
  const trees = noise(x * .13, y * .13, s + 41);
  if (trees > .51 && rand(x, y, s + 72) > .1) return 'forest';
  return 'grass';
}
