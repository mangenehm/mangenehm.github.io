/*
 * Tier-Sticker, Treffer-, Daneben- und Spuren-Marker zeichnen (in CSS-Pixeln).
 * Generierte Sticker (assets/*.webp, siehe scripts/generate-assets.mjs) werden
 * genutzt, sobald sie in assets/manifest.json stehen; sonst zeichnet die App
 * eigene Formen mit Emoji.
 */

import { ANIMALS } from '../engine/shapes.js';

const images = {};
let loading = null;
const EMOJI_FONT = 'system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

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
  const img = asset('head-' + animalId);
  return img
    ? `<img class="${cls}" src="${img.src}" alt="">`
    : `<span class="${cls} emoji" aria-hidden="true">${ANIMALS[animalId].emoji}</span>`;
}

/**
 * Tier als runder Sticker mit Mittelpunkt (x, y) und Durchmesser d.
 * opts: glow (Lieblingsgelände), invalid, ghost, selected, dim
 */
export function drawSticker(ctx, animalId, x, y, d, opts = {}) {
  const a = ANIMALS[animalId];
  const r = d / 2;
  ctx.save();
  if (opts.ghost) ctx.globalAlpha = 0.6;
  if (opts.dim) ctx.globalAlpha = 0.4;

  ctx.save();
  if (opts.glow) { ctx.shadowColor = 'rgba(255, 200, 40, .95)'; ctx.shadowBlur = d * 0.45; }
  else { ctx.shadowColor = 'rgba(30, 30, 20, .3)'; ctx.shadowBlur = d * 0.12; ctx.shadowOffsetY = d * 0.04; }
  ctx.fillStyle = opts.invalid ? '#ffe1dc' : '#fff';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  if (opts.glow) ctx.fill();
  ctx.restore();

  ctx.fillStyle = opts.invalid ? '#e2574c' : a.color;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.86, 0, Math.PI * 2);
  ctx.fill();

  const img = asset(animalId);
  if (img && !opts.invalid) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.86, 0, Math.PI * 2);
    ctx.clip();
    // Sticker einpassen (Hund ist breit, Pferd hoch)
    const s = Math.min((d * 0.95) / img.naturalWidth, (d * 0.95) / img.naturalHeight);
    const w = img.naturalWidth * s, h = img.naturalHeight * s;
    ctx.drawImage(img, x - w / 2, y - h / 2, w, h);
    ctx.restore();
  } else {
    ctx.font = `${d * 0.55}px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(a.emoji, x, y + d * 0.04);
  }

  if (opts.selected) {
    ctx.save();
    ctx.setLineDash([d * 0.1, d * 0.07]);
    ctx.lineWidth = Math.max(2, d * 0.05);
    ctx.strokeStyle = '#13293d';
    ctx.beginPath();
    ctx.arc(x, y, r + 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  if (opts.glow) {
    ctx.font = `${d * 0.36}px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✨', x + r * 0.85, y - r * 0.8);
  }
  ctx.restore();
}

/** Daneben: aufgewirbelter Staub. */
export function drawMiss(ctx, x, y, d) {
  const img = asset('miss');
  ctx.save();
  if (img) {
    ctx.drawImage(img, x - d / 2, y - d / 2, d, d);
  } else {
    ctx.fillStyle = 'rgba(120, 98, 70, .7)';
    for (const [dx, dy, r] of [[-0.14, 0.06, 0.16], [0.12, 0.08, 0.14], [0, -0.08, 0.15], [0.2, -0.14, 0.06], [-0.24, -0.16, 0.05]]) {
      ctx.beginPath();
      ctx.arc(x + dx * d, y + dy * d, r * d, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Treffer: Pfotenabdruck. */
export function drawHit(ctx, x, y, d, { color = '#5b3a29' } = {}) {
  const img = asset('hit');
  ctx.save();
  if (img) {
    ctx.drawImage(img, x - d / 2, y - d / 2, d, d);
  } else {
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    ctx.beginPath();
    ctx.arc(x, y, d * 0.48, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x, y + d * 0.1, d * 0.17, d * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    for (const [dx, dy] of [[-0.22, -0.06], [-0.08, -0.21], [0.08, -0.21], [0.22, -0.06]]) {
      ctx.beginPath();
      ctx.ellipse(x + dx * d, y + dy * d, d * 0.068, d * 0.085, dx * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

/** Spuren: kleines Abzeichen mit Fußabdrücken. */
export function drawTracks(ctx, x, y, d) {
  ctx.save();
  ctx.fillStyle = '#e9b949';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = Math.max(1.5, d * 0.08);
  ctx.beginPath();
  ctx.arc(x, y, d / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.font = `${d * 0.62}px ${EMOJI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#13293d';
  ctx.fillText('👣', x, y + d * 0.04);
  ctx.restore();
}
