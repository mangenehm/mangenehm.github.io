/*
 * Gezeichneter Stadtplan: Orte als weiche, gemusterte Farbflächen,
 * Straßen als Bänder mit Namen, Wahrzeichen als Emoji.
 * Koordinaten des Bretts sind Einheiten (0 … board.size); `scale` = Pixel je Einheit.
 */

export const PALETTE = {
  ground: '#efe6d2',
  house:  '#f4c7aa',
  green:  '#cbe7a2',
  forest: '#93c784',
  plaza:  '#e7dcc4',
  water:  '#a3d8f2',
};

export const EDGE = {
  house: '#d99a78', green: '#93c46a', forest: '#5d9a52', plaza: '#c2b28f', water: '#68b6df',
};

const FONT = 'Outfit, system-ui, sans-serif';
const EMOJI_FONT = 'system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

/** Weicher Pfad durch die Ringe eines Orts (Kurven über die Kantenmitten), in Einheiten. */
export function regionPath(region) {
  const path = new Path2D();
  for (const pts of region.p) {
    const k = pts.length / 2;
    if (k < 3) continue;
    const mx = i => (pts[2 * (i % k)] + pts[2 * ((i + 1) % k)]) / 2;
    const my = i => (pts[2 * (i % k) + 1] + pts[2 * ((i + 1) % k) + 1]) / 2;
    path.moveTo(mx(k - 1), my(k - 1));
    for (let i = 0; i < k; i++) path.quadraticCurveTo(pts[2 * i], pts[2 * i + 1], mx(i), my(i));
    path.closePath();
  }
  return path;
}

export function regionPaths(board) { return board.regions.map(regionPath); }

const patternCache = new Map();

/** Kleine Kachel mit Deko je Gelände (Dächer, Bäume, Gras, Pflaster, Wellen). */
function terrainPattern(ctx, t, px) {
  const key = t + ':' + Math.round(px * 10);
  if (patternCache.has(key)) return ctx.createPattern(patternCache.get(key), 'repeat');
  const s = Math.max(8, Math.round(px));
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const col = EDGE[t];
  if (t === 'house') {
    for (const [x, y] of [[0.25, 0.3], [0.75, 0.8]]) {
      const w = s * 0.2;
      g.fillStyle = 'rgba(255,255,255,.55)';
      g.fillRect(s * x - w / 2, s * y - w * 0.2, w, w * 0.75);
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(s * x - w * 0.65, s * y - w * 0.15);
      g.lineTo(s * x, s * y - w * 0.75);
      g.lineTo(s * x + w * 0.65, s * y - w * 0.15);
      g.closePath();
      g.fill();
    }
  } else if (t === 'forest') {
    g.fillStyle = col;
    for (const [x, y, r] of [[0.25, 0.3, 0.13], [0.72, 0.22, 0.1], [0.6, 0.72, 0.14], [0.15, 0.82, 0.08]]) {
      g.beginPath(); g.arc(s * x, s * y, s * r, 0, Math.PI * 2); g.fill();
    }
  } else if (t === 'green') {
    g.strokeStyle = col;
    g.lineWidth = Math.max(1, s * 0.05);
    for (const [x, y] of [[0.25, 0.35], [0.7, 0.75], [0.8, 0.25]]) {
      g.beginPath();
      g.moveTo(s * (x - 0.06), s * (y - 0.08)); g.lineTo(s * x, s * y); g.lineTo(s * (x + 0.06), s * (y - 0.08));
      g.stroke();
    }
  } else if (t === 'plaza') {
    g.fillStyle = col;
    for (const [x, y] of [[0.25, 0.25], [0.75, 0.25], [0.5, 0.75], [0, 0.75], [1, 0.75]]) {
      g.beginPath(); g.arc(s * x, s * y, s * 0.05, 0, Math.PI * 2); g.fill();
    }
  } else if (t === 'water') {
    g.strokeStyle = 'rgba(255,255,255,.75)';
    g.lineWidth = Math.max(1, s * 0.05);
    for (const [x, y] of [[0.15, 0.3], [0.55, 0.78]]) {
      g.beginPath();
      g.moveTo(s * x, s * y);
      g.quadraticCurveTo(s * (x + 0.08), s * (y - 0.08), s * (x + 0.16), s * y);
      g.quadraticCurveTo(s * (x + 0.24), s * (y + 0.08), s * (x + 0.32), s * y);
      g.stroke();
    }
  }
  patternCache.set(key, c);
  return ctx.createPattern(c, 'repeat');
}

function tracePolyline(ctx, pts, scale) {
  ctx.moveTo(pts[0] * scale, pts[1] * scale);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i] * scale, pts[i + 1] * scale);
}

function strokeLines(ctx, lines, scale, style) {
  ctx.beginPath();
  for (const l of lines) for (const pts of l.p) tracePolyline(ctx, pts, scale);
  Object.assign(ctx, style);
  ctx.stroke();
}

/**
 * Zeichnet das Brett in ein Quadrat der Kantenlänge board.size·scale ab (0, 0).
 * opts.numbers: Ortsnummern zeigen, opts.paths: vorberechnete regionPaths
 */
