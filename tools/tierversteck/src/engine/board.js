/* Spielbrett: Zellen, Geländeklassen, Platzierungsprüfung. */

import { ANIMALS, ANIMAL_IDS, TERRAINS, orientations, placementCells } from './shapes.js';

export const MIN_SIZE = 8;
export const MAX_SIZE = 12;
const COLS = 'ABCDEFGHIJKL';

export function cellIndex(size, x, y) { return y * size + x; }
export function inBounds(size, x, y) { return x >= 0 && y >= 0 && x < size && y < size; }

/** „C7“ für x=2, y=6 */
export function cellLabel(x, y) { return COLS[x] + (y + 1); }
export function colLabel(x) { return COLS[x]; }

/** Prüft ein empfangenes oder erzeugtes Brett auf Plausibilität. */
export function isValidBoard(board) {
  return !!board
    && Number.isInteger(board.size) && board.size >= MIN_SIZE && board.size <= MAX_SIZE
    && Array.isArray(board.terrain) && board.terrain.length === board.size * board.size
    && board.terrain.every(t => TERRAINS.includes(t))
    && (board.features === undefined || isValidFeatures(board.features))
    && (board.label === undefined || (typeof board.label === 'string' && board.label.length <= 200));
}

const MAX_FEATURE_NUMBERS = 400000;

/** Karten-Geometrie (vom Gegner empfangen) auf Form prüfen, damit das Zeichnen nicht scheitert. */
export function isValidFeatures(features) {
  if (!Array.isArray(features)) return false;
  let numbers = 0;
  for (const f of features) {
    if (!f || !TERRAINS.includes(f.c) || (f.k !== 'a' && f.k !== 'l') || !Array.isArray(f.p)) return false;
    if (f.k === 'l' && !(Number.isFinite(f.w) && f.w >= 0 && f.w < 10)) return false;
    for (const pts of f.p) {
      if (!Array.isArray(pts) || pts.length % 2) return false;
      numbers += pts.length;
      if (numbers > MAX_FEATURE_NUMBERS) return false;
      for (const v of pts) if (!Number.isFinite(v) || Math.abs(v) > 100) return false;
    }
  }
  return true;
}

export function terrainAt(board, x, y) { return board.terrain[cellIndex(board.size, x, y)]; }

/** Anteil je Geländeklasse, z. B. { building: 0.4, … } */
export function terrainShares(board) {
  const shares = Object.fromEntries(TERRAINS.map(t => [t, 0]));
  for (const t of board.terrain) shares[t] += 1 / board.terrain.length;
  return shares;
}

/** Warnung, wenn eine Klasse das Brett dominiert (über 80 %). */
export function dominantTerrain(board, limit = 0.8) {
  const shares = terrainShares(board);
  return TERRAINS.find(t => shares[t] > limit) || null;
}

/**
 * Tier „im Lieblingsgelände“: mindestens die Hälfte seiner Felder
 * (aufgerundet) liegt auf einer seiner Lieblingsklassen.
 */
export function favoriteCount(board, p) {
  const fav = ANIMALS[p.animal].favorite;
  return placementCells(p).filter(([x, y]) => inBounds(board.size, x, y) && fav.includes(terrainAt(board, x, y))).length;
}

export function isInFavorite(board, p) {
  return favoriteCount(board, p) >= Math.ceil(ANIMALS[p.animal].cells.length / 2);
}

/**
 * Probleme einer einzelnen Platzierung gegenüber den übrigen:
 * 'bounds' (ragt hinaus), 'overlap' (überlappt), 'touch' (berührt, auch diagonal).
 */
export function placementProblem(size, p, others) {
  const cells = placementCells(p);
  if (cells.some(([x, y]) => !inBounds(size, x, y))) return 'bounds';
  let touch = false;
  for (const o of others) {
    if (!o || o.animal === p.animal) continue;
    for (const [ox, oy] of placementCells(o)) {
      for (const [x, y] of cells) {
        const dx = Math.abs(ox - x), dy = Math.abs(oy - y);
        if (dx === 0 && dy === 0) return 'overlap';
        if (dx <= 1 && dy <= 1) touch = true;
      }
    }
  }
  return touch ? 'touch' : null;
}

