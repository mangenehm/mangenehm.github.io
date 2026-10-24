/*
 * OSM-Daten für den Brettausschnitt laden und in kompakte Features
 * in Zellkoordinaten umwandeln (0 … size, y nach unten).
 * Erst aus Vektorkacheln (tiles.js, schnell), bei Problemen per Overpass-Abfrage.
 *
 * Feature: { c: Geländeklasse, k: 'a' (Fläche) | 'l' (Linie), w?: Linienbreite in Zellen,
 *            p: [[x0, y0, x1, y1, …], …] }   – Ringe (Fläche, evenodd) bzw. Linienzüge
 */

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
import { fetchTiles } from './tiles.js';

const CACHE_PREFIX = 'tierversteck:osm3:';
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
  const re = group => `"^(${Object.keys(POI[group]).join('|')})$"`;
  // out geom(bbox): Geometrie riesiger Relationen (Wälder, Stadtteile) nur im Ausschnitt – sonst Abbruch/504
  return `[out:json][timeout:25][maxsize:67108864];
(
  way["building"](${b});
  relation["building"](${b});
  way["highway"](${b});
  way["railway"~"^(rail|light_rail|tram|narrow_gauge)$"](${b});
  way["waterway"](${b});
  way["natural"~"^(water|wood|scrub|heath|grassland)$"](${b});
  relation["natural"~"^(water|wood|scrub|heath)$"](${b});
  way["landuse"](${b});
  relation["landuse"](${b});
  way["leisure"](${b});
  relation["leisure"](${b});
  way["amenity"~"^(${PLAZA_AMENITY.join('|')})$"](${b});
  way["place"="square"](${b});
  way["water"](${b});
);
out geom(${b});
(
  nwr["amenity"~${re('amenity')}](${b});
  nwr["shop"~${re('shop')}](${b});
  nwr["leisure"~${re('leisure')}](${b});
  nwr["tourism"~${re('tourism')}](${b});
  nwr["historic"~${re('historic')}](${b});
  node["railway"~${re('railway')}](${b});
);
out center;`;
}

const GREEN_LANDUSE = ['grass', 'meadow', 'farmland', 'orchard', 'vineyard', 'allotments', 'village_green', 'recreation_ground', 'cemetery', 'plant_nursery', 'greenfield', 'flowerbed'];
const GREEN_LEISURE = ['park', 'garden', 'golf_course', 'common', 'dog_park', 'nature_reserve'];
const PLAZA_LANDUSE = ['commercial', 'retail', 'industrial', 'railway', 'construction', 'garages', 'brownfield'];
const PLAZA_LEISURE = ['pitch', 'playground', 'sports_centre', 'stadium', 'track', 'schoolyard'];
const PLAZA_AMENITY = ['parking', 'school', 'kindergarten', 'university', 'college', 'hospital', 'marketplace'];
const ROAD_WIDTH = {
  motorway: 16, trunk: 14, primary: 12, secondary: 10, tertiary: 9,
  motorway_link: 8, trunk_link: 8, primary_link: 8, secondary_link: 8, tertiary_link: 8,
  residential: 7, unclassified: 7, living_street: 6, pedestrian: 6, road: 6, service: 4,
};
const PATH_WIDTH = { track: 3, footway: 2, path: 2, cycleway: 2, bridleway: 2, steps: 2 };
// Diese Straßen trennen Orte voneinander; Zufahrten und Wege liegen innerhalb
const BARRIER_ROADS = new Set(Object.keys(ROAD_WIDTH).filter(k => k !== 'service'));
const WATERWAY_WIDTH = { river: 16, canal: 10, stream: 3, ditch: 2, drain: 2 };
const BARRIER_WATERWAYS = new Set(['river', 'canal', 'stream']);

