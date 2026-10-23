/*
 * Polygone → Geländeklasse je Zelle.
 * Die Features werden auf ein unsichtbares Canvas gerastert (eine Farbe je
 * Klasse, ohne Mischfarben zu werten); dann zählt die App pro Zelle die Pixel.
 * Die häufigste Klasse gewinnt, bei Gleichstand gilt
 * Wasser > Gebäude > Wald > Grün > Straße > Sonstiges.
 */

export const PRIORITY = ['water', 'building', 'forest', 'green', 'road', 'other'];

// Zeichenreihenfolge: später gezeichnet liegt oben (Brücken über Wasser, Häuser über allem)
export const DRAW_ORDER = ['green', 'forest', 'water', 'road', 'building'];

export const RASTER_COLORS = {
  other:    [0, 0, 0],
  water:    [0, 0, 255],
  building: [255, 0, 0],
  forest:   [0, 128, 0],
  green:    [0, 255, 0],
  road:     [255, 255, 0],
};

export const PX_PER_CELL = 16;

/** Pfad eines Features anlegen (Maßstab: Pixel pro Zelle). */
export function traceFeature(ctx, f, scale, offX = 0, offY = 0) {
  ctx.beginPath();
  for (const pts of f.p) {
    for (let i = 0; i + 1 < pts.length; i += 2) {
      const x = offX + pts[i] * scale, y = offY + pts[i + 1] * scale;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    if (f.k === 'a') ctx.closePath();
  }
}

export function sortedFeatures(features) {
  return [...features].sort((a, b) => DRAW_ORDER.indexOf(a.c) - DRAW_ORDER.indexOf(b.c));
}

/** Zeichnet die Klassen-Rasterung in einen 2D-Kontext der Größe size·ppc. */
export function rasterize(ctx, features, size, ppc = PX_PER_CELL) {
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = rgb(RASTER_COLORS.other);
  ctx.fillRect(0, 0, size * ppc, size * ppc);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const f of sortedFeatures(features)) {
    const color = rgb(RASTER_COLORS[f.c]);
    traceFeature(ctx, f, ppc);
    if (f.k === 'a') { ctx.fillStyle = color; ctx.fill('evenodd'); }
    else { ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, f.w * ppc); ctx.stroke(); }
  }
}

/** Reine Auswertung: RGBA-Pixel → Geländeklasse je Zelle. */
export function terrainFromPixels(data, size, ppc = PX_PER_CELL) {
  const lookup = new Map(Object.entries(RASTER_COLORS).map(([cls, c]) => [c.join(','), cls]));
  const width = size * ppc;
  const terrain = [];
  for (let cy = 0; cy < size; cy++) {
    for (let cx = 0; cx < size; cx++) {
      const counts = Object.fromEntries(PRIORITY.map(c => [c, 0]));
      for (let py = 0; py < ppc; py++) {
        for (let px = 0; px < ppc; px++) {
          const i = ((cy * ppc + py) * width + (cx * ppc + px)) * 4;
          const cls = lookup.get(data[i] + ',' + data[i + 1] + ',' + data[i + 2]);
          if (cls) counts[cls]++;      // Kanten-Mischfarben zählen nicht
        }
      }
      // Gleichstand: PRIORITY ist absteigend sortiert, daher gewinnt die erste mit Maximum
      const max = Math.max(...Object.values(counts));
      terrain.push(PRIORITY.find(c => counts[c] === max));
    }
  }
  return terrain;
}

/** Browser: Features rastern und klassifizieren. */
export function classifyFeatures(features, size, ppc = PX_PER_CELL) {
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(size * ppc, size * ppc)
    : Object.assign(document.createElement('canvas'), { width: size * ppc, height: size * ppc });
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  rasterize(ctx, features, size, ppc);
  return terrainFromPixels(ctx.getImageData(0, 0, size * ppc, size * ppc).data, size, ppc);
}

function rgb([r, g, b]) { return `rgb(${r},${g},${b})`; }
