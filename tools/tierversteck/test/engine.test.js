import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ANIMALS, TOTAL_CELLS, orient, orientations, placementCells, orientationMatrix, shapeSize } from '../src/engine/shapes.js';
import {
  placementProblem, validateFleet, isInFavorite, randomFleet, randomBoard, makeRng,
  isValidBoard, cellLabel, dominantTerrain, canonicalFleet,
} from '../src/engine/board.js';
import { newDefense, resolveShot, nextTurn, allFound, isFleetFound } from '../src/engine/rules.js';

const flat = (size, t = 'other') => ({ size, terrain: new Array(size * size).fill(t) });
const setT = (b, x, y, t) => { b.terrain[y * b.size + x] = t; return b; };

test('fünf Tiere mit zusammen 16 Feldern', () => {
  assert.equal(Object.keys(ANIMALS).length, 5);
  assert.equal(TOTAL_CELLS, 16);
});

test('Anzahl unterscheidbarer Orientierungen', () => {
  assert.equal(orientations('snake').length, 4);   // Z-Pentomino
  assert.equal(orientations('horse').length, 8);   // L-Tetromino
  assert.equal(orientations('dog').length, 2);
  assert.equal(orientations('cat').length, 4);
  assert.equal(orientations('mouse').length, 1);
});

test('Drehen und Spiegeln', () => {
  const L = ANIMALS.horse.cells;
  assert.deepEqual(orient(L, 0, false), [[0, 0], [0, 1], [0, 2], [1, 2]]);
  // 90° im Uhrzeigersinn: liegendes L, Fuß zeigt nach unten links
  assert.deepEqual(orient(L, 1, false), [[0, 0], [1, 0], [2, 0], [0, 1]]);
  assert.deepEqual(orient(L, 0, true), [[1, 0], [1, 1], [0, 2], [1, 2]]);
  // vier Drehungen ergeben wieder die Ausgangsform
  assert.deepEqual(orient(L, 4, false), orient(L, 0, false));
  assert.deepEqual(orientationMatrix(0, false), [1, 0, 0, 1]);
  assert.deepEqual(orientationMatrix(2, false), [-1, 0, 0, -1]);
  assert.deepEqual(shapeSize('dog', 1), { w: 1, h: 3 });
});

test('Platzierung: Rand, Überlappung, Berührung (auch diagonal)', () => {
  const dog = { animal: 'dog', x: 0, y: 0, rot: 0, flip: false };
  assert.equal(placementProblem(8, { ...dog, x: 6 }, []), 'bounds');
  assert.equal(placementProblem(8, dog, []), null);
  const mouse = { animal: 'mouse', x: 1, y: 0, rot: 0, flip: false };
  assert.equal(placementProblem(8, mouse, [dog]), 'overlap');
  assert.equal(placementProblem(8, { ...mouse, x: 3, y: 1 }, [dog]), 'touch');   // diagonal
  assert.equal(placementProblem(8, { ...mouse, x: 4, y: 1 }, [dog]), null);
  assert.equal(placementProblem(8, { ...mouse, x: 0, y: 2 }, [dog]), null);
});

test('validateFleet erkennt fehlende und doppelte Tiere', () => {
  const fleet = randomFleet(8, makeRng(1));
  assert.equal(validateFleet(8, fleet), null);
  assert.equal(validateFleet(8, fleet.slice(1)), 'count');
  assert.equal(validateFleet(8, [...fleet.slice(1), fleet[1]]), 'duplicate');
  assert.equal(validateFleet(8, fleet.map(p => ({ ...p, rot: 7 }))), 'shape');
});

test('randomFleet liefert auf allen Brettgrößen gültige Aufstellungen', () => {
  for (let size = 8; size <= 12; size++) {
    for (let seed = 0; seed < 20; seed++) {
      const f = randomFleet(size, makeRng(seed * 31 + size));
      assert.equal(validateFleet(size, f), null);
    }
  }
});

test('Lieblingsgelände: mindestens die Hälfte (aufgerundet)', () => {
  const b = flat(8);
  const snake = { animal: 'snake', x: 0, y: 0, rot: 0, flip: false };   // 5 Felder → 3 nötig
  const cells = placementCells(snake);
  setT(b, ...cells[0], 'forest'); setT(b, ...cells[1], 'forest');
  assert.equal(isInFavorite(b, snake), false);
  setT(b, ...cells[2], 'forest');
  assert.equal(isInFavorite(b, snake), true);
  const dog = { animal: 'dog', x: 0, y: 5, rot: 0, flip: false };       // 3 Felder → 2 nötig
  setT(b, 0, 5, 'road');
  assert.equal(isInFavorite(b, dog), false);
  setT(b, 1, 5, 'road');
  assert.equal(isInFavorite(b, dog), true);
  const mouse = { animal: 'mouse', x: 7, y: 7, rot: 0, flip: false };
  assert.equal(isInFavorite(b, mouse), false);
  setT(b, 7, 7, 'building');
  assert.equal(isInFavorite(b, mouse), true);
  // Wasser ist für kein Tier Lieblingsgelände
  for (const a of Object.values(ANIMALS)) assert.ok(!a.favorite.includes('water'));
});