/** Wahrzeichen: Tag-Wert → [Emoji, Rang (kleiner = wichtiger), benennt den Ort?] */
export const POI = {
  amenity: {
    school: ['🏫', 1, true], kindergarten: ['🧸', 1, true], place_of_worship: ['⛪', 1, true], townhall: ['🏛️', 1, true],
    library: ['📚', 2, true], hospital: ['🏥', 1, true], fire_station: ['🚒', 2, true], police: ['🚓', 2, false],
    theatre: ['🎭', 2, true], cinema: ['🎬', 2, true], post_office: ['📮', 3, false], pharmacy: ['💊', 3, false],
    doctors: ['🩺', 4, false], bank: ['🏦', 4, false], fuel: ['⛽', 3, false], cafe: ['☕', 4, false],
    restaurant: ['🍽️', 4, false], fast_food: ['🍟', 4, false], ice_cream: ['🍦', 3, false], pub: ['🍺', 4, false], bar: ['🍸', 5, false],
  },
  shop: {
    supermarket: ['🛒', 2, false], bakery: ['🥨', 3, false], butcher: ['🥩', 4, false], kiosk: ['🗞️', 4, false],
    convenience: ['🛍️', 4, false], books: ['📖', 4, false], toys: ['🪀', 3, false],
  },
  leisure: { playground: ['🛝', 2, false], swimming_pool: ['🏊', 2, true], sports_centre: ['⚽', 2, true], stadium: ['🏟️', 1, true] },
  tourism: { museum: ['🖼️', 1, true], attraction: ['⭐', 2, true], viewpoint: ['🔭', 3, false], zoo: ['🦁', 1, true] },
  historic: { castle: ['🏰', 1, true], monument: ['🗿', 2, true], memorial: ['🕯️', 4, false], ruins: ['🏚️', 2, true] },
  railway: { station: ['🚉', 1, true], halt: ['🚉', 2, true], tram_stop: ['🚋', 4, false] },
};

const isTunnel = t => (t.tunnel && t.tunnel !== 'no') || Number(t.layer) < 0 || t.location === 'underground';

/**
 * OSM-Tags → { c, k, w?, b? } oder null. Breiten in Metern, b: trennt Orte.
 * Flächen: building, water, forest, green, plaza. Linien: road, path, rail, water.
 */
export function classifyTags(t = {}, closed = false) {
  if (t.building && t.building !== 'no') return { c: 'building', k: 'a' };
  if (t.natural === 'water' || t.water || t.waterway === 'riverbank' || ['reservoir', 'basin'].includes(t.landuse)) {
    return { c: 'water', k: 'a' };
  }
  if (t.waterway && WATERWAY_WIDTH[t.waterway]) {
    if (isTunnel(t)) return null;
    return { c: 'water', k: 'l', w: WATERWAY_WIDTH[t.waterway], b: BARRIER_WATERWAYS.has(t.waterway) };
  }
  if (t.landuse === 'forest' || ['wood', 'scrub', 'heath'].includes(t.natural)) return { c: 'forest', k: 'a' };
  if (GREEN_LANDUSE.includes(t.landuse) || GREEN_LEISURE.includes(t.leisure) || t.natural === 'grassland') {
    return { c: 'green', k: 'a' };
  }
  if (PLAZA_LANDUSE.includes(t.landuse) || PLAZA_LEISURE.includes(t.leisure) || PLAZA_AMENITY.includes(t.amenity) || t.place === 'square') {
    return closed ? { c: 'plaza', k: 'a' } : null;
  }
  if (t.highway && closed && t.area === 'yes') return { c: 'plaza', k: 'a' };
  if (t.highway && (ROAD_WIDTH[t.highway] || PATH_WIDTH[t.highway])) {
    if (isTunnel(t)) return null;
    if (PATH_WIDTH[t.highway]) return { c: 'path', k: 'l', w: PATH_WIDTH[t.highway], b: false };
    return { c: 'road', k: 'l', w: ROAD_WIDTH[t.highway], b: BARRIER_ROADS.has(t.highway) };
  }
  if (t.railway && !isTunnel(t)) return { c: 'rail', k: 'l', w: 4, b: t.railway !== 'tram' };
  return null;
}

