/*
 * Pixel-Raster → Orte (Häuserblöcke, Parks, Wälder, Teiche, Plätze).
 *
 *  1. Zusammenhängende Flächen zwischen den Trennlinien finden, getrennt nach
 *     Zone (bebaut, grün, Wasser, Platz).
 *  2. Trennlinien-Pixel dem nächsten Ort zuschlagen → lückenlose Aufteilung;
 *     Orte, die sich danach berühren, sind Nachbarn (auch über die Straße).
 *  3. Winzige Orte mit dem passendsten Nachbarn verschmelzen, riesige teilen.
 *  4. Gelände, Beschriftungspunkt, Umriss und Name je Ort bestimmen.
 *
 * Alles sind reine Funktionen auf Arrays – testbar ohne Browser und
 * deterministisch, damit beide Spieler dasselbe Brett sehen.
 */

import { CLASS } from './classify.js';
import { simplify } from './overpass.js';

const ZONE_OF_CLASS = [0, 0, 1, 2, 2, 3];   // other, building → bebaut; water; forest, green → grün; plaza
const MIN_SHARE = 0.22;     // kleiner als 22 % der Zielgröße → verschmelzen
const MAX_SHARE = 1.6;      // größer als 160 % → teilen
const MIN_CONTACT = 3;      // so viele Pixel gemeinsame Grenze machen zwei Orte zu Nachbarn

// ---------- Grundbausteine ----------

/** 4er-Zusammenhangskomponenten gleicher Schlüssel; key < 0 bleibt -1. */
export function components(key, n) {
  const labels = new Int32Array(n * n).fill(-1);
  const stack = [];
  let count = 0;
  for (let i = 0; i < n * n; i++) {
    if (labels[i] !== -1 || key[i] < 0) continue;
    const k = key[i];
    labels[i] = count;
    stack.push(i);
    while (stack.length) {
      const p = stack.pop();
      const x = p % n, y = (p - x) / n;
      if (x > 0 && labels[p - 1] === -1 && key[p - 1] === k) { labels[p - 1] = count; stack.push(p - 1); }
      if (x < n - 1 && labels[p + 1] === -1 && key[p + 1] === k) { labels[p + 1] = count; stack.push(p + 1); }
      if (y > 0 && labels[p - n] === -1 && key[p - n] === k) { labels[p - n] = count; stack.push(p - n); }
      if (y < n - 1 && labels[p + n] === -1 && key[p + n] === k) { labels[p + n] = count; stack.push(p + n); }
    }
    count++;
  }
  return { labels, count };
}

/** Unbelegte Pixel (-1) per Breitensuche dem nächsten Label zuschlagen. */
export function fillGaps(labels, n) {
  let queue = [];
  for (let i = 0; i < n * n; i++) if (labels[i] >= 0) queue.push(i);
  if (!queue.length) { labels.fill(0); return labels; }
  while (queue.length) {
    const next = [];
    for (const p of queue) {
      const x = p % n, y = (p - x) / n, l = labels[p];
      if (x > 0 && labels[p - 1] < 0) { labels[p - 1] = l; next.push(p - 1); }
      if (x < n - 1 && labels[p + 1] < 0) { labels[p + 1] = l; next.push(p + 1); }
      if (y > 0 && labels[p - n] < 0) { labels[p - n] = l; next.push(p - n); }
      if (y < n - 1 && labels[p + n] < 0) { labels[p + n] = l; next.push(p + n); }
    }
    queue = next;
  }
  return labels;
}

/** Labels lückenlos auf 0 … count-1 durchnummerieren (Reihenfolge des ersten Auftretens). */
export function compact(labels) {
  const map = new Map();
  for (let i = 0; i < labels.length; i++) {
    let m = map.get(labels[i]);
    if (m === undefined) { m = map.size; map.set(labels[i], m); }
    labels[i] = m;
  }
  return map.size;
}

/** Gemeinsame Grenzpixel je Labelpaar; direkte Berührung (beide orig) zählt zehnfach. */
function contacts(labels, n, count, orig) {
  const nb = Array.from({ length: count }, () => new Map());
  const add = (a, b, w) => {
    nb[a].set(b, (nb[a].get(b) || 0) + w);
    nb[b].set(a, (nb[b].get(a) || 0) + w);
  };
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x, a = labels[i];
      if (x < n - 1 && labels[i + 1] !== a) add(a, labels[i + 1], orig && orig[i] && orig[i + 1] ? 10 : 1);
      if (y < n - 1 && labels[i + n] !== a) add(a, labels[i + n], orig && orig[i] && orig[i + n] ? 10 : 1);
    }
  }
  return nb;
}