function isPlacementShape(p) {
  return !!p && ANIMAL_IDS.includes(p.animal)
    && Number.isInteger(p.x) && Number.isInteger(p.y)
    && Number.isInteger(p.rot) && p.rot >= 0 && p.rot < 4
    && typeof p.flip === 'boolean';
}

/** Vollständige, regelkonforme Aufstellung: jedes Tier genau einmal, nichts kollidiert. */
export function validateFleet(size, placements) {
  if (!Array.isArray(placements) || placements.length !== ANIMAL_IDS.length) return 'count';
  if (!placements.every(isPlacementShape)) return 'shape';
  const ids = new Set(placements.map(p => p.animal));
  if (ids.size !== ANIMAL_IDS.length) return 'duplicate';
  for (const p of placements) {
    const problem = placementProblem(size, p, placements);
    if (problem) return problem;
  }
  return null;
}

/** Normalisierte Kopie in fester Tier-Reihenfolge (für Hash und Versand). */
export function canonicalFleet(placements) {
  return ANIMAL_IDS.map(id => {
    const p = placements.find(q => q.animal === id);
    return { animal: id, x: p.x, y: p.y, rot: p.rot, flip: !!p.flip };
  });
}

/** Deterministischer Zufallsgenerator (mulberry32) für Tests und Zufallsgelände. */
export function makeRng(seed = Date.now()) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Zufällige gültige Aufstellung; große Tiere zuerst, mit Neustart bei Sackgasse. */
export function randomFleet(size, rng = Math.random) {
  const order = [...ANIMAL_IDS].sort((a, b) => ANIMALS[b].cells.length - ANIMALS[a].cells.length);
  for (let attempt = 0; attempt < 200; attempt++) {
    const placed = [];
    let ok = true;
    for (const id of order) {
      const options = [];
      for (const o of orientations(id)) {
        for (let y = 0; y < size; y++) {
          for (let x = 0; x < size; x++) {
            const p = { animal: id, x, y, rot: o.rot, flip: o.flip };
            if (!placementProblem(size, p, placed)) options.push(p);
          }
        }
      }
      if (!options.length) { ok = false; break; }
      placed.push(options[Math.floor(rng() * options.length)]);
    }
    if (ok) return canonicalFleet(placed);
  }
  throw new Error('Keine Aufstellung gefunden');
}

/**
 * Zufallsgelände ohne Karte: Flecken je Klasse wachsen per Zufallsschritt,
 * Straßen laufen als gerade Linien durch.
 */
export function randomBoard(size, rng = Math.random) {
  const terrain = new Array(size * size).fill('other');
  const roads = 1 + Math.floor(rng() * 2);
  for (let r = 0; r < roads; r++) {
    const horizontal = rng() < 0.5;
    const at = 1 + Math.floor(rng() * (size - 2));
    for (let i = 0; i < size; i++) {
      terrain[horizontal ? cellIndex(size, i, at) : cellIndex(size, at, i)] = 'road';
    }
  }
  const blobs = [['green', 3], ['forest', 2], ['building', 4], ['water', 1]];
  for (const [cls, count] of blobs) {
    for (let b = 0; b < count; b++) {
      let x = Math.floor(rng() * size), y = Math.floor(rng() * size);
      const steps = Math.floor(size * (cls === 'building' ? 0.8 : 1.4));
      for (let s = 0; s < steps; s++) {
        const i = cellIndex(size, x, y);
        if (terrain[i] !== 'road') terrain[i] = cls;
        const dir = Math.floor(rng() * 4);
        x = Math.min(size - 1, Math.max(0, x + [1, -1, 0, 0][dir]));
        y = Math.min(size - 1, Math.max(0, y + [0, 0, 1, -1][dir]));
      }
    }
  }
  return { size, terrain, source: 'random' };
}
