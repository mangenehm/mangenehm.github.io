import { test } from 'node:test';
import assert from 'node:assert/strict';

import { classifyTags, poiInfo, toPois, stitchRings, simplify, clipRing, clipLine, toFeatures, makeProjection, buildQuery, fetchOsm } from '../src/map/overpass.js';
import { classesFromPixels, RASTER_COLORS, CLASS, areaOrder } from '../src/map/classify.js';
import { segment, describe, decideTerrain, along, nameRegions, outlines, components, mergeSmall, splitLarge, buildBoard, randomBoard, ringArea } from '../src/map/regions.js';
import { shiftCenter } from '../src/map/build.js';
import { isValidBoard, makeRng } from '../src/engine/board.js';

test('OSM-Tags → Geländeklassen', () => {
  assert.equal(classifyTags({ building: 'yes' }).c, 'building');
  assert.equal(classifyTags({ building: 'no' }), null);
  assert.equal(classifyTags({ natural: 'water' }).c, 'water');
  assert.deepEqual(classifyTags({ waterway: 'river' }), { c: 'water', k: 'l', w: 16, b: true });
  assert.equal(classifyTags({ waterway: 'ditch' }).b, false);
  assert.equal(classifyTags({ landuse: 'forest' }).c, 'forest');
  assert.equal(classifyTags({ natural: 'scrub' }).c, 'forest');
  assert.equal(classifyTags({ landuse: 'meadow' }).c, 'green');
  assert.equal(classifyTags({ leisure: 'park' }).c, 'green');
  assert.equal(classifyTags({ leisure: 'playground' }, true).c, 'plaza');
  assert.equal(classifyTags({ amenity: 'school' }, true).c, 'plaza');
  assert.equal(classifyTags({ amenity: 'school' }, false), null);
  assert.deepEqual(classifyTags({ highway: 'residential' }), { c: 'road', k: 'l', w: 7, b: true });
  assert.equal(classifyTags({ highway: 'service' }).b, false);
  assert.equal(classifyTags({ highway: 'footway' }).c, 'path');
  assert.equal(classifyTags({ highway: 'primary', tunnel: 'yes' }), null);
  assert.equal(classifyTags({ highway: 'pedestrian', area: 'yes' }, true).c, 'plaza');
  assert.equal(classifyTags({ railway: 'rail' }).b, true);
  assert.equal(classifyTags({ railway: 'tram' }).b, false);
  assert.equal(classifyTags({ landuse: 'residential' }), null);
  assert.equal(classifyTags({ amenity: 'bench' }), null);
  assert.equal(poiInfo({ amenity: 'school' }).e, '🏫');
  assert.equal(poiInfo({ amenity: 'bench' }), null);
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
  const moved = shiftCenter({ lat: 52.5, lon: 13.4 }, 30, 0);
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
  osm.elements[1].tags.name = 'Lindenstraße';
  osm.elements.push({ type: 'node', lat: midLat, lon: (west + east) / 2, tags: { amenity: 'school', name: 'Grundschule' } });
  osm.elements.push({ type: 'way', center: { lat: midLat, lon: west - 1 }, tags: { amenity: 'school' } });   // außerhalb
  const f = toFeatures(osm, pr, 8, 25);
  assert.equal(f.length, 2);
  assert.equal(f[0].c, 'building');
  assert.equal(f[1].c, 'road');
  assert.equal(f[1].w, 7 / 25);
  assert.equal(f[1].b, true);
  assert.equal(f[1].n, 'Lindenstraße');
  const pois = toPois(osm, pr, 8);
  assert.equal(pois.length, 1);
  assert.equal(pois[0].n, 'Grundschule');
  assert.equal(pois[0].names, true);
  assert.match(buildQuery(pr.bbox), /out center;/);
});

test('Pixel → Klassen: Mischfarben gehen an die nächste Klasse', () => {
  const data = new Uint8ClampedArray(4 * 4);
  data.set([...RASTER_COLORS[CLASS.building], 255], 0);
  data.set([10, 240, 20, 255], 4);          // fast Grün
  data.set([0, 0, 200, 255], 8);            // fast Wasser
  data.set([...RASTER_COLORS[CLASS.other], 255], 12);
  assert.deepEqual([...classesFromPixels(data, 2)], [CLASS.building, CLASS.green, CLASS.water, CLASS.other]);
  // große Flächen zuerst, Gebäude zuletzt
  const sq = (c, s) => ({ c, k: 'a', p: [[0, 0, s, 0, s, s, 0, s]] });
  assert.deepEqual(areaOrder([sq('building', 1), sq('water', 2), sq('green', 9)]).map(x => x.c), ['green', 'water', 'building']);
});

/** n × n Raster mit Straßenkreuz in der Mitte; optional Grünfläche oben rechts. */
function crossRaster(n = 64, { green = false } = {}) {
  const cls = new Uint8Array(n * n).fill(CLASS.building);
  const barrier = new Uint8Array(n * n);
  const mid = n / 2;
  for (let i = 0; i < n; i++) for (const k of [mid - 1, mid]) { barrier[k * n + i] = 1; barrier[i * n + k] = 1; }
  if (green) for (let y = 0; y < mid - 1; y++) for (let x = mid + 1; x < n; x++) cls[y * n + x] = CLASS.green;
  return { cls, barrier, n };
}

