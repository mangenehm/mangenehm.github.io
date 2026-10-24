/*
 * Spielbrett aus echten Orten: Regionen mit Gelände, Nachbarschaftsgraph,
 * Platzierungsprüfung.
 *
 * board = {
 *   size,                       Ausdehnung der Koordinaten (0 … size, y nach unten)
 *   regions: [{ t, n, c, p }],  Gelände, Name, Beschriftungspunkt [x, y], Ringe [[x0, y0, …], …]
 *   adj: [[id, …], …],          Nachbarn je Region (symmetrisch)
 *   lines: [{ k, w, p, n? }],   Straßen/Wege/Bahn/Bäche nur zum Zeichnen
 *   pois: [{ e, x, y, n? }],    Wahrzeichen als Emoji
 *   label, center, source
 * }
 * Platzierung = { animal, regions: [id, …] }
 */

import { ANIMALS, ANIMAL_IDS, TERRAINS } from './shapes.js';

export const MIN_REGIONS = 12;
export const MAX_REGIONS = 120;
const MAX_NUMBERS = 300000;
const LINE_KINDS = ['road', 'path', 'rail', 'water'];

/** „Ort 7“ – Nummern beginnen bei 1. */
export function regionLabel(id) { return 'Ort ' + (id + 1); }

const isNum = (v, lim) => Number.isFinite(v) && Math.abs(v) <= lim;

/** Prüft ein empfangenes oder erzeugtes Brett auf Plausibilität. */
export function isValidBoard(board) {
  if (!board || !Number.isFinite(board.size) || board.size < 16 || board.size > 1024) return false;
  const { regions, adj } = board;
  if (!Array.isArray(regions) || regions.length < MIN_REGIONS || regions.length > MAX_REGIONS) return false;
  if (!Array.isArray(adj) || adj.length !== regions.length) return false;
  if (board.label !== undefined && !(typeof board.label === 'string' && board.label.length <= 200)) return false;
  const lim = board.size * 2;
  let numbers = 0;
  const rings = list => Array.isArray(list) && list.every(pts => {
    if (!Array.isArray(pts) || pts.length % 2) return false;
    numbers += pts.length;
    return numbers <= MAX_NUMBERS && pts.every(v => isNum(v, lim));
  });
  for (const r of regions) {
    if (!r || !TERRAINS.includes(r.t) || typeof r.n !== 'string' || r.n.length > 80) return false;
    if (!Array.isArray(r.c) || r.c.length !== 2 || !r.c.every(v => isNum(v, lim))) return false;
    if (!rings(r.p) || !r.p.length) return false;
  }
  for (let i = 0; i < adj.length; i++) {
    const a = adj[i];
    if (!Array.isArray(a) || a.length > regions.length) return false;
    for (const j of a) {
      if (!Number.isInteger(j) || j < 0 || j >= regions.length || j === i || !adj[j]?.includes?.(i)) return false;
    }
  }
  if (board.lines !== undefined) {
    if (!Array.isArray(board.lines) || board.lines.length > 5000) return false;
    for (const l of board.lines) {
      if (!l || !LINE_KINDS.includes(l.k) || !isNum(l.w, 50) || l.w < 0 || !rings(l.p)) return false;
      if (l.n !== undefined && (typeof l.n !== 'string' || l.n.length > 80)) return false;
    }
  }
  if (board.pois !== undefined) {
    if (!Array.isArray(board.pois) || board.pois.length > 100) return false;
    for (const p of board.pois) {
      if (!p || typeof p.e !== 'string' || p.e.length > 8 || !isNum(p.x, lim) || !isNum(p.y, lim)) return false;
      if (p.n !== undefined && (typeof p.n !== 'string' || p.n.length > 80)) return false;
    }
  }
  return true;
}

export function terrainOf(board, id) { return board.regions[id].t; }

/** Anteil je Geländeklasse über alle Orte, z. B. { house: 0.4, … } */
export function terrainShares(board) {
  const shares = Object.fromEntries(TERRAINS.map(t => [t, 0]));
  for (const r of board.regions) shares[r.t] += 1 / board.regions.length;
  return shares;
}

/** Warnung, wenn eine Klasse das Brett dominiert (über 80 %). */
export function dominantTerrain(board, limit = 0.8) {
  const shares = terrainShares(board);
  return TERRAINS.find(t => shares[t] > limit) || null;
}

/**
 * Tier „im Lieblingsgelände“: mindestens die Hälfte seiner Orte
 * (aufgerundet) hat eine seiner Lieblingsklassen.
 */