export function drawMap(ctx, board, scale, { numbers = true, paths = regionPaths(board) } = {}) {
  const W = board.size * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, W);
  ctx.clip();
  ctx.fillStyle = PALETTE.ground;
  ctx.fillRect(0, 0, W, W);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Orte: Grundfarbe + Muster
  const tile = 16 * scale * (board.size / 256);
  board.regions.forEach((r, i) => {
    ctx.save();
    ctx.scale(scale, scale);
    ctx.fillStyle = PALETTE[r.t];
    ctx.fill(paths[i]);
    const pat = terrainPattern(ctx, r.t, tile);
    if (pat) {
      pat.setTransform?.(new DOMMatrix().scale(1 / scale));
      ctx.fillStyle = pat;
      ctx.fill(paths[i]);
    }
    ctx.restore();
  });

  const lines = board.lines || [];
  const by = k => lines.filter(l => l.k === k);
  // Fugen zwischen den Orten: dort verlaufen (gezeichnet oder gedacht) die Straßen
  ctx.save();
  ctx.scale(scale, scale);
  // dunklere Innenkante, damit jeder Ort als eigene Fläche erkennbar ist
  board.regions.forEach((r, i) => {
    ctx.save();
    ctx.clip(paths[i]);
    ctx.strokeStyle = EDGE[r.t];
    ctx.lineWidth = 7 / scale;
    ctx.stroke(paths[i]);
    ctx.restore();
  });
  ctx.strokeStyle = PALETTE.ground;
  ctx.lineWidth = Math.max(3.5, scale * 1.2) / scale;
  paths.forEach(p => ctx.stroke(p));
  ctx.restore();

  for (const l of by('water')) strokeLines(ctx, [l], scale, { strokeStyle: '#7cc3ea', lineWidth: Math.max(1.5, l.w * scale) });

  for (const l of by('path')) {
    ctx.save();
    ctx.setLineDash([scale * 1.5, scale * 1.2]);
    strokeLines(ctx, [l], scale, { strokeStyle: 'rgba(150, 125, 85, .55)', lineWidth: Math.max(1, l.w * scale * 0.6) });
    ctx.restore();
  }
  for (const l of by('rail')) {
    strokeLines(ctx, [l], scale, { strokeStyle: '#8f939c', lineWidth: Math.max(2, 1.6 * scale) });
    ctx.save();
    ctx.setLineDash([scale * 1.6, scale * 1.6]);
    strokeLines(ctx, [l], scale, { strokeStyle: '#fff', lineWidth: Math.max(1, 0.7 * scale) });
    ctx.restore();
  }
  const roads = by('road');
  // erst alle Ränder, dann alle Flächen – so verschmelzen Kreuzungen weich
  for (const l of roads) strokeLines(ctx, [l], scale, { strokeStyle: '#cdbb98', lineWidth: Math.max(2.5, l.w * scale) + Math.max(1.5, scale * 0.6) });
  for (const l of roads) strokeLines(ctx, [l], scale, { strokeStyle: '#fffdf8', lineWidth: Math.max(2, l.w * scale) });

  drawStreetNames(ctx, roads, scale);
  drawPois(ctx, board.pois || [], scale, board.size);
  if (numbers) drawNumbers(ctx, board, scale);
  ctx.restore();
}

function polylineLength(pts) {
  let len = 0;
  for (let i = 2; i < pts.length; i += 2) len += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
  return len;
}

/** Ein Name je Straße, mittig auf ihrem längsten Stück, immer lesbar ausgerichtet. */
function drawStreetNames(ctx, roads, scale) {
  const longest = new Map();
  for (const l of roads) {
    if (!l.n) continue;
    for (const pts of l.p) {
      const len = polylineLength(pts);
      if (!longest.has(l.n) || len > longest.get(l.n).len) longest.set(l.n, { pts, len });
    }
  }
  const size = Math.max(9, Math.min(13, scale * 3.6));
  ctx.save();
  ctx.font = `600 ${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (const [name, { pts, len }] of longest) {
    const w = ctx.measureText(name).width;
    if (len * scale < w + 16) continue;
    // Punkt auf halber Länge und Richtung dort
    let half = len / 2, i = 2;
    for (; i < pts.length; i += 2) {
      const seg = Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
      if (half <= seg) break;
      half -= seg;
    }
    i = Math.min(i, pts.length - 2);
    const x0 = pts[i - 2], y0 = pts[i - 1], x1 = pts[i], y1 = pts[i + 1];
    const seg = Math.hypot(x1 - x0, y1 - y0) || 1;
    const x = (x0 + ((x1 - x0) * half) / seg) * scale, y = (y0 + ((y1 - y0) * half) / seg) * scale;
    let a = Math.atan2(y1 - y0, x1 - x0);
    if (a > Math.PI / 2) a -= Math.PI;
    if (a < -Math.PI / 2) a += Math.PI;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.strokeStyle = 'rgba(255,253,248,.95)';
    ctx.lineWidth = 3;
    ctx.strokeText(name, 0, 0);
    ctx.fillStyle = '#6d5a3f';
    ctx.fillText(name, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

function drawPois(ctx, pois, scale, size) {
  const r = Math.max(7, scale * (size / 256) * 4.2);
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${r * 1.25}px ${EMOJI_FONT}`;
  for (const p of pois) {
    const x = p.x * scale, y = p.y * scale;
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.shadowColor = 'rgba(60,40,20,.25)';
    ctx.shadowBlur = 3;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = '#000';
    ctx.fillText(p.e, x, y + r * 0.08);
  }
  ctx.restore();
}

function drawNumbers(ctx, board, scale) {
  const fs = Math.max(8, Math.min(12, scale * (board.size / 256) * 3.4));
  ctx.save();
  ctx.font = `700 ${fs}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  board.regions.forEach((r, i) => {
    const x = r.c[0] * scale, y = r.c[1] * scale;
    const t = String(i + 1);
    const w = Math.max(fs * 1.5, ctx.measureText(t).width + fs * 0.7);
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x - w / 2, y - fs * 0.7, w, fs * 1.4, fs * 0.7);
    else ctx.rect(x - w / 2, y - fs * 0.7, w, fs * 1.4);
    ctx.fill();
    ctx.fillStyle = '#5f5242';
    ctx.fillText(t, x, y + fs * 0.05);
  });
  ctx.restore();
}