/** Wahrzeichen-Info zu Tags oder null: { e, rank, names } */
export function poiInfo(t = {}) {
  for (const key of Object.keys(POI)) {
    const hit = t[key] && POI[key][t[key]];
    if (hit) return { e: hit[0], rank: hit[1], names: hit[2] };
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
export function toFeatures(osm, projection, size, cellMeters, { tol = 0.02 } = {}) {
  const lo = -0.5, hi = size + 0.5;
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
      pushFeature(cls, rings, line, el.tags?.name);
    } else if (el.type === 'relation' && Array.isArray(el.members)) {
      const cls = classifyTags(el.tags, true);
      if (!cls || cls.k !== 'a') continue;
      const ways = el.members.filter(m => m.type === 'way' && Array.isArray(m.geometry)).map(m => m.geometry.filter(Boolean));
      pushFeature(cls, stitchRings(ways), null, el.tags?.name);
    }
  }

  function pushFeature(cls, rings, line, name) {
    const extra = typeof name === 'string' && name.trim() ? { n: name.trim().slice(0, 60) } : {};
    if (rings) {
      const p = rings
        .map(r => clipRing(simplify(toFlat(r), tol), lo, hi).map(round))
        .filter(r => r.length >= 6);
      if (p.length) features.push({ c: cls.c, k: 'a', p, ...extra });
    } else if (line) {
      const p = clipLine(simplify(toFlat(line), tol), lo, hi).map(r => r.map(round)).filter(r => r.length >= 4);
      if (p.length) features.push({ c: cls.c, k: 'l', w: round(cls.w / cellMeters), b: !!cls.b, p, ...extra });
    }
  }
  return features;
}

/** Wahrzeichen (Knoten bzw. Mittelpunkte) innerhalb des Bretts: [{ e, rank, names, x, y, n? }] */
export function toPois(osm, projection, size) {
  const out = [];
  for (const el of osm.elements || []) {
    const pos = Number.isFinite(el.lat) ? el : el.center;
    if (!pos || !Number.isFinite(pos.lat) || !Number.isFinite(pos.lon)) continue;
    const info = poiInfo(el.tags);
    if (!info) continue;
    const [x, y] = projection.project(pos.lat, pos.lon);
    if (x < 0 || y < 0 || x > size || y > size) continue;
    const n = typeof el.tags.name === 'string' && el.tags.name.trim() ? el.tags.name.trim().slice(0, 60) : undefined;
    out.push({ ...info, x: round(x), y: round(y), ...(n ? { n } : {}) });
  }
  return out;
}

function cacheKey(bbox) {
  return CACHE_PREFIX + [bbox.south, bbox.west, bbox.north, bbox.east].map(v => v.toFixed(5)).join(',');
}

/**
 * Lädt die OSM-Daten: Overpass-Cache in localStorage, dann Vektorkacheln, zuletzt Overpass mit Ausweich-Endpunkten.
 * Overpass: Antwortet ein Server nicht binnen staggerMs, wird parallel der nächste gefragt;
 * die erste brauchbare Antwort gewinnt. Jede Anfrage bricht nach timeoutMs ab.
 * onProgress({ attempt, total, host }) meldet jeden gestarteten Versuch.
 */
