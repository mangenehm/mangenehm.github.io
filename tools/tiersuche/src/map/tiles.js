/*
 * OSM-Daten aus Vektorkacheln (OpenFreeMap, OpenMapTiles-Schema) statt per
 * Overpass-Abfrage: Kacheln kommen in Millisekunden vom CDN. Die Kachel-Inhalte
 * werden in dasselbe Format wie eine Overpass-Antwort umgesetzt
 * ({ elements: [{ type, tags, geometry, members, lat, lon }] }) – danach läuft
 * alles wie bisher (classifyTags, toFeatures, toPois, Cache).
 */

import { VectorTile, Pbf } from '../../vendor/vector-tile.js';
import { POI } from './overpass.js';

const TILEJSON = 'https://tiles.openfreemap.org/planet';
const URL_KEY = 'tierversteck:tileurl';
const URL_MAX_AGE = 24 * 3600e3;
export const TILE_ZOOM = 14;   // höchste Stufe mit allen Gebäuden, Wegen und Wahrzeichen

/** Kachel x/y (Web-Mercator) für einen Punkt. */
export function tileXY(lat, lon, z = TILE_ZOOM) {
  const n = 2 ** z;
  const rad = (lat * Math.PI) / 180;
  return [
    Math.floor(((lon + 180) / 360) * n),
    Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n),
  ];
}

/** Alle Kacheln, die eine bbox berühren: [[x, y], …] */
export function tilesFor(bbox, z = TILE_ZOOM) {
  const [x0, y0] = tileXY(bbox.north, bbox.west, z);
  const [x1, y1] = tileXY(bbox.south, bbox.east, z);
  const out = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push([x, y]);
  return out;
}

/** Punkt in Kachelkoordinaten (0 … extent) → { lat, lon } */
export function tileToLatLon(z, x, y, px, py, extent = 4096) {
  const n = 2 ** z;
  const lon = ((x + px / extent) / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + py / extent)) / n))) * 180) / Math.PI;
  return { lat: Math.round(lat * 1e7) / 1e7, lon: Math.round(lon * 1e7) / 1e7 };
}

// ---------- OpenMapTiles-Klassen → OSM-Tags, wie classifyTags sie kennt ----------

const ROADS = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary']);
const GRASS_NATURAL = new Set(['scrub', 'heath', 'grassland']);
const GRASS_LEISURE = new Set(['park', 'garden', 'golf_course', 'common', 'dog_park']);
const AMENITY_LANDUSE = new Set(['school', 'kindergarten', 'university', 'college', 'hospital']);
const LEISURE_LANDUSE = new Set(['pitch', 'playground', 'track', 'stadium']);

function landcoverTags({ class: c, subclass: s }) {
  if (c === 'wood') return { natural: 'wood' };
  if (c === 'grass') {
    if (GRASS_NATURAL.has(s)) return { natural: s };
    if (GRASS_LEISURE.has(s)) return { leisure: s };
    return { landuse: s || 'grass' };
  }
  if (c === 'farmland') return { landuse: s || 'farmland' };
  return null;
}

function landuseTags({ class: c }) {
  if (AMENITY_LANDUSE.has(c)) return { amenity: c };
  if (LEISURE_LANDUSE.has(c)) return { leisure: c };
  return c ? { landuse: c } : null;
}

function transportTags(p, polygon) {
  const { class: c, subclass: s } = p;
  const tags = {};
  if (p.brunnel === 'tunnel' || Number(p.layer) < 0) tags.tunnel = 'yes';
  if (polygon) {
    // Fußgängerzonen und Plätze als Fläche; Brücken-Umrisse sind keine Orte
    if (c !== 'path' || !['pedestrian', 'footway'].includes(s)) return null;
    return { highway: s, area: 'yes' };
  }
  if (ROADS.has(c)) tags.highway = p.ramp ? c + '_link' : c;
  else if (c === 'minor') tags.highway = 'residential';
  else if (c === 'service' || c === 'busway') tags.highway = 'service';
  else if (c === 'track') tags.highway = 'track';
  else if (c === 'path') tags.highway = ['pedestrian', 'steps', 'cycleway', 'bridleway'].includes(s) ? s : 'footway';
  else if (c === 'rail' || c === 'transit') tags.railway = s || 'rail';
  else return null;
  return tags;
}

function waterwayTags({ class: c, brunnel }) {
  return c ? { waterway: c, ...(brunnel === 'tunnel' ? { tunnel: 'yes' } : {}) } : null;
}

/** POI-Klasse → Tags für poiInfo (Unterklasse ist meist der OSM-Wert, sonst die Klasse). */
function poiTags({ class: c, subclass: s }) {
  for (const key of Object.keys(POI)) {
    if (POI[key][s]) return { [key]: s };
  }
  for (const key of Object.keys(POI)) {
    if (POI[key][c]) return { [key]: c };
  }
  return null;
}

const LAYERS = {
  building: { area: () => ({ building: 'yes' }) },
  water: { area: () => ({ natural: 'water' }) },
  landcover: { area: landcoverTags },
  landuse: { area: landuseTags },
  park: { area: p => (p.class === 'nature_reserve' ? { leisure: 'nature_reserve' } : null) },
  waterway: { line: waterwayTags },
  transportation: { line: p => transportTags(p, false), area: p => transportTags(p, true) },
  poi: { point: poiTags },
};

