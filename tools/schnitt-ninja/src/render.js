/* Alles, was auf das Canvas gezeichnet wird. */

import { W, H } from './entities.js';

export const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","EmojiOne Color",sans-serif';
const UI_FONT = 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';

/** Okabe-Ito – auch bei Farbenblindheit unterscheidbar. Farbe ist im Spiel nie bedeutungstragend. */
export const PALETTE = ['#E69F00', '#56B4E9', '#009E73', '#F0E442', '#0072B2', '#D55E00', '#CC79A7'];

export const FRUITS = [
  { emoji: '🍉', color: '#ef476f' },
  { emoji: '🍎', color: '#e63946' },
  { emoji: '🍌', color: '#ffd166' },
  { emoji: '🍊', color: '#ff922b' },
  { emoji: '🍓', color: '#f25f5c' },
  { emoji: '🥝', color: '#90be6d' },
  { emoji: '🍍', color: '#f9c74f' },
  { emoji: '🍋', color: '#fff35c' },
];

let bgGradient = null;

export function drawBackground(ctx) {
  if (!bgGradient) {
    bgGradient = ctx.createLinearGradient(0, 0, 0, H);
    bgGradient.addColorStop(0, '#0b1020');
    bgGradient.addColorStop(0.55, '#151d3d');
    bgGradient.addColorStop(1, '#090d1c');
  }
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, W, H);
  // Mond
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(W * 0.78, H * 0.16, 70, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function tracePoly(ctx, poly) {
  ctx.beginPath();
  ctx.moveTo(poly[0].x, poly[0].y);
  for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
  ctx.closePath();
}

/** Zeichnet das Aussehen eines Items zentriert auf (0,0) – ohne eigene Transformation. */
export function paintVisual(ctx, item) {
  const r = item.r;
  switch (item.kind) {
    case 'number': {
      ctx.fillStyle = item.color;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = item.edge;
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-r * 0.28, -r * 0.3, r * 0.42, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.font = `800 ${Math.round(r * 1.15)}px ${UI_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 6;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(10,14,30,0.9)';
      ctx.strokeText(String(item.value), 0, 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(String(item.value), 0, 2);
      break;
    }
    case 'shape': {
      tracePoly(ctx, item.poly);
      ctx.fillStyle = item.color;
      ctx.fill();
      ctx.strokeStyle = item.edge;
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-r * 0.25, -r * 0.28, r * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'x2': {
      ctx.fillStyle = '#7b2cbf';
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#e0aaff';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.font = `800 ${Math.round(r * 1.0)}px ${UI_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('×2', 0, 2);
      break;
    }
    default: {
      // Frucht, Bombe, goldene Frucht, Sternfrucht – als Emoji
      if (item.glow) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        const g = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.6);
        g.addColorStop(0, item.color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.font = `${Math.round(r * 2)}px ${EMOJI_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.emoji, 0, r * 0.06);
      break;
    }
  }
}

export function drawItem(ctx, item) {
  ctx.save();
  ctx.translate(item.x, item.y);
  ctx.rotate(item.angle);
  if (item.frozen > 0) {
    ctx.save();
    ctx.globalAlpha = 0.9;
    paintVisual(ctx, item);
    ctx.restore();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#ef476f';
    ctx.beginPath();
    ctx.arc(0, 0, item.r * 1.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  } else {
    paintVisual(ctx, item);
    if (item.flash > 0) {
      ctx.globalAlpha = Math.max(0, item.flash / 0.1) * 0.7;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, item.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}

export function drawPiece(ctx, piece) {
  const item = piece.visual;
  ctx.save();
  ctx.translate(piece.x, piece.y);
  ctx.rotate(piece.angle);
  ctx.globalAlpha = piece.life < 0.4 ? Math.max(0, piece.life / 0.4) : 1;
  tracePoly(ctx, piece.poly);
  ctx.save();
  ctx.clip();
  ctx.translate(-piece.off.x, -piece.off.y);
  paintVisual(ctx, item);
  ctx.restore();
  // helle "Fruchtfleisch"-Kante entlang der Schnittlinie
  ctx.strokeStyle = item.flesh || 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
  ctx.globalAlpha = 1;
}

export function drawParticles(ctx, pool) {
  pool.forEachActive((p) => {
    const a = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

export function drawSplats(ctx, splats) {
  for (const s of splats) {
    ctx.globalAlpha = Math.max(0, s.life / s.maxLife) * 0.28;
    ctx.fillStyle = s.color;
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, s.r, s.r * 0.72, s.rot, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** Klinge: Polylinie mit auslaufender Breite. */
export function drawTrail(ctx, trail, now, hitFlash) {
  if (trail.length < 2) return;
  const last = trail[trail.length - 1].t;
  const fade = Math.max(0, 1 - (now - last) / 160);
  if (fade <= 0) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1];
    const b = trail[i];
    const k = i / trail.length;
    ctx.globalAlpha = fade * (0.15 + 0.85 * k);
    ctx.strokeStyle = hitFlash > 0 ? '#ffffff' : 'rgba(255,255,255,0.92)';
    ctx.lineWidth = 2 + 12 * k;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.globalAlpha = fade * 0.28 * k;
    ctx.strokeStyle = '#9ad5ff';
    ctx.lineWidth = 6 + 18 * k;
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

/** Aufsteigende Punkte-/Combo-Texte. */
export function drawFloats(ctx, floats) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const f of floats) {
    const a = Math.max(0, f.life / f.maxLife);
    ctx.globalAlpha = a;
    ctx.font = `800 ${f.size}px ${UI_FONT}`;
    // Text am Rand hereinziehen, damit nichts abgeschnitten wird
    const half = ctx.measureText(f.text).width / 2 + 8;
    const x = Math.max(half, Math.min(W - half, f.x));
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(6,10,24,0.85)';
    ctx.strokeText(f.text, x, f.y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, x, f.y);
  }
  ctx.globalAlpha = 1;
}

/** Begruendung beim falschen Schnitt – unrotiert neben dem Item. */
export function drawReason(ctx, item) {
  if (!item.reason || item.frozen <= 0) return;
  const text = item.reason;
  ctx.font = `800 19px ${UI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + 24;
  let x = item.x;
  x = Math.max(w / 2 + 8, Math.min(W - w / 2 - 8, x));
  const y = Math.max(120, Math.min(H - 120, item.y - item.r - 28));
  ctx.globalAlpha = Math.min(1, item.frozen * 3);
  ctx.fillStyle = 'rgba(239,71,111,0.95)';
  const h = 34;
  const rr = 10;
  ctx.beginPath();
  ctx.moveTo(x - w / 2 + rr, y - h / 2);
  ctx.arcTo(x + w / 2, y - h / 2, x + w / 2, y + h / 2, rr);
  ctx.arcTo(x + w / 2, y + h / 2, x - w / 2, y + h / 2, rr);
  ctx.arcTo(x - w / 2, y + h / 2, x - w / 2, y - h / 2, rr);
  ctx.arcTo(x - w / 2, y - h / 2, x + w / 2, y - h / 2, rr);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, x, y + 1);
  ctx.globalAlpha = 1;
}

/** Gruenes Haekchen nach einem richtigen Schnitt. */
export function drawCheck(ctx, x, y, t) {
  ctx.save();
  ctx.globalAlpha = Math.max(0, t / 0.4);
  ctx.strokeStyle = '#2ec27e';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 12, y);
  ctx.lineTo(x - 3, y + 10);
  ctx.lineTo(x + 14, y - 12);
  ctx.stroke();
  ctx.restore();
}
