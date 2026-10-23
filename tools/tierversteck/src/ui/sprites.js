/*
 * Tiere, Treffer- und Daneben-Marker zeichnen.
 * Generierte Sticker (assets/*.webp, siehe scripts/generate-assets.mjs) werden
 * genutzt, sobald sie in assets/manifest.json stehen; sonst zeichnet die App
 * eigene Formen mit Emoji.
 */

import { ANIMALS, orientationMatrix, placementCells } from '../engine/shapes.js';

const images = {};
let loading = null;

/** Lädt die verfügbaren Grafiken einmalig. */
export function loadAssets() {
  loading ??= (async () => {
    try {
      const res = await fetch('assets/manifest.json', { cache: 'no-cache' });
      if (!res.ok) return;
      const manifest = await res.json();
      await Promise.all(Object.entries(manifest).map(([key, file]) => new Promise(resolve => {
        const img = new Image();
        img.onload = () => { images[key] = img; resolve(); };
        img.onerror = resolve;
        img.src = 'assets/' + file;
      })));
    } catch { /* ohne Grafiken weiter */ }
  })();
  return loading;
}

export function asset(key) { return images[key] || null; }

/** Kleiner Tierkopf für Legenden: <img> wenn vorhanden, sonst Emoji. */
export function headHtml(animalId, cls = 'head') {
  const img = asset('head-' + animalId) || asset(animalId);
  return img
    ? `<img class="${cls}" src="${img.src}" alt="">`
    : `<span class="${cls} emoji" aria-hidden="true">${ANIMALS[animalId].emoji}</span>`;
}

function cellSet(cells) { return new Set(cells.map(c => c[0] + ',' + c[1])); }

/** Pfad aller Zellen einer Form; innen bündig, außen mit Abstand `inset` und runden Ecken. */
function shapePath(cells, cell, ox, oy, inset, radius) {
  const set = cellSet(cells);
  const has = (x, y) => set.has(x + ',' + y);
  const path = new Path2D();
  for (const [x, y] of cells) {
    const l = has(x - 1, y) ? 0 : inset, r = has(x + 1, y) ? 0 : inset;
    const t = has(x, y - 1) ? 0 : inset, b = has(x, y + 1) ? 0 : inset;
    const px = ox + x * cell + l, py = oy + y * cell + t;
    const w = cell - l - r, h = cell - t - b;
    const rad = [l && t ? radius : 0, r && t ? radius : 0, r && b ? radius : 0, l && b ? radius : 0];
    if (path.roundRect) path.roundRect(px, py, w, h, rad);
    else path.rect(px, py, w, h);
  }
  return path;
}

/**
 * Tier als Sticker zeichnen.
 * opts: glow (Lieblingsgelände), invalid, ghost, selected, dim
 */
