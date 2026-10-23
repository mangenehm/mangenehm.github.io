import { test } from 'node:test';
import assert from 'node:assert/strict';

import { classifyTags, stitchRings, simplify, clipRing, clipLine, toFeatures, makeProjection, buildQuery, fetchOsm } from '../src/map/overpass.js';
import { terrainFromPixels, RASTER_COLORS, PRIORITY } from '../src/map/classify.js';
import { shiftCenter } from '../src/map/build.js';
import { isValidBoard } from '../src/engine/board.js';

test('OSM-Tags → Geländeklassen', () => {
  assert.equal(classifyTags({ building: 'yes' }).c, 'building');
  assert.equal(classifyTags({ building: 'no' }), null);
  assert.equal(classifyTags({ natural: 'water' }).c, 'water');
  assert.deepEqual(classifyTags({ waterway: 'river' }), { c: 'water', k: 'l', w: 16 });
  assert.equal(classifyTags({ landuse: 'forest' }).c, 'forest');
  assert.equal(classifyTags({ natural: 'scrub' }).c, 'forest');
  assert.equal(classifyTags({ landuse: 'meadow' }).c, 'green');
  assert.equal(classifyTags({ leisure: 'park' }).c, 'green');
  assert.equal(classifyTags({ highway: 'residential' }).k, 'l');
  assert.equal(classifyTags({ highway: 'pedestrian', area: 'yes' }, true).k, 'a');
  assert.equal(classifyTags({ landuse: 'residential' }), null);
  assert.equal(classifyTags({ amenity: 'bench' }), null);
});

test('Multipolygon-Ringe zusammenfügen', () => {
  const p = (lat, lon) => ({ lat, lon });
  const a = [p(0, 0), p(0, 1), p(1, 1)];
  const b = [p(0, 0), p(1, 0), p(1, 1)];          // umgekehrt orientiert
  const rings = stitchRings([a, b]);
  assert.equal(rings.length, 1);
  assert.equal(rings[0].length, 5);
  assert.deepEqual(rings[0][0], rings[0][4]);
});

test('Vereinfachen und Beschneiden', () => {
  assert.deepEqual(simplify([0, 0, 1, 0.001, 2, 0], 0.01), [0, 0, 2, 0]);
  assert.deepEqual(simplify([0, 0, 1, 1, 2, 0], 0.01), [0, 0, 1, 1, 2, 0]);
  const clipped = clipRing([-5, -5, 5, -5, 5, 5, -5, 5], 0, 2);
  const xs = clipped.filter((_, i) => i % 2 === 0), ys = clipped.filter((_, i) => i % 2);
  assert.ok(xs.every(x => x >= 0 && x <= 2) && ys.every(y => y >= 0 && y <= 2));
  assert.deepEqual(clipRing([10, 10, 11, 10, 11, 11], 0, 2), []);
  assert.equal(clipLine([-10, 1, -5, 1, 1, 1, 5, 1, 10, 1, 20, 1], 0, 2).length, 1);
  assert.equal(clipLine([10, 10, 20, 20], 0, 2).length, 0);
});

test('Projektion: Mittelpunkt liegt in der Brettmitte, Norden oben', () => {
  const pr = makeProjection({ lat: 52.5, lon: 13.4 }, 10, 30);
  assert.deepEqual(pr.project(52.5, 13.4), [5, 5]);
  const [, yN] = pr.project(pr.bbox.north, 13.4);
  const [xE] = pr.project(52.5, pr.bbox.east);
  assert.ok(Math.abs(yN) < 1e-6);
  assert.ok(Math.abs(xE - 10) < 1e-6);
  assert.match(buildQuery(pr.bbox), /out geom;/);
  const moved = shiftCenter({ lat: 52.5, lon: 13.4 }, 30, 1, 0);
  assert.ok(Math.abs(makeProjection({ lat: 52.5, lon: 13.4 }, 10, 30).project(moved.lat, moved.lon)[0] - 6) < 1e-6);
});

test('Overpass-Antwort → Features im Brett', () => {
  const pr = makeProjection({ lat: 50, lon: 8 }, 8, 25);
  const { south, north, west, east } = pr.bbox;
  const midLat = (south + north) / 2;
  const osm = { elements: [
    { type: 'way', tags: { building: 'yes' }, geometry: [
      { lat: midLat, lon: west }, { lat: midLat, lon: (west + east) / 2 },
      { lat: south, lon: (west + east) / 2 }, { lat: midLat, lon: west }] },
    { type: 'way', tags: { highway: 'residential' }, geometry: [{ lat: north, lon: west }, { lat: north, lon: east }] },
    { type: 'way', tags: { natural: 'tree' }, geometry: [{ lat: midLat, lon: west }] },
    { type: 'way', tags: { building: 'yes' }, geometry: [{ lat: midLat, lon: west }, { lat: south, lon: east }] },  // offen → verworfen
  ] };
  const f = toFeatures(osm, pr, 8, 25);
  assert.equal(f.length, 2);
  assert.equal(f[0].c, 'building');
  assert.equal(f[1].c, 'road');
  assert.equal(f[1].w, 7 / 25);
  const board = { size: 8, terrain: new Array(64).fill('other'), features: f };
  assert.ok(isValidBoard(board));
  assert.ok(!isValidBoard({ ...board, features: [{ c: 'road', k: 'l', w: 1, p: [[0, NaN]] }] }));
});

