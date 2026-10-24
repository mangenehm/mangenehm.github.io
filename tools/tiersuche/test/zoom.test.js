import test from 'node:test';
import assert from 'node:assert/strict';
import { clampView, zoomAt, toBoard, MAX_Z } from '../src/ui/zoom.js';

test('Zoom bleibt auf dem Brett', () => {
  assert.deepEqual(clampView({ z: 0.5, tx: 40, ty: -5 }, 300), { z: 1, tx: 0, ty: 0 });
  assert.deepEqual(clampView({ z: 2, tx: 500, ty: -5 }, 300), { z: 2, tx: 300, ty: 0 });
  assert.equal(clampView({ z: 9, tx: 0, ty: 0 }, 300).z, MAX_Z);
});

test('Zoomen hält den Punkt unter dem Finger fest', () => {
  const v = zoomAt({ z: 1, tx: 0, ty: 0 }, 300, 2.5, 120, 60);
  assert.equal(v.z, 2.5);
  // derselbe Brettpunkt liegt vorher und nachher bei (120, 60)
  assert.deepEqual(toBoard(120, 60, v, 2), toBoard(120, 60, { z: 1, tx: 0, ty: 0 }, 2));
  // zurück auf 1 → Übersicht ohne Versatz
  assert.deepEqual(zoomAt(v, 300, 1, 10, 10), { z: 1, tx: 0, ty: 0 });
});

test('Sichtfenster → Brett-Einheiten', () => {
  assert.deepEqual(toBoard(100, 50, { z: 1, tx: 0, ty: 0 }, 2), [50, 25]);
  assert.deepEqual(toBoard(100, 50, { z: 2, tx: 100, ty: 0 }, 2), [50, 12.5]);
});