export async function fetchOsm(bbox, {
  signal, onProgress, fetchImpl = (...a) => fetch(...a),
  endpoints = ENDPOINTS, staggerMs = 6000, timeoutMs = 45000, retryDelayMs = 4000, tiles = true,
} = {}) {
  const key = cacheKey(bbox);
  try {
    const cached = localStorage.getItem(key);
    if (cached) return JSON.parse(cached);
  } catch { /* Speicher nicht verfügbar */ }

  if (tiles) {
    try {
      // nicht in localStorage: Kacheln hält der Browser-Cache, und die Daten sprengen schnell die 5 MB
      return await fetchTiles(bbox, { signal, fetchImpl });
    } catch (err) {
      if (signal?.aborted) throw err;
      console.warn('Kacheln nicht verfügbar, frage Overpass:', err.message);
    }
  }

  const body = 'data=' + encodeURIComponent(buildQuery(bbox));
  const opts = { signal, fetchImpl, staggerMs, timeoutMs };
  let data;
  try {
    data = await raceEndpoints(endpoints, body, { ...opts, onProgress: p => onProgress?.({ ...p, round: 1 }) });
  } catch (err) {
    // Überlastung (429/5xx, keine Antwort) ist meist kurzlebig → eine zweite Runde
    if (signal?.aborted || !err.transient) throw err;
    await sleep(retryDelayMs, signal);
    data = await raceEndpoints(endpoints, body, { ...opts, onProgress: p => onProgress?.({ ...p, round: 2 }) });
  }
  storeCache(key, data);
  return data;
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason); }, { once: true });
  });
}

function raceEndpoints(endpoints, body, { signal, onProgress, fetchImpl, staggerMs, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const ctrls = [], errors = [];
    let next = 0, failed = 0, done = false, stagger = null, transient = false;

    const finish = (fn, value) => {
      if (done) return;
      done = true;
      clearTimeout(stagger);
      signal?.removeEventListener('abort', onAbort);
      ctrls.forEach(c => c.abort());
      fn(value);
    };
    const onAbort = () => finish(reject, signal.reason ?? new DOMException('Abgebrochen', 'AbortError'));
    if (signal?.aborted) return onAbort();
    signal?.addEventListener('abort', onAbort, { once: true });

    const launch = () => {
      clearTimeout(stagger);
      if (done || next >= endpoints.length) return;
      const url = endpoints[next++];
      const host = new URL(url).host;
      onProgress?.({ attempt: next, total: endpoints.length, host });
      const ctrl = new AbortController();
      ctrls.push(ctrl);
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, timeoutMs);
      fetchImpl(url, {
        method: 'POST', body, signal: ctrl.signal,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
        .then(res => {
          if (!res.ok) {
            if (res.status === 429 || res.status >= 500) transient = true;
            throw new Error(`HTTP ${res.status}`);
          }
          return res.json();
        })
        .then(data => {
          if (!Array.isArray(data?.elements)) throw new Error('unerwartete Antwort');
          finish(resolve, data);
        })
        .catch(err => {
          if (done) return;
          errors.push(`${host}: ${timedOut ? 'keine Antwort' : err.message}`);
          if (timedOut || err instanceof TypeError) transient = true; // Zeitlimit oder Netzwerkfehler
          if (++failed === endpoints.length) {
            const e = new Error(`Kartendaten konnten nicht geladen werden (${errors.join('; ')})`);
            e.transient = transient;
            finish(reject, e);
          } else launch(); // gescheitert → sofort den nächsten Server fragen
        })
        .finally(() => clearTimeout(timer));
      if (next < endpoints.length) stagger = setTimeout(launch, staggerMs);
    };
    launch();
  });
}

function storeCache(key, data) {
  try {
    // nur die nötigsten Felder speichern; alte Einträge bei Platzmangel räumen
    const slim = { elements: (data.elements || []).map(e => ({
      type: e.type, tags: e.tags, geometry: e.geometry, lat: e.lat, lon: e.lon, center: e.center,
      members: e.members?.map(m => ({ type: m.type, role: m.role, geometry: m.geometry })),
    })) };
    const text = JSON.stringify(slim);
    for (let attempt = 0; attempt < 2; attempt++) {
      try { localStorage.setItem(key, text); return; } catch {
        Object.keys(localStorage).filter(k => k.startsWith('tierversteck:osm')).forEach(k => localStorage.removeItem(k));
      }
    }
  } catch { /* egal – dann eben ohne Cache */ }
}