test('Pixel zählen: Mehrheit gewinnt, Gleichstand nach Priorität, Mischfarben zählen nicht', () => {
  const size = 2, ppc = 2, width = size * ppc;
  const data = new Uint8ClampedArray(width * width * 4);
  const paint = (px, py, rgb) => { const i = (py * width + px) * 4; data.set([...rgb, 255], i); };
  for (let y = 0; y < width; y++) for (let x = 0; x < width; x++) paint(x, y, RASTER_COLORS.other);
  // Zelle (0,0): 3× Gebäude
  paint(0, 0, RASTER_COLORS.building); paint(1, 0, RASTER_COLORS.building); paint(0, 1, RASTER_COLORS.building);
  // Zelle (1,0): 2× Straße, 2× Grün → Gleichstand, Grün hat Vorrang
  paint(2, 0, RASTER_COLORS.road); paint(3, 0, RASTER_COLORS.road); paint(2, 1, RASTER_COLORS.green); paint(3, 1, RASTER_COLORS.green);
  // Zelle (0,1): 1× Wasser, 3× Mischfarbe → Wasser
  paint(0, 2, RASTER_COLORS.water); paint(1, 2, [10, 20, 30]); paint(0, 3, [10, 20, 30]); paint(1, 3, [10, 20, 30]);
  assert.deepEqual(terrainFromPixels(data, size, ppc), ['building', 'green', 'water', 'other']);
  assert.deepEqual(PRIORITY, ['water', 'building', 'forest', 'green', 'road', 'other']);
});

// Fake-fetch: pro URL ein Verhalten – Zahl = Antwort nach ms, 'hang' = nie, 'statusNNN' = HTTP-Fehler
function fakeFetch(plan, calls) {
  return (url, { signal }) => {
    calls.push(url);
    const b = plan[url];
    return new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason ?? new Error('abort')));
      if (b === 'hang') return;
      if (typeof b === 'number') setTimeout(() => resolve({ ok: true, json: async () => ({ elements: [{ from: url }] }) }), b);
      else resolve({ ok: false, status: +b.slice(6) });
    });
  };
}
let bboxN = 0;
const freshBbox = () => ({ south: 1, west: 2, north: 3, east: 4 + ++bboxN });

test('fetchOsm: hängender Server blockiert nicht, nächster wird parallel gefragt', async () => {
  const calls = [], seen = [];
  const data = await fetchOsm(freshBbox(), {
    endpoints: ['https://a/x', 'https://b/x', 'https://c/x'],
    fetchImpl: fakeFetch({ 'https://a/x': 'hang', 'https://b/x': 'hang', 'https://c/x': 5 }, calls),
    staggerMs: 20, timeoutMs: 1000, onProgress: p => seen.push(p.attempt),
  });
  assert.equal(data.elements[0].from, 'https://c/x');
  assert.deepEqual(seen, [1, 2, 3]);
});

test('fetchOsm: Fehler führt sofort zum nächsten Server', async () => {
  const calls = [];
  const t0 = Date.now();
  const data = await fetchOsm(freshBbox(), {
    endpoints: ['https://a/x', 'https://b/x'],
    fetchImpl: fakeFetch({ 'https://a/x': 'status406', 'https://b/x': 1 }, calls),
    staggerMs: 5000, timeoutMs: 5000,
  });
  assert.equal(data.elements[0].from, 'https://b/x');
  assert.ok(Date.now() - t0 < 1000);
});

test('fetchOsm: alle scheitern → Fehler mit Gründen, Zeitlimit greift', async () => {
  await assert.rejects(fetchOsm(freshBbox(), {
    endpoints: ['https://a/x', 'https://b/x'],
    fetchImpl: fakeFetch({ 'https://a/x': 'status406', 'https://b/x': 'hang' }, []),
    staggerMs: 10, timeoutMs: 50, retryDelayMs: 10,
  }), /a: HTTP 406; b: keine Antwort/);
});

test('fetchOsm: Abbruch durch Aufrufer liefert AbortError', async () => {
  const ctrl = new AbortController();
  const p = fetchOsm(freshBbox(), {
    signal: ctrl.signal, endpoints: ['https://a/x'],
    fetchImpl: fakeFetch({ 'https://a/x': 'hang' }, []), timeoutMs: 5000,
  });
  ctrl.abort();
  await assert.rejects(p, { name: 'AbortError' });
});

test('fetchOsm: Überlastung → zweite Runde, dauerhafte Fehler → keine', async () => {
  let n = 0;
  const flaky = (url, init) => fakeFetch({ 'https://a/x': n++ === 0 ? 'status429' : 1 }, [])(url, init);
  const rounds = [];
  const data = await fetchOsm(freshBbox(), {
    endpoints: ['https://a/x'], fetchImpl: flaky, retryDelayMs: 10, onProgress: p => rounds.push(p.round),
  });
  assert.equal(data.elements[0].from, 'https://a/x');
  assert.deepEqual(rounds, [1, 2]);

  const calls = [];
  await assert.rejects(fetchOsm(freshBbox(), {
    endpoints: ['https://a/x'], fetchImpl: fakeFetch({ 'https://a/x': 'status406' }, calls), retryDelayMs: 10,
  }), /HTTP 406/);
  assert.equal(calls.length, 1);
});
