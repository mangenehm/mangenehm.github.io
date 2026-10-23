/* Karte in Spielfarben auf Canvas zeichnen – eigene Darstellung statt Kartenkacheln. */

import { traceFeature, sortedFeatures } from './classify.js';
import { colLabel } from '../engine/board.js';

export const PALETTE = {
  other:    '#efe6d1',
  green:    '#bfe095',
  forest:   '#6fae66',
  forestEdge: '#4f8f4a',
  water:    '#7fcaee',
  waterEdge: '#5ab2dd',
  road:     '#ffffff',
  roadEdge: '#b9a37a',
  building: '#eba585',
  buildingEdge: '#c47b5a',
};

// Geländeklassen als kräftige Farbflächen (Schalter „Gelände zeigen“)
export const OVERLAY = {
  water: '#2f8fd8', building: '#d9653b', forest: '#2e7d32',
  green: '#8bc34a', road: '#8d8d8d', other: '#cbbb94',
};

/** Zeichnet die Karte des Bretts in das Rechteck (ox, oy, size·cell). */
export function drawMap(ctx, board, cell, ox = 0, oy = 0) {
  const n = board.size, w = n * cell;
  ctx.save();
  ctx.beginPath();
  ctx.rect(ox, oy, w, w);
  ctx.clip();
  ctx.fillStyle = PALETTE.other;
  ctx.fillRect(ox, oy, w, w);
  if (Array.isArray(board.features) && board.features.length) drawFeatures(ctx, board.features, cell, ox, oy);
  else drawTerrainCells(ctx, board, cell, ox, oy);
  ctx.restore();
}

function drawFeatures(ctx, features, cell, ox, oy) {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const sorted = sortedFeatures(features);
  const roads = sorted.filter(f => f.c === 'road' && f.k === 'l');

  for (const f of sorted) {
    if (f.c === 'road' && f.k === 'l') continue;
    if (f.c === 'building') continue;
    traceFeature(ctx, f, cell, ox, oy);
    if (f.k === 'a') {
      ctx.fillStyle = PALETTE[f.c];
      ctx.fill('evenodd');
      if (f.c === 'forest' || f.c === 'water') {
        ctx.strokeStyle = f.c === 'forest' ? PALETTE.forestEdge : PALETTE.waterEdge;
        ctx.lineWidth = Math.max(1, cell * 0.04);
        ctx.stroke();
      }
    } else {
      ctx.strokeStyle = PALETTE[f.c];
      ctx.lineWidth = Math.max(2, f.w * cell);
      ctx.stroke();
    }
  }

  // Straßen: erst alle Ränder, dann alle Flächen – so verschmelzen Kreuzungen weich
  for (const pass of ['edge', 'fill']) {
    for (const f of roads) {
      traceFeature(ctx, f, cell, ox, oy);
      const wpx = Math.max(3, f.w * cell);
      ctx.strokeStyle = pass === 'edge' ? PALETTE.roadEdge : PALETTE.road;
      ctx.lineWidth = pass === 'edge' ? wpx + Math.max(2, cell * 0.06) : wpx;
      ctx.stroke();
    }
  }
  for (const f of features) {
    if (f.c !== 'road' || f.k !== 'a') continue;
    traceFeature(ctx, f, cell, ox, oy);
    ctx.fillStyle = PALETTE.road;
    ctx.fill('evenodd');
  }

  // Gebäude mit weichem Schatten
  ctx.save();
  ctx.shadowColor = 'rgba(80, 40, 20, .25)';
  ctx.shadowOffsetX = ctx.shadowOffsetY = Math.max(1, cell * 0.05);
  ctx.shadowBlur = cell * 0.08;
  ctx.fillStyle = PALETTE.building;
  for (const f of features) {
    if (f.c !== 'building') continue;
    traceFeature(ctx, f, cell, ox, oy);
    ctx.fill('evenodd');
  }
  ctx.restore();
  ctx.strokeStyle = PALETTE.buildingEdge;
  ctx.lineWidth = Math.max(1, cell * 0.03);
  for (const f of features) {
    if (f.c !== 'building') continue;
    traceFeature(ctx, f, cell, ox, oy);
    ctx.stroke();
  }
}