function areas(labels, count) {
  const a = new Array(count).fill(0);
  for (const l of labels) a[l]++;
  return a;
}

/**
 * Orte unter minArea mit dem Nachbarn verschmelzen, mit dem sie die längste
 * direkte Grenze teilen (gleiche Zone zählt dreifach). Sind danach noch mehr
 * als maxCount Orte übrig, wird weiter der jeweils kleinste verschmolzen –
 * bevorzugt mit einem kleinen Nachbarn, damit die Größen ausgeglichen bleiben.
 * Ändert labels, liefert count.
 */
export function mergeSmall(labels, n, count, minArea, { orig = null, zone = null, maxCount = Infinity } = {}) {
  const area = areas(labels, count);
  const nb = contacts(labels, n, count, orig);
  const parent = Array.from({ length: count }, (_, i) => i);
  const alive = new Set(parent);
  for (;;) {
    const tooMany = alive.size > maxCount;
    let small = -1;
    for (const r of alive) {
      if ((tooMany || area[r] < minArea) && nb[r].size && (small < 0 || area[r] < area[small] || (area[r] === area[small] && r < small))) small = r;
    }
    if (small < 0) break;
    const balance = tooMany && area[small] >= minArea;
    let best = -1, bestScore = -1;
    for (const [k, w] of nb[small]) {
      const score = w * (zone && zone[k] === zone[small] ? 3 : 1) / (balance ? area[k] : 1);
      if (score > bestScore || (score === bestScore && k < best)) { best = k; bestScore = score; }
    }
    // small → best
    for (const [k, w] of nb[small]) {
      nb[k].delete(small);
      if (k === best) continue;
      nb[k].set(best, (nb[k].get(best) || 0) + w);
      nb[best].set(k, (nb[best].get(k) || 0) + w);
    }
    nb[small].clear();
    area[best] += area[small];
    parent[small] = best;
    alive.delete(small);
  }
  const root = r => { while (parent[r] !== r) r = parent[r]; return r; };
  for (let i = 0; i < labels.length; i++) labels[i] = root(labels[i]);
  return compact(labels);
}

/** Zu große Orte per k-means in etwa gleich große Teile zerlegen. */
export function splitLarge(labels, n, count, maxArea, target) {
  const pix = Array.from({ length: count }, () => []);
  for (let i = 0; i < labels.length; i++) pix[labels[i]].push(i);
  let next = count;
  for (let r = 0; r < count; r++) {
    const ps = pix[r];
    if (ps.length <= maxArea) continue;
    const k = Math.max(2, Math.round(ps.length / target));
    const xs = ps.map(p => p % n), ys = ps.map(p => Math.floor(p / n));
    // Startpunkte: am weitesten voneinander entfernte Pixel (deterministisch)
    const mx = xs.reduce((a, b) => a + b, 0) / ps.length, my = ys.reduce((a, b) => a + b, 0) / ps.length;
    let first = 0, bd = Infinity;
    for (let i = 0; i < ps.length; i++) { const d = (xs[i] - mx) ** 2 + (ys[i] - my) ** 2; if (d < bd) { bd = d; first = i; } }
    const seeds = [[xs[first], ys[first]]];
    const minD = ps.map((_, i) => (xs[i] - seeds[0][0]) ** 2 + (ys[i] - seeds[0][1]) ** 2);
    while (seeds.length < k) {
      let far = 0;
      for (let i = 1; i < ps.length; i++) if (minD[i] > minD[far]) far = i;
      seeds.push([xs[far], ys[far]]);
      for (let i = 0; i < ps.length; i++) minD[i] = Math.min(minD[i], (xs[i] - xs[far]) ** 2 + (ys[i] - ys[far]) ** 2);
    }
    const assign = new Int32Array(ps.length);
    for (let iter = 0; iter < 8; iter++) {
      for (let i = 0; i < ps.length; i++) {
        let best = 0, bdist = Infinity;
        for (let s = 0; s < k; s++) {
          const d = (xs[i] - seeds[s][0]) ** 2 + (ys[i] - seeds[s][1]) ** 2;
          if (d < bdist) { bdist = d; best = s; }
        }
        assign[i] = best;
      }
      const sum = seeds.map(() => [0, 0, 0]);
      for (let i = 0; i < ps.length; i++) { const s = sum[assign[i]]; s[0] += xs[i]; s[1] += ys[i]; s[2]++; }
      sum.forEach((s, j) => { if (s[2]) seeds[j] = [s[0] / s[2], s[1] / s[2]]; });
    }
    const ids = seeds.map((_, s) => (s === 0 ? r : next++));
    for (let i = 0; i < ps.length; i++) labels[ps[i]] = ids[assign[i]];
  }
  return next;
}