export function drawAnimal(ctx, p, cell, ox, oy, opts = {}) {
  const a = ANIMALS[p.animal];
  const cells = placementCells(p);
  const border = Math.max(2, cell * 0.08);
  const inset = cell * 0.08;
  ctx.save();
  if (opts.ghost) ctx.globalAlpha = 0.55;
  if (opts.dim) ctx.globalAlpha = 0.35;

  // weißer Sticker-Rand (mit Glanz, wenn im Lieblingsgelände)
  const outer = shapePath(cells, cell, ox, oy, inset - border, cell * 0.28);
  ctx.save();
  if (opts.glow) { ctx.shadowColor = 'rgba(255, 200, 40, .95)'; ctx.shadowBlur = cell * 0.55; }
  else { ctx.shadowColor = 'rgba(30, 30, 20, .28)'; ctx.shadowBlur = cell * 0.12; ctx.shadowOffsetY = cell * 0.04; }
  ctx.fillStyle = opts.invalid ? '#ffe1dc' : '#fff';
  ctx.fill(outer);
  if (opts.glow) ctx.fill(outer);   // doppelt für kräftigeren Schein
  ctx.restore();

  const inner = shapePath(cells, cell, ox, oy, inset, cell * 0.2);
  ctx.fillStyle = opts.invalid ? '#e2574c' : a.color;
  ctx.fill(inner);

  const img = asset(p.animal);
  if (img && !opts.invalid) {
    ctx.save();
    ctx.clip(inner);
    drawOriented(ctx, img, p, cell, ox, oy);
    ctx.restore();
  } else {
    drawEmoji(ctx, a.emoji, cells, cell, ox, oy);
  }

  if (opts.selected) {
    ctx.save();
    ctx.setLineDash([cell * 0.12, cell * 0.08]);
    ctx.lineWidth = Math.max(2, cell * 0.05);
    ctx.strokeStyle = '#13293d';
    ctx.stroke(outer);
    ctx.restore();
  }
  if (opts.glow) {
    const [sx, sy] = cells.reduce((m, c) => (c[1] < m[1] || (c[1] === m[1] && c[0] > m[0]) ? c : m), cells[0]);
    ctx.font = `${cell * 0.42}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✨', ox + (sx + 0.92) * cell, oy + (sy + 0.1) * cell);
  }
  ctx.restore();
}

/** Grafik auf die Grundform-Box setzen und mit der Form drehen/spiegeln. */
function drawOriented(ctx, img, p, cell, ox, oy) {
  const base = ANIMALS[p.animal].cells;
  const w0 = Math.max(...base.map(c => c[0])) + 1;
  const h0 = Math.max(...base.map(c => c[1])) + 1;
  const [a, b, c, d] = orientationMatrix(p.rot, p.flip);
  const xs = [0, a * w0, c * h0, a * w0 + c * h0];
  const ys = [0, b * w0, d * h0, b * w0 + d * h0];
  const minX = Math.min(...xs), minY = Math.min(...ys);
  ctx.transform(a * cell, b * cell, c * cell, d * cell, ox + (p.x - minX) * cell, oy + (p.y - minY) * cell);
  // quadratischen Sticker zentriert auf die Box legen (Überstand schneidet die Maske ab)
  const s = Math.max(w0, h0);
  ctx.drawImage(img, (w0 - s) / 2, (h0 - s) / 2, s, s);
}

function drawEmoji(ctx, emoji, cells, cell, ox, oy) {
  // Emoji auf die Zelle mit den meisten Nachbarn (Körpermitte)
  const set = cellSet(cells);
  let best = cells[0], bestN = -1;
  for (const [x, y] of cells) {
    const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => set.has(x + dx + ',' + (y + dy))).length;
    if (n > bestN) { best = [x, y]; bestN = n; }
  }
  ctx.font = `${cell * 0.66}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, ox + (best[0] + 0.5) * cell, oy + (best[1] + 0.54) * cell);
}

/** Daneben: aufgewirbelter Staub. */
export function drawMiss(ctx, x, y, cell, ox, oy) {
  const cx = ox + (x + 0.5) * cell, cy = oy + (y + 0.5) * cell;
  const img = asset('miss');
  ctx.save();
  if (img) {
    ctx.drawImage(img, cx - cell * 0.42, cy - cell * 0.42, cell * 0.84, cell * 0.84);
  } else {
    ctx.fillStyle = 'rgba(120, 98, 70, .7)';
    for (const [dx, dy, r] of [[-0.14, 0.06, 0.16], [0.12, 0.08, 0.14], [0, -0.08, 0.15], [0.2, -0.14, 0.06], [-0.24, -0.16, 0.05]]) {
      ctx.beginPath();
      ctx.arc(cx + dx * cell, cy + dy * cell, r * cell, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Treffer: Pfotenabdruck. */
export function drawHit(ctx, x, y, cell, ox, oy, { small = false, color = '#5b3a29' } = {}) {
  let cx = ox + (x + 0.5) * cell, cy = oy + (y + 0.5) * cell;
  const img = asset('hit');
  ctx.save();
  if (small) {
    // auf einem sichtbaren Tier: kleine Pfote in der Ecke, damit das Tier erkennbar bleibt
    const s = 0.5;
    cx = ox + (x + 0.74) * cell;
    cy = oy + (y + 0.74) * cell;
    ctx.translate(cx, cy);
    ctx.scale(s, s);
    ctx.translate(-cx, -cy);
  }
  if (img) {
    ctx.drawImage(img, cx - cell * 0.42, cy - cell * 0.42, cell * 0.84, cell * 0.84);
  } else {
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.beginPath();
    ctx.arc(cx, cy, cell * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(cx, cy + cell * 0.1, cell * 0.15, cell * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
    for (const [dx, dy] of [[-0.19, -0.05], [-0.07, -0.18], [0.07, -0.18], [0.19, -0.05]]) {
      ctx.beginPath();
      ctx.ellipse(cx + dx * cell, cy + dy * cell, cell * 0.058, cell * 0.072, dx * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Blitz-Abzeichen für Felder, die einen Konter ausgelöst haben. */
export function drawCounterBadge(ctx, x, y, cell, ox, oy) {
  const cx = ox + (x + 0.84) * cell, cy = oy + (y + 0.16) * cell;
  ctx.save();
  ctx.fillStyle = '#e9b949';
  ctx.beginPath();
  ctx.arc(cx, cy, cell * 0.17, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#13293d';
  ctx.font = `700 ${cell * 0.24}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('⚡', cx, cy + cell * 0.01);
  ctx.restore();
}
