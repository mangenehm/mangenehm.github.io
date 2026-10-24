/* Testhilfen */

/** w × h Orte als Quadrate; Nachbarn links/rechts/oben/unten. Id = y·w + x. */
export function gridBoard(w = 6, h = 6, t = 'house') {
  const regions = [], adj = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    regions.push({ t, n: `Block ${x},${y}`, c: [x * 10 + 5, y * 10 + 5], p: [[x * 10, y * 10, x * 10 + 10, y * 10, x * 10 + 10, y * 10 + 10, x * 10, y * 10 + 10]] });
    const a = [];
    if (y > 0) a.push((y - 1) * w + x);
    if (x > 0) a.push(y * w + x - 1);
    if (x < w - 1) a.push(y * w + x + 1);
    if (y < h - 1) a.push((y + 1) * w + x);
    adj.push(a);
  }
  return { size: Math.max(w, h) * 10, regions, adj, lines: [], pois: [] };
}