const ptKey = pt => pt.x + ',' + pt.y;

/**
 * Dekodierte Kacheln → Overpass-ähnliche Elemente, auf die bbox beschränkt.
 * @param {{ z:number, x:number, y:number, tile:VectorTile }[]} tiles
 */
export function tilesToOsm(tiles, bbox) {
  const elements = [];
  const inBox = pts => {
    let s = 90, n = -90, w = 180, e = -180;
    for (const p of pts) { s = Math.min(s, p.lat); n = Math.max(n, p.lat); w = Math.min(w, p.lon); e = Math.max(e, p.lon); }
    return n >= bbox.south && s <= bbox.north && e >= bbox.west && w <= bbox.east;
  };

  for (const { z, x, y, tile } of tiles) {
    // Straßennamen stecken in einer eigenen Ebene mit zusammengefassten Linien –
    // über gemeinsame Stützpunkte zurück auf die einzelnen Straßenstücke übertragen
    const names = new Map();
    const tn = tile.layers.transportation_name;
    for (let i = 0; tn && i < tn.length; i++) {
      const f = tn.feature(i);
      const name = f.properties['name:de'] || f.properties.name;
      if (!name) continue;
      for (const line of f.loadGeometry()) for (const pt of line) names.set(f.properties.class + '|' + ptKey(pt), name);
    }

    for (const [id, conv] of Object.entries(LAYERS)) {
      const layer = tile.layers[id];
      if (!layer) continue;
      const toLL = pt => tileToLatLon(z, x, y, pt.x, pt.y, layer.extent);
      for (let i = 0; i < layer.length; i++) {
        const f = layer.feature(i);
        const p = f.properties;
        const kind = ['', 'point', 'line', 'area'][f.type];
        const tags = conv[kind]?.(p);
        if (!tags) continue;
        const geom = f.loadGeometry();

        if (kind === 'point') {
          const pt = toLL(geom[0][0]);
          if (!inBox([pt])) continue;
          const name = p['name:de'] || p.name;
          elements.push({ type: 'node', lat: pt.lat, lon: pt.lon, tags: name ? { ...tags, name } : tags });
          continue;
        }
        if (kind === 'line') {
          for (const line of geom) {
            const pts = line.map(toLL);
            if (pts.length < 2 || !inBox(pts)) continue;
            const mid = line[Math.floor(line.length / 2)];
            const name = id === 'transportation' && (names.get(p.class + '|' + ptKey(mid)) || names.get(p.class + '|' + ptKey(line[0])));
            elements.push({ type: 'way', geometry: pts, tags: name ? { ...tags, name } : tags });
          }
          continue;
        }
        // Fläche: Ringe (außen und Löcher) als Relation; Ringe sind schon geschlossen
        const rings = geom.map(r => r.map(toLL)).filter(r => r.length >= 4);
        if (!rings.length || !inBox(rings.flat())) continue;
        const name = p['name:de'] || p.name;
        elements.push({
          type: 'relation',
          tags: name ? { ...tags, name } : tags,
          members: rings.map((g, k) => ({ type: 'way', role: k ? 'inner' : 'outer', geometry: g })),
        });
      }
    }
  }
  return { elements };
}

// ---------- Laden ----------

function cachedUrl() {
  try {
    const v = JSON.parse(localStorage.getItem(URL_KEY) || 'null');
    if (v && Date.now() - v.t < URL_MAX_AGE) return v.url;
  } catch { /* kein Speicher */ }
  return null;
}

async function tileUrl(fetchImpl, signal, fresh = false) {
  if (!fresh) { const u = cachedUrl(); if (u) return u; }
  const res = await fetchImpl(TILEJSON, { signal });
  if (!res.ok) throw new Error(`Kachel-Index HTTP ${res.status}`);
  const url = (await res.json())?.tiles?.[0];
  if (typeof url !== 'string' || !url.includes('{z}')) throw new Error('Kachel-Index unbrauchbar');
  try { localStorage.setItem(URL_KEY, JSON.stringify({ url, t: Date.now() })); } catch { /* egal */ }
  return url;
}

/**
 * Lädt die Kacheln für eine bbox parallel und liefert Overpass-ähnliche Daten.
 * Bricht nach timeoutMs ab; ein veralteter Kachel-Index wird einmal erneuert.
 */
export async function fetchTiles(bbox, { signal, fetchImpl = (...a) => fetch(...a), timeoutMs = 12000, z = TILE_ZOOM } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error('Kacheln: keine Antwort')), timeoutMs);
  const onAbort = () => ctrl.abort(signal.reason);
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const load = async fresh => {
      const tpl = await tileUrl(fetchImpl, ctrl.signal, fresh);
      return Promise.all(tilesFor(bbox, z).map(async ([x, y]) => {
        const res = await fetchImpl(tpl.replace('{z}', z).replace('{x}', x).replace('{y}', y), { signal: ctrl.signal });
        if (!res.ok) throw Object.assign(new Error(`Kachel HTTP ${res.status}`), { status: res.status });
        return { z, x, y, tile: new VectorTile(new Pbf(new Uint8Array(await res.arrayBuffer()))) };
      }));
    };
    let tiles;
    try { tiles = await load(false); } catch (err) {
      if (ctrl.signal.aborted || !err.status) throw err;
      tiles = await load(true);   // Kachelstand gewechselt → Index neu holen
    }
    return tilesToOsm(tiles, bbox);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