test('Straßenkreuz → vier Blöcke, Nachbarn über die Straße, nicht über Eck', () => {
  const r = crossRaster(64, { green: true });
  const seg = segment({ ...r, targetCount: 4 });
  assert.equal(seg.count, 4);
  const d = describe({ ...seg, n: r.n, cls: r.cls });
  assert.deepEqual(d.regions.map(x => x.t), ['house', 'green', 'house', 'house']);
  // 0 oben links, 1 oben rechts, 2 unten links, 3 unten rechts
  assert.deepEqual(d.adj, [[1, 2], [0, 3], [0, 3], [1, 2]]);
  d.regions.forEach((reg, i) => {
    assert.equal(reg.p.length, 1);
    assert.ok(Math.abs(ringArea(reg.p[0])) > 900);
    // Beschriftungspunkt liegt im eigenen Block
    const [x, y] = reg.c;
    assert.equal(seg.labels[Math.floor(y) * r.n + Math.floor(x)], i);
  });
});

test('Krümel werden verschmolzen, Riesen geteilt', () => {
  const n = 40;
  const key = new Int16Array(n * n);
  key[0] = 1;                                        // ein einzelnes Pixel
  const c = components(key, n);
  assert.equal(c.count, 2);
  assert.equal(mergeSmall(c.labels, n, c.count, 10), 1);
  const labels = new Int32Array(n * n);
  const count = splitLarge(labels, n, 1, 400, 400);
  assert.equal(count, 4);
  const sizes = new Array(count).fill(0);
  for (const l of labels) sizes[l]++;
  assert.ok(sizes.every(s => s > 250 && s < 550), sizes.join());
});

test('Aufteilung ist deterministisch', () => {
  const r = crossRaster(64);
  const a = segment({ ...r, targetCount: 10 }), b = segment({ ...r, targetCount: 10 });
  assert.deepEqual([...a.labels], [...b.labels]);
  assert.ok(a.count >= 6 && a.count <= 16, String(a.count));
});

test('Gelände je Ort', () => {
  const counts = o => [o.other || 0, o.building || 0, o.water || 0, o.forest || 0, o.green || 0, o.plaza || 0];
  assert.equal(decideTerrain(counts({ water: 60, other: 40 })), 'water');
  assert.equal(decideTerrain(counts({ forest: 45, other: 55 })), 'forest');
  assert.equal(decideTerrain(counts({ green: 30, forest: 25, other: 45 })), 'green');
  assert.equal(decideTerrain(counts({ building: 20, other: 80 })), 'house');
  assert.equal(decideTerrain(counts({ plaza: 40, building: 20, other: 40 })), 'plaza');
  assert.equal(decideTerrain(counts({ other: 100 })), 'green');
  assert.equal(decideTerrain(counts({ building: 8, other: 92 })), 'plaza');
});

test('Namen: Fläche > Wahrzeichen > Straße > Gelände', () => {
  assert.equal(along('Lindenstraße'), 'an der Lindenstraße');
  assert.equal(along('Mühlweg'), 'am Mühlweg');
  assert.equal(along('Unter den Linden'), 'an Unter den Linden');
  const r = crossRaster(64, { green: true });
  const seg = segment({ ...r, targetCount: 4 });
  const { regions } = describe({ ...seg, n: r.n, cls: r.cls });
  const features = [
    { c: 'green', k: 'a', n: 'Stadtpark', p: [[33, 0, 64, 0, 64, 31, 33, 31]] },
    { c: 'road', k: 'l', w: 2, b: true, n: 'Hauptstraße', p: [[0, 31.5, 64, 31.5]] },
  ];
  const pois = [{ e: '🏫', rank: 1, names: true, n: 'Grundschule', x: 10, y: 50 }];
  nameRegions(regions, seg.labels, r.n, features, pois);
  assert.deepEqual(regions.map(x => x.n), ['Häuser an der Hauptstraße', 'Stadtpark', 'Grundschule', 'Häuser an der Hauptstraße']);
});

test('Umrisse: geschlossene Ringe, Loch als zweiter Ring', () => {
  const n = 10;
  const labels = new Int32Array(n * n);
  for (let y = 3; y < 7; y++) for (let x = 3; x < 7; x++) labels[y * n + x] = 1;
  const rings = outlines(labels, n, 2, 0);
  assert.equal(rings[0].length, 2);
  assert.equal(rings[1].length, 1);
  const areas = rings[0].map(ringArea).map(Math.abs).sort((a, b) => a - b);
  assert.deepEqual(areas, [16, 100]);
});

test('buildBoard und randomBoard ergeben gültige Bretter', () => {
  const r = crossRaster(96, { green: true });
  const b = buildBoard({ ...r, targetCount: 16, features: [], pois: [] });
  assert.ok(isValidBoard(b), 'buildBoard');
  for (let seed = 0; seed < 5; seed++) {
    const rb = randomBoard(makeRng(seed));
    assert.ok(isValidBoard(rb), 'randomBoard ' + seed);
    assert.ok(rb.regions.length >= 28 && rb.regions.length <= 40, String(rb.regions.length));
    assert.ok(new Set(rb.regions.map(x => x.t)).size >= 4);
  }
  assert.deepEqual(randomBoard(makeRng(3)), randomBoard(makeRng(3)));
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
