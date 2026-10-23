/*
 * OSM-Daten für den Brettausschnitt laden und in kompakte Features
 * in Zellkoordinaten umwandeln (0 … size, y nach unten).
 *
 * Feature: { c: Geländeklasse, k: 'a' (Fläche) | 'l' (Linie), w?: Linienbreite in Zellen,
 *            p: [[x0, y0, x1, y1, …], …] }   – Ringe (Fläche, evenodd) bzw. Linienzüge
 */

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const CACHE_PREFIX = 'tierversteck:osm:';
const M_PER_DEG = 111320;

/** Projektion um einen Mittelpunkt; Brett ist size × size Zellen à cellMeters. */
export function makeProjection(center, size, cellMeters) {
  const half = (size * cellMeters) / 2;
  const cos = Math.cos((center.lat * Math.PI) / 180);
  const dLat = half / M_PER_DEG;
  const dLon = half / (M_PER_DEG * cos);
  return {
    bbox: { south: center.lat - dLat, west: center.lon - dLon, north: center.lat + dLat, east: center.lon + dLon },
    project(lat, lon) {
      return [
        ((lon - center.lon) * M_PER_DEG * cos) / cellMeters + size / 2,
        (-(lat - center.lat) * M_PER_DEG) / cellMeters + size / 2,
      ];
    },
  };
}

export function buildQuery(bbox) {
  // etwas Rand, damit Flächen an den Kanten vollständig ankommen
  const pad = (bbox.north - bbox.south) * 0.05;
  const b = [bbox.south - pad, bbox.west - pad, bbox.north + pad, bbox.east + pad].map(v => v.toFixed(6)).join(',');
  return `[out:json][timeout:25][maxsize:33554432];
(
  way["building"](${b});
  relation["building"](${b});
  way["highway"](${b});
  way["waterway"](${b});
  way["natural"~"^(water|wood|scrub|heath|grassland)$"](${b});
  relation["natural"~"^(water|wood|scrub|heath)$"](${b});
  way["landuse"](${b});
  relation["landuse"](${b});
  way["leisure"](${b});
  relation["leisure"](${b});
  way["water"](${b});
);
out geom;`;
}

const GREEN_LANDUSE = ['grass', 'meadow', 'farmland', 'orchard', 'vineyard', 'allotments', 'village_green', 'recreation_ground', 'cemetery', 'plant_nursery', 'greenfield'];
const GREEN_LEISURE = ['park', 'garden', 'pitch', 'playground', 'golf_course', 'common', 'dog_park'];
const ROAD_WIDTH = {
  motorway: 16, trunk: 14, primary: 12, secondary: 10, tertiary: 9,
  motorway_link: 8, trunk_link: 8, primary_link: 8, secondary_link: 8, tertiary_link: 8,
  residential: 7, unclassified: 7, living_street: 6, pedestrian: 6, road: 6, service: 5,
  track: 3.5, footway: 3, path: 3, cycleway: 3, bridleway: 3, steps: 3,
};
const WATERWAY_WIDTH = { river: 16, canal: 10, stream: 3, ditch: 2, drain: 2 };

/** OSM-Tags → { c, k, w? } oder null. Breiten in Metern. */
export function classifyTags(t = {}, closed = false) {
  if (t.building && t.building !== 'no') return { c: 'building', k: 'a' };
  if (t.natural === 'water' || t.water || t.waterway === 'riverbank' || ['reservoir', 'basin'].includes(t.landuse)) {
    return { c: 'water', k: 'a' };
  }
  if (t.waterway && WATERWAY_WIDTH[t.waterway]) return { c: 'water', k: 'l', w: WATERWAY_WIDTH[t.waterway] };
  if (t.landuse === 'forest' || ['wood', 'scrub', 'heath'].includes(t.natural)) return { c: 'forest', k: 'a' };
  if (GREEN_LANDUSE.includes(t.landuse) || GREEN_LEISURE.includes(t.leisure) || t.natural === 'grassland') {
    return { c: 'green', k: 'a' };
  }
  if (t.highway && ROAD_WIDTH[t.highway]) {
    if (closed && t.area === 'yes') return { c: 'road', k: 'a' };
    return { c: 'road', k: 'l', w: ROAD_WIDTH[t.highway] };
  }
  return null;
}