// ---------- Aufteilung ----------

/**
 * Aufteilung in Orte.
 * @param {object} o
 * @param {Uint8Array} o.cls      Klasse je Pixel (siehe CLASSES)
 * @param {Uint8Array} o.barrier  1 = Trennlinie
 * @param {number} o.n            Rasterbreite
 * @param {number} o.targetCount  gewünschte Anzahl Orte
 * @returns {{ labels: Int32Array, count: number, orig: Uint8Array }}
 */
export function segment({ cls, barrier, n, targetCount }) {
  const key = new Int16Array(n * n);
  const orig = new Uint8Array(n * n);
  for (let i = 0; i < n * n; i++) {
    orig[i] = barrier[i] ? 0 : 1;
    key[i] = barrier[i] ? -1 : ZONE_OF_CLASS[cls[i]];
  }
  const target = (n * n) / targetCount;
  let { labels, count } = components(key, n);
  if (!count) { labels.fill(0); count = 1; }
  const zone = new Array(count).fill(0);
  for (let i = 0; i < n * n; i++) if (labels[i] >= 0) zone[labels[i]] = key[i];
  fillGaps(labels, n);
  count = mergeSmall(labels, n, count, target * MIN_SHARE, { orig, zone });
  count = splitLarge(labels, n, count, target * MAX_SHARE, target);
  // Teile des k-means können zerfallen → neu zusammenhängend nummerieren und Krümel einsammeln
  ({ labels, count } = components(labels, n));
  count = mergeSmall(labels, n, count, target * MIN_SHARE * 0.6, { orig, maxCount: Math.round(targetCount * 1.15) });
  return { labels, count, orig };
}


// ---------- Beschreibung je Ort ----------

/** Gelände aus den Pixelanteilen eines Orts. counts: Anzahl je Klasse (Index wie CLASSES). */
export function decideTerrain(counts) {
  const tot = counts.reduce((a, b) => a + b, 0) || 1;
  const s = c => counts[CLASS[c]] / tot;
  const leafy = s('forest') + s('green');
  if (s('water') > 0.5) return 'water';
  if (s('forest') >= 0.4 || (leafy >= 0.5 && s('forest') > s('green'))) return 'forest';
  if (s('green') >= 0.4 || leafy >= 0.5) return 'green';
  if (s('plaza') >= 0.35) return 'plaza';
  if (s('building') >= 0.12) return 'house';
  if (leafy >= 0.3) return s('forest') > s('green') ? 'forest' : 'green';
  if (s('building') < 0.04 && s('plaza') < 0.1) return 'green';
  return 'plaza';
}

/** Abstand jedes Pixels zum Rand seines Orts (Breitensuche, 4er-Nachbarschaft). */
function edgeDistance(labels, n) {
  const dist = new Int32Array(n * n).fill(-1);
  let queue = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x, l = labels[i];
    if (x === 0 || y === 0 || x === n - 1 || y === n - 1 || labels[i - 1] !== l || labels[i + 1] !== l || labels[i - n] !== l || labels[i + n] !== l) {
      dist[i] = 0; queue.push(i);
    }
  }
  for (let d = 1; queue.length; d++) {
    const next = [];
    for (const p of queue) {
      const l = labels[p];
      for (const q of [p - 1, p + 1, p - n, p + n]) {
        if (q < 0 || q >= n * n || dist[q] >= 0 || labels[q] !== l) continue;
        if ((q === p - 1 || q === p + 1) && Math.floor(q / n) !== Math.floor(p / n)) continue;
        dist[q] = d; next.push(q);
      }
    }
    queue = next;
  }
  return dist;
}

/** Nachbarschaft: mindestens MIN_CONTACT Pixel gemeinsame Grenze. */
export function adjacency(labels, n, count) {
  const nb = contacts(labels, n, count, null);
  return nb.map((m, i) => [...m].filter(([k, w]) => w >= MIN_CONTACT && k !== i).map(([k]) => k).sort((a, b) => a - b));
}