export function favoriteCount(board, p) {
  const fav = ANIMALS[p.animal].favorite;
  return p.regions.filter(id => board.regions[id] && fav.includes(board.regions[id].t)).length;
}

export function isInFavorite(board, p) {
  return favoriteCount(board, p) >= Math.ceil(ANIMALS[p.animal].size / 2);
}

/** Hängen die Orte über den Nachbarschaftsgraphen zusammen? */
export function isConnected(board, ids) {
  if (!ids.length) return false;
  const want = new Set(ids);
  const seen = new Set([ids[0]]);
  const queue = [ids[0]];
  while (queue.length) {
    const r = queue.pop();
    for (const n of board.adj[r]) if (want.has(n) && !seen.has(n)) { seen.add(n); queue.push(n); }
  }
  return seen.size === want.size;
}

/**
 * Probleme einer einzelnen Platzierung gegenüber den übrigen:
 * 'size' (falsche Anzahl/unbekannter Ort), 'apart' (nicht zusammenhängend),
 * 'overlap' (Ort schon belegt).
 */
export function placementProblem(board, p, others = []) {
  const ids = p.regions;
  const n = board.regions.length;
  if (!Array.isArray(ids) || ids.length !== ANIMALS[p.animal].size || new Set(ids).size !== ids.length
    || !ids.every(id => Number.isInteger(id) && id >= 0 && id < n)) return 'size';
  if (!isConnected(board, ids)) return 'apart';
  for (const o of others) {
    if (!o || o.animal === p.animal || !Array.isArray(o.regions)) continue;
    if (o.regions.some(id => ids.includes(id))) return 'overlap';
  }
  return null;
}

function isPlacementShape(p) {
  return !!p && ANIMAL_IDS.includes(p.animal) && Array.isArray(p.regions) && p.regions.length <= 10;
}

/** Vollständige, regelkonforme Aufstellung: jedes Tier genau einmal, nichts kollidiert. */
export function validateFleet(board, placements) {
  if (!Array.isArray(placements) || placements.length !== ANIMAL_IDS.length) return 'count';
  if (!placements.every(isPlacementShape)) return 'shape';
  const ids = new Set(placements.map(p => p.animal));
  if (ids.size !== ANIMAL_IDS.length) return 'duplicate';
  for (const p of placements) {
    const problem = placementProblem(board, p, placements);
    if (problem) return problem;
  }
  return null;
}

/** Normalisierte Kopie in fester Tier-Reihenfolge (für Hash und Versand). */
export function canonicalFleet(placements) {
  return ANIMAL_IDS.map(id => {
    const p = placements.find(q => q.animal === id);
    return { animal: id, regions: [...p.regions].sort((a, b) => a - b) };
  });
}

/** Welches Tier sitzt auf einem Ort? */
export function animalAt(placements, id) {
  return placements.find(p => p.regions.includes(id)) || null;
}

/** Deterministischer Zufallsgenerator (mulberry32) für Tests und Zufallsbretter. */
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

/** Zufällige zusammenhängende Ortsmenge der Größe n ab einem freien Startort. */
function growFrom(board, start, n, taken, rng) {
  const set = [start];
  while (set.length < n) {
    const options = [...new Set(set.flatMap(r => board.adj[r]))].filter(r => !taken.has(r) && !set.includes(r));
    if (!options.length) return null;
    set.push(options[Math.floor(rng() * options.length)]);
  }
  return set;
}

/**
 * Zufällige gültige Aufstellung; große Tiere zuerst, mit Neustart bei Sackgasse.
 * Mit Wahrscheinlichkeit `favorite` wird ein Platz im Lieblingsgelände gesucht.
 */
export function randomFleet(board, rng = Math.random, { favorite = 0.6 } = {}) {
  const order = [...ANIMAL_IDS].sort((a, b) => ANIMALS[b].size - ANIMALS[a].size);
  const n = board.regions.length;
  for (let attempt = 0; attempt < 200; attempt++) {
    const taken = new Set();
    const placed = [];
    for (const id of order) {
      const wantFav = rng() < favorite;
      let pick = null;
      for (let tries = 0; tries < 40 && !pick; tries++) {
        const start = Math.floor(rng() * n);
        if (taken.has(start)) continue;
        const set = growFrom(board, start, ANIMALS[id].size, taken, rng);
        if (!set) continue;
        const p = { animal: id, regions: set };
        if (!wantFav || isInFavorite(board, p) || tries > 30) pick = p;
      }
      if (!pick) break;
      pick.regions.forEach(r => taken.add(r));
      placed.push(pick);
    }
    if (placed.length === order.length) return canonicalFleet(placed);
  }
  throw new Error('Keine Aufstellung gefunden');
}
