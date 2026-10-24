import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ANIMALS, TOTAL_REGIONS } from '../src/engine/shapes.js';
import {
  placementProblem, validateFleet, isInFavorite, randomFleet, makeRng, isConnected,
  isValidBoard, regionLabel, dominantTerrain, canonicalFleet,
} from '../src/engine/board.js';
import { newDefense, resolveShot, allFound, isFleetFound } from '../src/engine/rules.js';
import { randomBoard } from '../src/map/regions.js';
import { gridBoard } from './helpers.js';

const setT = (b, id, t) => { b.regions[id].t = t; return b; };

test('fünf Tiere auf zusammen 9 Orten', () => {
  assert.equal(Object.keys(ANIMALS).length, 5);
  assert.equal(TOTAL_REGIONS, 9);
});

test('Platzierung: Anzahl, Zusammenhang, Überlappung', () => {
  const b = gridBoard();
  const horse = { animal: 'horse', regions: [0, 1, 2] };
  assert.equal(placementProblem(b, horse), null);
  assert.equal(placementProblem(b, { animal: 'horse', regions: [0, 1] }), 'size');
  assert.equal(placementProblem(b, { animal: 'horse', regions: [0, 1, 1] }), 'size');
  assert.equal(placementProblem(b, { animal: 'horse', regions: [0, 1, 99] }), 'size');
  assert.equal(placementProblem(b, { animal: 'horse', regions: [0, 1, 3] }), 'apart');
  assert.equal(placementProblem(b, { animal: 'horse', regions: [0, 5, 10] }), 'apart');   // nur diagonal
  assert.equal(placementProblem(b, { animal: 'mouse', regions: [2] }, [horse]), 'overlap');
  assert.equal(placementProblem(b, { animal: 'mouse', regions: [3] }, [horse]), null);       // berühren ist erlaubt
  assert.ok(isConnected(b, [0, 4, 5, 6]));
  assert.ok(!isConnected(b, [0, 5]));
});

test('validateFleet erkennt fehlende und doppelte Tiere', () => {
  const b = gridBoard();
  const fleet = randomFleet(b, makeRng(1));
  assert.equal(validateFleet(b, fleet), null);
  assert.equal(validateFleet(b, fleet.slice(1)), 'count');
  assert.equal(validateFleet(b, [...fleet.slice(1), fleet[1]]), 'duplicate');
  assert.equal(validateFleet(b, fleet.map(p => ({ ...p, regions: 'x' }))), 'shape');
});

test('randomFleet liefert gültige Aufstellungen', () => {
  for (let seed = 0; seed < 30; seed++) {
    const b = seed % 2 ? gridBoard() : randomBoard(makeRng(seed), { n: 96, targetCount: 25 });
    const f = randomFleet(b, makeRng(seed * 31));
    assert.equal(validateFleet(b, f), null);
  }
});

test('Lieblingsgelände: mindestens die Hälfte (aufgerundet)', () => {
  const b = gridBoard();
  const horse = { animal: 'horse', regions: [0, 1, 2] };   // 3 Orte → 2 nötig
  setT(b, 0, 'green');
  assert.equal(isInFavorite(b, horse), false);
  setT(b, 2, 'green');
  assert.equal(isInFavorite(b, horse), true);
  const dog = { animal: 'dog', regions: [4, 5] };          // 2 Orte → 1 nötig
  assert.equal(isInFavorite(b, dog), false);
  setT(b, 5, 'plaza');
  assert.equal(isInFavorite(b, dog), true);
  assert.equal(isInFavorite(b, { animal: 'mouse', regions: [15] }), true);
  // Wasser ist für kein Tier Lieblingsgelände
  for (const a of Object.values(ANIMALS)) assert.ok(!a.favorite.includes('water'));
});

test('resolveShot: Daneben, Treffer, Gefunden', () => {
  const b = gridBoard();
  const fleet = [{ animal: 'horse', regions: [0, 1, 2] }];
  const d = newDefense();
  assert.equal(resolveShot(b, fleet, d, 15).result, 'miss');
  assert.equal(resolveShot(b, fleet, d, 0).result, 'hit');
  assert.equal(resolveShot(b, fleet, d, 1).result, 'hit');
  const r = resolveShot(b, fleet, d, 2);
  assert.equal(r.result, 'found');
  assert.equal(r.animal, 'horse');
  assert.deepEqual(r.regions, [0, 1, 2]);
  assert.throws(() => resolveShot(b, fleet, d, 2));
  assert.ok(allFound(fleet, d));
});

test('Spuren: nur bei Daneben, nur neben Tieren außerhalb des Lieblingsgeländes', () => {
  const b = gridBoard();
  const dog = { animal: 'dog', regions: [0, 1] };       // auf Häusern → hinterlässt Spuren
  const cat = { animal: 'cat', regions: [15] };         // auf Häusern = Lieblingsgelände → keine Spuren
  const fleet = [dog, cat];
  let d = newDefense();
  assert.equal(resolveShot(b, fleet, d, 2).tracks, true);    // Nachbar von 1
  assert.equal(resolveShot(b, fleet, d, 5).tracks, true);    // Nachbar von 1 (unten)
  assert.equal(resolveShot(b, fleet, d, 14).tracks, false);  // Nachbar der Katze
  assert.equal(resolveShot(b, fleet, d, 10).tracks, false);  // diagonal zählt nicht
  assert.equal(resolveShot(b, fleet, d, 0).tracks, false);   // Treffer: nie Spuren
  resolveShot(b, fleet, d, 1);                               // Hund gefunden
  assert.equal(resolveShot(b, fleet, d, 4).tracks, false);   // gefundene Tiere hinterlassen keine Spuren
  // Hund auf einem Platz → im Lieblingsgelände → unsichtbar
  setT(b, 1, 'plaza');
  d = newDefense();
  assert.equal(resolveShot(b, fleet, d, 2).tracks, false);
});

test('isFleetFound', () => {
  const shots = Object.keys(ANIMALS).map(a => ({ result: 'found', animal: a }));
  assert.ok(isFleetFound(shots));
  assert.ok(!isFleetFound(shots.slice(1)));
});

test('Bretter prüfen', () => {
  const b = gridBoard();
  assert.ok(isValidBoard(b));
  assert.ok(!isValidBoard({ ...b, regions: b.regions.slice(0, 5), adj: b.adj.slice(0, 5) }));
  assert.ok(!isValidBoard(setT(gridBoard(), 0, 'lava')));
  const asym = gridBoard();
  asym.adj[0] = [1, 4, 7];
  assert.ok(!isValidBoard(asym));
  const nan = gridBoard();
  nan.regions[3].p = [[0, NaN, 1, 1, 2, 2]];
  assert.ok(!isValidBoard(nan));
  assert.ok(!isValidBoard({ ...gridBoard(), lines: [{ k: 'lava', w: 1, p: [[0, 0, 1, 1]] }] }));
  assert.equal(regionLabel(6), 'Ort 7');
  assert.equal(dominantTerrain(gridBoard()), 'house');
  assert.equal(dominantTerrain(setT(setT(setT(setT(gridBoard(), 0, 'green'), 1, 'forest'), 2, 'water'), 3, 'plaza')), null);
});

test('canonicalFleet sortiert Tiere und Orte', () => {
  const b = gridBoard();
  const f = randomFleet(b, makeRng(9));
  const shuffled = [...f].reverse().map(p => ({ ...p, regions: [...p.regions].reverse() }));
  assert.deepEqual(canonicalFleet(shuffled), f);
});