/**
 * Umrisse je Label als Ringe entlang der Pixelkanten (im Uhrzeigersinn),
 * danach vereinfacht. Liefert [[ [x0, y0, x1, y1, …], … ], …]
 */
export function outlines(labels, n, count, tol = 0.9) {
  const W = n + 1;
  const edges = Array.from({ length: count }, () => new Map());
  const add = (l, a, b) => {
    const m = edges[l];
    const list = m.get(a);
    if (list) list.push(b); else m.set(a, [b]);
  };
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x, l = labels[i];
      if (y === 0 || labels[i - n] !== l) add(l, y * W + x, y * W + x + 1);
      if (x === n - 1 || labels[i + 1] !== l) add(l, y * W + x + 1, (y + 1) * W + x + 1);
      if (y === n - 1 || labels[i + n] !== l) add(l, (y + 1) * W + x + 1, (y + 1) * W + x);
      if (x === 0 || labels[i - 1] !== l) add(l, (y + 1) * W + x, y * W + x);
    }
  }
  return edges.map(m => {
    const rings = [];
    while (m.size) {
      const start = m.keys().next().value;
      const ring = [start];
      let cur = start;
      for (let guard = 0; guard < 4 * W * W; guard++) {
        const list = m.get(cur);
        const nxt = list.pop();
        if (!list.length) m.delete(cur);
        if (nxt === start) break;
        ring.push(nxt);
        cur = nxt;
        if (!m.has(cur)) break;
      }
      const flat = [];
      for (const v of ring) flat.push(v % W, Math.floor(v / W));
      const pts = dropCollinear(flat);
      if (pts.length < 6) continue;
      const closed = simplify([...pts, pts[0], pts[1]], tol);
      closed.length -= 2;
      if (closed.length >= 6 && Math.abs(ringArea(closed)) >= 3) rings.push(closed);
    }
    return rings;
  });
}

function dropCollinear(flat) {
  const n = flat.length / 2, out = [];
  for (let i = 0; i < n; i++) {
    const a = (i + n - 1) % n, c = (i + 1) % n;
    const cross = (flat[2 * i] - flat[2 * a]) * (flat[2 * c + 1] - flat[2 * i + 1]) - (flat[2 * i + 1] - flat[2 * a + 1]) * (flat[2 * c] - flat[2 * i]);
    if (cross !== 0) out.push(flat[2 * i], flat[2 * i + 1]);
  }
  return out;
}

export function ringArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i += 2) {
    const j = (i + 2) % pts.length;
    s += pts[i] * pts[j + 1] - pts[j] * pts[i + 1];
  }
  return s / 2;
}

/**
 * Alles je Ort: Gelände, Beschriftungspunkt, Nachbarn, Umriss.
 * Die Orte werden zeilenweise von oben links nummeriert.
 */
export function describe({ labels, count, n, cls, orig }) {
  const counts = Array.from({ length: count }, () => new Array(6).fill(0));
  const all = Array.from({ length: count }, () => new Array(6).fill(0));
  for (let i = 0; i < n * n; i++) {
    all[labels[i]][cls[i]]++;
    if (!orig || orig[i]) counts[labels[i]][cls[i]]++;
  }
  const dist = edgeDistance(labels, n);
  const best = new Array(count).fill(-1);
  for (let i = 0; i < n * n; i++) {
    const l = labels[i];
    if (best[l] < 0 || dist[i] > dist[best[l]]) best[l] = i;
  }
  const centers = best.map(i => [i % n + 0.5, Math.floor(i / n) + 0.5]);

  // Nummerierung: Bänder von oben nach unten, darin von links nach rechts
  const band = n / 7;
  const order = [...Array(count).keys()].sort((a, b) =>
    Math.floor(centers[a][1] / band) - Math.floor(centers[b][1] / band) || centers[a][0] - centers[b][0] || a - b);
  const newId = new Array(count);
  order.forEach((old, i) => { newId[old] = i; });
  for (let i = 0; i < labels.length; i++) labels[i] = newId[labels[i]];

  const adj = adjacency(labels, n, count);
  const rings = outlines(labels, n, count);
  const regions = order.map((old, i) => ({
    t: decideTerrain(counts[old].some(Boolean) ? counts[old] : all[old]),
    n: '',
    c: centers[old],
    p: rings[i],
    area: all[old].reduce((a, b) => a + b, 0),
  }));
  return { regions, adj };
}