const keyOf = pt => pt.lat.toFixed(7) + ',' + pt.lon.toFixed(7);

/** Fügt offene Wegstücke einer Multipolygon-Relation zu geschlossenen Ringen zusammen. */
export function stitchRings(parts) {
  const open = parts.filter(p => p.length >= 2).map(p => [...p]);
  const rings = [];
  while (open.length) {
    let ring = open.shift();
    let grew = true;
    while (keyOf(ring[0]) !== keyOf(ring[ring.length - 1]) && grew) {
      grew = false;
      const end = keyOf(ring[ring.length - 1]);
      for (let i = 0; i < open.length; i++) {
        const p = open[i];
        if (keyOf(p[0]) === end) ring = ring.concat(p.slice(1));
        else if (keyOf(p[p.length - 1]) === end) ring = ring.concat([...p].reverse().slice(1));
        else continue;
        open.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (ring.length >= 4) rings.push(ring);
  }
  return rings;
}

/** Douglas-Peucker auf einer flachen Punktliste [x0, y0, x1, y1, …]. */
export function simplify(flat, tol) {
  const n = flat.length / 2;
  if (n <= 2) return flat;
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const ax = flat[2 * a], ay = flat[2 * a + 1], bx = flat[2 * b], by = flat[2 * b + 1];
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy);
    let maxD = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      // geschlossene Ringe: Anfang = Ende, dann zählt der Abstand zum Punkt
      const d = len < 1e-9
        ? Math.hypot(flat[2 * i] - ax, flat[2 * i + 1] - ay)
        : Math.abs(dy * flat[2 * i] - dx * flat[2 * i + 1] + bx * ay - by * ax) / len;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tol && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(flat[2 * i], flat[2 * i + 1]);
  return out;
}

/** Sutherland-Hodgman: Ring auf das Rechteck [lo, hi]² beschneiden. */
export function clipRing(flat, lo, hi) {
  let pts = [];
  for (let i = 0; i < flat.length; i += 2) pts.push([flat[i], flat[i + 1]]);
  const edges = [
    [p => p[0] >= lo, (p, q) => lerpAt(p, q, 0, lo)],
    [p => p[0] <= hi, (p, q) => lerpAt(p, q, 0, hi)],
    [p => p[1] >= lo, (p, q) => lerpAt(p, q, 1, lo)],
    [p => p[1] <= hi, (p, q) => lerpAt(p, q, 1, hi)],
  ];
  for (const [inside, cut] of edges) {
    const res = [];
    for (let i = 0; i < pts.length; i++) {
      const cur = pts[i], prev = pts[(i + pts.length - 1) % pts.length];
      if (inside(cur)) {
        if (!inside(prev)) res.push(cut(prev, cur));
        res.push(cur);
      } else if (inside(prev)) res.push(cut(prev, cur));
    }
    pts = res;
    if (!pts.length) break;
  }
  return pts.flat();
}

function lerpAt(p, q, axis, v) {
  const t = (v - p[axis]) / (q[axis] - p[axis]);
  return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
}

/** Linienzug auf das Rechteck beschränken: zerlegt in Stücke, deren Segmente es berühren. */
export function clipLine(flat, lo, hi) {
  const inBox = (x, y) => x >= lo && x <= hi && y >= lo && y <= hi;
  const runs = [];
  let run = [];
  for (let i = 0; i + 3 < flat.length; i += 2) {
    const x0 = flat[i], y0 = flat[i + 1], x1 = flat[i + 2], y1 = flat[i + 3];
    const near = inBox(x0, y0) || inBox(x1, y1) || segmentCrossesBox(x0, y0, x1, y1, lo, hi);
    if (near) {
      if (!run.length) run.push(x0, y0);
      run.push(x1, y1);
    } else if (run.length) { runs.push(run); run = []; }
  }
  if (run.length) runs.push(run);
  return runs;
}

function segmentCrossesBox(x0, y0, x1, y1, lo, hi) {
  if (Math.max(x0, x1) < lo || Math.min(x0, x1) > hi || Math.max(y0, y1) < lo || Math.min(y0, y1) > hi) return false;
  return clipRing([x0, y0, x1, y1, x1, y1], lo, hi).length > 0;
}

const round = v => Math.round(v * 1000) / 1000;

/**
 * Overpass-JSON → Features in Zellkoordinaten, beschnitten auf das Brett
 * (mit einer halben Zelle Rand) und vereinfacht.
 */
export function toFeatures(osm, projection, size, cellMeters) {
  const lo = -0.5, hi = size + 0.5, tol = 0.02;
  const features = [];
  const toFlat = pts => pts.filter(Boolean).flatMap(pt => projection.project(pt.lat, pt.lon));

  for (const el of osm.elements || []) {
    let rings = null, line = null;
    if (el.type === 'way' && Array.isArray(el.geometry)) {
      const g = el.geometry.filter(Boolean);
      const closed = g.length >= 4 && keyOf(g[0]) === keyOf(g[g.length - 1]);
      const cls = classifyTags(el.tags, closed);
      if (!cls) continue;
      if (cls.k === 'a') { if (!closed) continue; rings = [g]; }
      else line = g;
      pushFeature(cls, rings, line);
    } else if (el.type === 'relation' && Array.isArray(el.members)) {
      const cls = classifyTags(el.tags, true);
      if (!cls || cls.k !== 'a') continue;
      const ways = el.members.filter(m => m.type === 'way' && Array.isArray(m.geometry)).map(m => m.geometry.filter(Boolean));
      pushFeature(cls, stitchRings(ways), null);
    }
  }

  function pushFeature(cls, rings, line) {
    if (rings) {
      const p = rings
        .map(r => clipRing(simplify(toFlat(r), tol), lo, hi).map(round))
        .filter(r => r.length >= 6);
      if (p.length) features.push({ c: cls.c, k: 'a', p });
    } else if (line) {
      const p = clipLine(simplify(toFlat(line), tol), lo, hi).map(r => r.map(round)).filter(r => r.length >= 4);
      if (p.length) features.push({ c: cls.c, k: 'l', w: round(cls.w / cellMeters), p });
    }
  }
  return features;
}

function cacheKey(bbox) {
  return CACHE_PREFIX + [bbox.south, bbox.west, bbox.north, bbox.east].map(v => v.toFixed(5)).join(',');
}

/** Lädt die OSM-Daten (mit Cache in localStorage und Ausweich-Endpunkten). */
export async function fetchOsm(bbox, { signal } = {}) {
  const key = cacheKey(bbox);
  try {
    const cached = localStorage.getItem(key);
    if (cached) return JSON.parse(cached);
  } catch { /* Speicher nicht verfügbar */ }

  const body = 'data=' + encodeURIComponent(buildQuery(bbox));
  let lastError = null;
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: 'POST', body, signal,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      const data = await res.json();
      storeCache(key, data);
      return data;
    } catch (e) {
      if (signal?.aborted) throw e;
      lastError = e;
    }
  }
  throw new Error('Kartendaten konnten nicht geladen werden' + (lastError ? ` (${lastError.message})` : ''));
}

function storeCache(key, data) {
  try {
    // nur die nötigsten Felder speichern; alte Einträge bei Platzmangel räumen
    const slim = { elements: (data.elements || []).map(e => ({ type: e.type, tags: e.tags, geometry: e.geometry, members: e.members?.map(m => ({ type: m.type, role: m.role, geometry: m.geometry })) })) };
    const text = JSON.stringify(slim);
    for (let attempt = 0; attempt < 2; attempt++) {
      try { localStorage.setItem(key, text); return; } catch {
        Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX)).forEach(k => localStorage.removeItem(k));
      }
    }
  } catch { /* egal – dann eben ohne Cache */ }
}
