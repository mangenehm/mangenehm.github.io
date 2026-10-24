/*
 * Features → zwei Pixel-Raster für die Ortsbildung:
 *  - cls:     Flächenklasse je Pixel (Gebäude, Wasser, Wald, Grün, Platz, sonst)
 *  - barrier: 1, wo eine trennende Straße, Bahn oder ein Fluss verläuft
 * Flächen werden nach Größe gezeichnet (große zuerst), damit der Teich im Park
 * und der Sportplatz im Grünzug oben liegen; Gebäude kommen zuletzt.
 */

export const CLASSES = ['other', 'building', 'water', 'forest', 'green', 'plaza'];
export const CLASS = Object.fromEntries(CLASSES.map((c, i) => [c, i]));

export const RASTER_COLORS = [
  [0, 0, 0],        // other
  [255, 0, 0],      // building
  [0, 0, 255],      // water
  [0, 128, 0],      // forest
  [0, 255, 0],      // green
  [255, 255, 0],    // plaza
];

/** Pfad eines Features anlegen (Maßstab: Pixel pro Einheit). */
export function traceFeature(ctx, f, scale = 1, offX = 0, offY = 0) {
  ctx.beginPath();
  for (const pts of f.p) {
    for (let i = 0; i + 1 < pts.length; i += 2) {
      const x = offX + pts[i] * scale, y = offY + pts[i + 1] * scale;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    if (f.k === 'a') ctx.closePath();
  }
}

/** Fläche eines Features (Summe der Ringe, Betrag). */
export function featureArea(f) {
  let a = 0;
  for (const pts of f.p) {
    let s = 0;
    for (let i = 0; i < pts.length; i += 2) {
      const j = (i + 2) % pts.length;
      s += pts[i] * pts[j + 1] - pts[j] * pts[i + 1];
    }
    a += Math.abs(s) / 2;
  }
  return a;
}

/** Zeichenreihenfolge der Flächen: groß → klein, Gebäude zuletzt. */
export function areaOrder(features) {
  return features
    .filter(f => f.k === 'a' && CLASS[f.c] !== undefined)
    .map(f => ({ f, a: f.c === 'building' ? -1 : featureArea(f) }))
    .sort((p, q) => (p.a < 0) - (q.a < 0) || q.a - p.a)
    .map(p => p.f);
}

/** Klassen-Rasterung in einen 2D-Kontext der Größe n × n (1 Einheit = 1 Pixel). */
export function rasterizeClasses(ctx, features, n) {
  ctx.fillStyle = rgb(RASTER_COLORS[CLASS.other]);
  ctx.fillRect(0, 0, n, n);
  for (const f of areaOrder(features)) {
    traceFeature(ctx, f);
    ctx.fillStyle = rgb(RASTER_COLORS[CLASS[f.c]]);
    ctx.fill('evenodd');
  }
  // Bäche und Flüsse ohne Fläche zählen als Wasser
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = rgb(RASTER_COLORS[CLASS.water]);
  for (const f of features) {
    if (f.k !== 'l' || f.c !== 'water') continue;
    traceFeature(ctx, f);
    ctx.lineWidth = Math.max(1, f.w);
    ctx.stroke();
  }
}

/** Trennlinien weiß auf schwarz. */
export function rasterizeBarriers(ctx, features, n) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, n, n);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#fff';
  for (const f of features) {
    if (f.k !== 'l' || !f.b) continue;
    traceFeature(ctx, f);
    ctx.lineWidth = Math.max(1.6, f.w);
    ctx.stroke();
  }
}

/** RGBA → Klasse je Pixel; Kanten-Mischfarben gehen an die nächstliegende Farbe. */
export function classesFromPixels(data, n) {
  const out = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    let best = 0, bestD = Infinity;
    for (let c = 0; c < RASTER_COLORS.length; c++) {
      const [cr, cg, cb] = RASTER_COLORS[c];
      const d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
      if (d < bestD) { bestD = d; best = c; }
    }
    out[i] = best;
  }
  return out;
}

export function maskFromPixels(data, n) {
  const out = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i++) out[i] = data[i * 4] > 100 ? 1 : 0;
  return out;
}

/** Browser: beide Raster erzeugen. */
export function rasterLayers(features, n) {
  const make = () => {
    const c = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(n, n)
      : Object.assign(document.createElement('canvas'), { width: n, height: n });
    return c.getContext('2d', { willReadFrequently: true });
  };
  const a = make();
  rasterizeClasses(a, features, n);
  const b = make();
  rasterizeBarriers(b, features, n);
  return {
    cls: classesFromPixels(a.getImageData(0, 0, n, n).data, n),
    barrier: maskFromPixels(b.getImageData(0, 0, n, n).data, n),
  };
}

function rgb([r, g, b]) { return `rgb(${r},${g},${b})`; }
