import { test } from 'node:test';
import assert from 'node:assert/strict';

import { tileXY, tilesFor, tileToLatLon, tilesToOsm } from '../src/map/tiles.js';
import { fetchOsm, classifyTags, toFeatures, toPois, makeProjection } from '../src/map/overpass.js';

test('Kachel-Mathematik: Punkt → Kachel → Ecke zurück', () => {
  const [x, y] = tileXY(51.9625, 7.6256, 14);
  assert.deepEqual([x, y], [8539, 5414]);
  const nw = tileToLatLon(14, x, y, 0, 0), se = tileToLatLon(14, x, y, 4096, 4096);
  assert.ok(nw.lat > 51.9625 && se.lat < 51.9625 && nw.lon < 7.6256 && se.lon > 7.6256);
  const box = makeProjection({ lat: 51.9625, lon: 7.6256 }, 1, 1260).bbox;
  const t = tilesFor(box, 14);
  assert.ok(t.length >= 1 && t.length <= 4);
  assert.ok(t.some(([a, b]) => a === x && b === y));
});

// Nachbau der VectorTile-Schnittstelle: Geometrie in Kachelkoordinaten
const feat = (type, properties, geom) => ({ type, properties, loadGeometry: () => geom.map(r => r.map(([px, py]) => ({ x: px, y: py }))) });
const layer = feats => ({ extent: 4096, length: feats.length, feature: i => feats[i] });
const square = (a, b) => [[[a, a], [b, a], [b, b], [a, b], [a, a]]];

test('tilesToOsm: OpenMapTiles-Klassen werden zu OSM-Tags', () => {
  const [x, y] = tileXY(51.9625, 7.6256, 14);
  const tile = { layers: {
    building: layer([feat(3, {}, square(100, 200))]),
    landcover: layer([feat(3, { class: 'wood', subclass: 'forest' }, square(300, 600)), feat(3, { class: 'grass', subclass: 'park', name: 'Schlossgarten' }, square(700, 900))]),
    landuse: layer([feat(3, { class: 'school' }, square(1000, 1100)), feat(3, { class: 'pitch' }, square(1200, 1300))]),
    water: layer([feat(3, { class: 'lake' }, square(1400, 1500))]),
    waterway: layer([feat(2, { class: 'river' }, [[[0, 2000], [4096, 2000]]]), feat(2, { class: 'stream', brunnel: 'tunnel' }, [[[0, 2100], [4096, 2100]]])]),
    transportation: layer([
      feat(2, { class: 'minor' }, [[[0, 3000], [2000, 3000], [4096, 3000]]]),
      feat(2, { class: 'primary', ramp: 1 }, [[[0, 3100], [4096, 3100]]]),
      feat(2, { class: 'path', subclass: 'steps' }, [[[0, 3200], [4096, 3200]]]),
      feat(2, { class: 'rail', subclass: 'tram' }, [[[0, 3300], [4096, 3300]]]),
      feat(2, { class: 'service', brunnel: 'tunnel' }, [[[0, 3400], [4096, 3400]]]),
      feat(3, { class: 'path', subclass: 'pedestrian' }, square(2000, 2400)),
      feat(3, { class: 'bridge' }, square(2500, 2600)),
    ]),
    transportation_name: layer([feat(2, { class: 'minor', name: 'Lindenstraße' }, [[[0, 3000], [2000, 3000], [4096, 3000]]])]),
    poi: layer([feat(1, { class: 'school', subclass: 'school', name: 'Grundschule' }, [[[150, 150]]]), feat(1, { class: 'waste_basket', subclass: 'waste_basket' }, [[[160, 160]]])]),
  } };
  const box = { south: 50, west: 6, north: 53, east: 9 };
  const { elements } = tilesToOsm([{ z: 14, x, y, tile }], box);
  const classes = elements.filter(e => e.type !== 'node').map(e => classifyTags(e.tags, e.type !== 'way' || e.tags.area === 'yes')?.c ?? null);
  // Reihenfolge der Ebenen: building, water, landcover, landuse, waterway, transportation (Brücken-Umriss fällt weg)
  assert.deepEqual(classes, ['building', 'water', 'forest', 'green', 'plaza', 'plaza', 'water', null, 'road', 'road', 'path', 'rail', null, 'plaza']);
  assert.equal(elements.find(e => e.tags.leisure === 'park').tags.name, 'Schlossgarten');
  assert.equal(elements.find(e => e.tags.highway === 'residential').tags.name, 'Lindenstraße');
  assert.equal(elements.find(e => e.tags.highway === 'primary_link').tags.name, undefined);
  assert.equal(elements.filter(e => e.type === 'node').length, 1, 'nur bekannte Wahrzeichen');

  // durchgereicht bis zu Features und Wahrzeichen
  const c = tileToLatLon(14, x, y, 2048, 2048);
  const proj = makeProjection(c, 64, 1600 / 64);
  const f = toFeatures({ elements }, proj, 64, 25);
  assert.ok(f.some(q => q.c === 'road' && q.n === 'Lindenstraße'));
  const pois = toPois({ elements }, proj, 64);
  assert.equal(pois.length, 1);
  assert.equal(pois[0].n, 'Grundschule');
});

test('tilesToOsm: Elemente außerhalb der bbox fallen weg', () => {
  const tile = { layers: { building: layer([feat(3, {}, square(0, 10)), feat(3, {}, square(4000, 4090))]) } };
  const sw = tileToLatLon(14, 100, 100, 2048, 4096), ne = tileToLatLon(14, 100, 100, 4096, 2048);
  const { elements } = tilesToOsm([{ z: 14, x: 100, y: 100, tile }], { south: sw.lat, west: sw.lon, north: ne.lat, east: ne.lon });
  assert.equal(elements.length, 1);
});

test('fetchOsm: Kacheln nicht erreichbar → Overpass', async () => {
  const calls = [];
  const fetchImpl = async url => {
    calls.push(url);
    if (url.includes('openfreemap')) return { ok: false, status: 503 };
    return { ok: true, json: async () => ({ elements: [{ from: url }] }) };
  };
  const warn = console.warn;
  console.warn = () => {};
  try {
    const data = await fetchOsm({ south: 7, west: 7, north: 7.001, east: 7.001 }, { endpoints: ['https://a/x'], fetchImpl });
    assert.equal(data.elements[0].from, 'https://a/x');
    assert.ok(calls[0].includes('openfreemap'));
  } finally { console.warn = warn; }
});