test('resolveShot: Daneben, Treffer, Gefunden', () => {
  const b = flat(8);
  const fleet = [{ animal: 'dog', x: 0, y: 0, rot: 0, flip: false }];
  const d = newDefense();
  assert.equal(resolveShot(b, fleet, d, 5, 5).result, 'miss');
  assert.equal(resolveShot(b, fleet, d, 0, 0).result, 'hit');
  assert.equal(resolveShot(b, fleet, d, 1, 0).result, 'hit');
  const r = resolveShot(b, fleet, d, 2, 0);
  assert.equal(r.result, 'found');
  assert.equal(r.animal, 'dog');
  assert.deepEqual(r.cells, [[0, 0], [1, 0], [2, 0]]);
  assert.throws(() => resolveShot(b, fleet, d, 2, 0));
  assert.ok(allFound(fleet, d));
});

test('Konter nur beim ersten Treffer, nur im Lieblingsgelände, nie durch einen Konter', () => {
  const b = flat(8, 'road');
  const dog = { animal: 'dog', x: 0, y: 0, rot: 0, flip: false };
  const cat = { animal: 'cat', x: 5, y: 5, rot: 0, flip: false };   // steht auf Straße, nicht im Lieblingsgelände
  let d = newDefense();
  assert.equal(resolveShot(b, [dog, cat], d, 0, 0).counter, true);
  assert.equal(resolveShot(b, [dog, cat], d, 1, 0).counter, false);   // zweiter Treffer
  assert.equal(resolveShot(b, [dog, cat], d, 5, 5).counter, false);   // nicht im Lieblingsgelände
  d = newDefense();
  assert.equal(resolveShot(b, [dog], d, 0, 0, 'counter').counter, false);   // Konter löst keinen Konter aus
  assert.equal(resolveShot(b, [dog], d, 1, 0, 'normal').counter, false);    // und der erste Treffer ist verbraucht
  // Maus: Treffer = Gefunden, Konter trotzdem
  const bb = flat(8, 'building');
  const r = resolveShot(bb, [{ animal: 'mouse', x: 3, y: 3, rot: 0, flip: false }], newDefense(), 3, 3);
  assert.equal(r.result, 'found');
  assert.equal(r.counter, true);
});

test('Zugfolge: kein Extra-Schuss, Konter sofort, danach normaler Zug', () => {
  assert.deepEqual(nextTurn('host', 'normal', false), { turn: 'guest', kind: 'normal' });
  assert.deepEqual(nextTurn('host', 'normal', true), { turn: 'guest', kind: 'counter' });
  assert.deepEqual(nextTurn('guest', 'counter', false), { turn: 'guest', kind: 'normal' });
});

test('isFleetFound', () => {
  const shots = Object.keys(ANIMALS).map(a => ({ result: 'found', animal: a }));
  assert.ok(isFleetFound(shots));
  assert.ok(!isFleetFound(shots.slice(1)));
});

test('Bretter', () => {
  for (let size = 8; size <= 12; size++) assert.ok(isValidBoard(randomBoard(size, makeRng(size))));
  assert.ok(!isValidBoard({ size: 13, terrain: [] }));
  assert.ok(!isValidBoard({ size: 8, terrain: new Array(64).fill('lava') }));
  assert.equal(cellLabel(2, 6), 'C7');
  assert.equal(dominantTerrain(flat(8, 'building')), 'building');
  assert.equal(dominantTerrain(randomBoard(10, makeRng(3))), null);
});

test('canonicalFleet sortiert nach fester Reihenfolge', () => {
  const f = randomFleet(10, makeRng(9));
  assert.deepEqual(canonicalFleet([...f].reverse()), f);
});

test('placementFromCells findet die Orientierung', async () => {
  const { placementFromCells } = await import('../src/engine/shapes.js');
  for (const id of Object.keys(ANIMALS)) {
    for (const o of orientations(id)) {
      const p = { animal: id, x: 3, y: 2, rot: o.rot, flip: o.flip };
      const q = placementFromCells(id, placementCells(p));
      assert.deepEqual(placementCells(q), placementCells(p));
    }
  }
  assert.equal(placementFromCells('dog', [[0, 0], [1, 1], [2, 2]]), null);
});