// ---------- Namen ----------

const TERRAIN_WORD = { house: 'Häuser', green: 'Wiese', forest: 'Wald', plaza: 'Platz', water: 'Wasser' };

/** „an der Lindenstraße“, „am Mühlweg“ … */
export function along(street) {
  if (/(straße|strasse|str\.|allee|gasse|chaussee|promenade|zeile|aue|brücke|bahn|achse|steige)$/i.test(street)) return 'an der ' + street;
  if (/(weg|ring|platz|damm|steig|pfad|markt|graben|berg|hof|wall|ufer|kamp|park|anger|rain|steg|stieg|deich|grund|winkel|bogen|garten|feld|hang|rand|kai)$/i.test(street)) return 'am ' + street;
  return 'an ' + street;
}

function sampleLine(pts, step, fn) {
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const x0 = pts[i], y0 = pts[i + 1], x1 = pts[i + 2], y1 = pts[i + 3];
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (!len) continue;
    const nx = -(y1 - y0) / len, ny = (x1 - x0) / len;
    for (let d = step / 2; d < len; d += step) fn(x0 + ((x1 - x0) * d) / len, y0 + ((y1 - y0) * d) / len, nx, ny);
  }
}

/**
 * Namen vergeben: benannte Fläche (Park, Schule, See) > wichtiges Wahrzeichen >
 * „Häuser an der <Straße>“ > Geländewort.
 */
export function nameRegions(regions, labels, n, features = [], pois = []) {
  const at = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    return xi >= 0 && yi >= 0 && xi < n && yi < n ? labels[yi * n + xi] : -1;
  };
  const areaName = new Array(regions.length).fill(null);
  for (const f of features) {
    if (f.k !== 'a' || !f.n || f.c === 'building') continue;
    let a = 0, cx = 0, cy = 0;
    for (const pts of f.p) {
      const ra = ringArea(pts);
      let sx = 0, sy = 0;
      for (let i = 0; i < pts.length; i += 2) { sx += pts[i]; sy += pts[i + 1]; }
      const k = pts.length / 2;
      cx += (sx / k) * Math.abs(ra); cy += (sy / k) * Math.abs(ra); a += Math.abs(ra);
    }
    if (!a) continue;
    const r = at(cx / a, cy / a);
    if (r < 0 || a < regions[r].area * 0.3) continue;
    if (!areaName[r] || a > areaName[r].a) areaName[r] = { name: f.n, a };
  }
  const poiName = new Array(regions.length).fill(null);
  for (const p of pois) {
    if (!p.n || !p.names) continue;
    const r = at(p.x, p.y);
    if (r >= 0 && (!poiName[r] || p.rank < poiName[r].rank)) poiName[r] = { name: p.n, rank: p.rank };
  }
  const votes = regions.map(() => new Map());
  for (const f of features) {
    if (f.k !== 'l' || !f.n || (f.c !== 'road' && f.c !== 'path')) continue;
    for (const pts of f.p) {
      sampleLine(pts, 2, (x, y, nx, ny) => {
        const off = f.w / 2 + 2.5;
        for (const s of [1, -1]) {
          const r = at(x + nx * off * s, y + ny * off * s);
          if (r >= 0) votes[r].set(f.n, (votes[r].get(f.n) || 0) + (f.c === 'road' ? 2 : 1));
        }
      });
    }
  }
  regions.forEach((reg, i) => {
    const street = [...votes[i]].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
    reg.n = (areaName[i]?.name || poiName[i]?.name
      || (street && street[1] >= 4 ? `${TERRAIN_WORD[reg.t]} ${along(street[0])}` : TERRAIN_WORD[reg.t])).slice(0, 80);
  });
  return regions;
}

// ---------- Brett zusammensetzen ----------

const r1 = v => Math.round(v * 10) / 10;

/** Wahrzeichen ausdünnen: wichtige zuerst, Mindestabstand, höchstens max. */
export function pickPois(pois, minDist = 14, max = 24) {
  const kept = [];
  for (const p of [...pois].sort((a, b) => a.rank - b.rank || a.y - b.y || a.x - b.x)) {
    if (kept.length >= max) break;
    if (kept.some(k => Math.hypot(k.x - p.x, k.y - p.y) < minDist)) continue;
    kept.push(p);
  }
  return kept;
}