/** Zufallsgelände ohne Geometrie: Zellen mit kleinen Symbolen. */
function drawTerrainCells(ctx, board, cell, ox, oy) {
  const n = board.size;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const t = board.terrain[y * n + x];
      const px = ox + x * cell, py = oy + y * cell;
      if (t === 'other') continue;
      ctx.fillStyle = t === 'road' ? PALETTE.roadEdge : PALETTE[t];
      roundRect(ctx, px - 0.5, py - 0.5, cell + 1, cell + 1, 0);
      ctx.fill();
      decorate(ctx, t, px, py, cell, (x * 7 + y * 13) % 5);
    }
  }
}

function decorate(ctx, t, px, py, c, v) {
  ctx.save();
  if (t === 'forest') {
    ctx.fillStyle = PALETTE.forestEdge;
    for (const [dx, dy] of [[0.3, 0.35], [0.7, 0.3], [0.5, 0.7]]) {
      ctx.beginPath();
      ctx.arc(px + c * (dx + v * 0.02), py + c * dy, c * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (t === 'water') {
    ctx.strokeStyle = 'rgba(255,255,255,.6)';
    ctx.lineWidth = Math.max(1, c * 0.05);
    for (const dy of [0.38, 0.66]) {
      ctx.beginPath();
      ctx.moveTo(px + c * 0.2, py + c * dy);
      ctx.quadraticCurveTo(px + c * 0.35, py + c * (dy - 0.08), px + c * 0.5, py + c * dy);
      ctx.quadraticCurveTo(px + c * 0.65, py + c * (dy + 0.08), px + c * 0.8, py + c * dy);
      ctx.stroke();
    }
  } else if (t === 'building') {
    ctx.fillStyle = PALETTE.buildingEdge;
    roundRect(ctx, px + c * 0.18, py + c * 0.18, c * 0.64, c * 0.64, c * 0.08);
    ctx.fill();
    ctx.fillStyle = PALETTE.building;
    roundRect(ctx, px + c * 0.22, py + c * 0.22, c * 0.56, c * 0.56, c * 0.06);
    ctx.fill();
  } else if (t === 'road') {
    ctx.fillStyle = PALETTE.road;
    ctx.fillRect(px, py + c * 0.3, c, c * 0.4);
    ctx.fillRect(px + c * 0.3, py, c * 0.4, c);
  } else if (t === 'green') {
    ctx.strokeStyle = 'rgba(70,120,40,.45)';
    ctx.lineWidth = Math.max(1, c * 0.04);
    for (const [dx, dy] of [[0.3, 0.4], [0.65, 0.65]]) {
      ctx.beginPath();
      ctx.moveTo(px + c * dx, py + c * (dy + 0.1));
      ctx.lineTo(px + c * (dx - 0.05), py + c * dy);
      ctx.moveTo(px + c * dx, py + c * (dy + 0.1));
      ctx.lineTo(px + c * (dx + 0.05), py + c * dy);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Geländeklassen als halbtransparente Farbflächen. */
export function drawTerrainOverlay(ctx, board, cell, ox = 0, oy = 0, alpha = 0.55) {
  const n = board.size;
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      ctx.fillStyle = OVERLAY[board.terrain[y * n + x]];
      ctx.fillRect(ox + x * cell, oy + y * cell, cell, cell);
    }
  }
  ctx.restore();
}

/** Rasterlinien plus Koordinaten (A–L oben, 1–12 links) im Rand. */
export function drawGrid(ctx, size, cell, ox, oy, { labels = true, color = 'rgba(40, 50, 40, .28)' } = {}) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= size; i++) {
    const v = Math.round(i * cell) + 0.5;
    ctx.moveTo(ox + v, oy); ctx.lineTo(ox + v, oy + size * cell);
    ctx.moveTo(ox, oy + v); ctx.lineTo(ox + size * cell, oy + v);
  }
  ctx.stroke();
  if (labels) {
    ctx.fillStyle = '#5f6f7f';
    ctx.font = `600 ${Math.max(9, Math.round(cell * 0.36))}px Outfit, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < size; i++) {
      ctx.fillText(colLabel(i), ox + (i + 0.5) * cell, oy - cell * 0.32);
      ctx.fillText(String(i + 1), ox - cell * 0.36, oy + (i + 0.5) * cell);
    }
  }
  ctx.restore();
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