/** Linien zum Zeichnen: Straßen, Wege, Bahn, Bäche – vereinfacht und gerundet. */
export function displayLines(features) {
  const lines = [];
  for (const f of features) {
    if (f.k !== 'l' || !['road', 'path', 'rail', 'water'].includes(f.c)) continue;
    const p = f.p.map(pts => simplify(pts, 0.35).map(r1)).filter(pts => pts.length >= 4);
    if (!p.length) continue;
    lines.push({ k: f.c, w: r1(f.w), p, ...(f.n && f.c !== 'path' ? { n: f.n } : {}) });
  }
  // breite Straßen zuletzt zeichnen
  return lines.sort((a, b) => a.w - b.w);
}

/** Komplettes Brett aus Rastern, Features und Wahrzeichen. */
export function buildBoard({ cls, barrier, n, targetCount, features = [], pois = [] }) {
  const seg = segment({ cls, barrier, n, targetCount });
  const { regions, adj } = describe({ ...seg, n, cls });
  nameRegions(regions, seg.labels, n, features, pois);
  return {
    size: n,
    regions: regions.map(r => ({ t: r.t, n: r.n, c: r.c.map(r1), p: r.p })),
    adj,
    lines: displayLines(features),
    pois: pickPois(pois).map(p => ({ e: p.e, x: r1(p.x), y: r1(p.y), ...(p.n ? { n: p.n } : {}) })),
  };
}

// ---------- Zufallsbrett ----------

/** Zufallsbrett ohne Karte: verzerrte Voronoi-Zellen mit Geländeflecken. */
export function randomBoard(rng = Math.random, { n = 192, targetCount = 85 } = {}) {
  const side = Math.round(Math.sqrt(targetCount));
  const seeds = [];
  for (let gy = 0; gy < side; gy++) for (let gx = 0; gx < side; gx++) {
    seeds.push([((gx + 0.2 + rng() * 0.6) * n) / side, ((gy + 0.2 + rng() * 0.6) * n) / side]);
  }
  const ph = [rng() * 6.3, rng() * 6.3, rng() * 6.3, rng() * 6.3];
  const amp = n / side / 5;
  const labels = new Int32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    // sanfte Verzerrung, damit die Grenzen nicht schnurgerade sind
    const wx = x + amp * Math.sin(y / (n / 9) + ph[0]) + amp * 0.5 * Math.sin(y / (n / 23) + ph[1]);
    const wy = y + amp * Math.sin(x / (n / 9) + ph[2]) + amp * 0.5 * Math.sin(x / (n / 23) + ph[3]);
    let best = 0, bd = Infinity;
    for (let s = 0; s < seeds.length; s++) {
      const d = (wx - seeds[s][0]) ** 2 + (wy - seeds[s][1]) ** 2;
      if (d < bd) { bd = d; best = s; }
    }
    labels[y * n + x] = best;
  }
  const comp = components(labels, n);
  const count = mergeSmall(comp.labels, n, comp.count, (n * n) / targetCount * 0.3);
  const cls = new Uint8Array(n * n).fill(CLASS.building);
  const { regions, adj } = describe({ labels: comp.labels, count, n, cls, orig: null });

  // Geländeflecken über den Nachbarschaftsgraphen wachsen lassen
  regions.forEach(r => { r.t = 'house'; });
  const free = () => regions.map((r, i) => i).filter(i => regions[i].t === 'house');
  // Fleckenzahl wächst mit der Ortsanzahl (ausgelegt auf 36 Orte)
  const per = Math.max(1, regions.length / 36);
  for (const [t, blobs, len] of [['forest', 2, 4], ['green', 3, 3], ['plaza', 3, 2], ['water', 1, 2]]) {
    for (let b = 0; b < Math.round(blobs * per); b++) {
      const f = free();
      if (!f.length) break;
      let cur = f[Math.floor(rng() * f.length)];
      for (let s = 0; s < len; s++) {
        regions[cur].t = t;
        const opts = adj[cur].filter(k => regions[k].t === 'house');
        if (!opts.length) break;
        cur = opts[Math.floor(rng() * opts.length)];
      }
    }
  }
  regions.forEach(r => { r.n = TERRAIN_WORD[r.t]; });
  return {
    size: n,
    regions: regions.map(r => ({ t: r.t, n: r.n, c: r.c.map(r1), p: r.p })),
    adj, lines: [], pois: [],
    source: 'random',
  };
}
