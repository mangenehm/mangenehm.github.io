/* Suche auflösen, Spuren, Zugfolge. */

import { ANIMALS, ANIMAL_IDS } from './shapes.js';
import { isInFavorite } from './board.js';

export const MISS = 'miss';
export const HIT = 'hit';
export const FOUND = 'found';

/** Verteidigungszustand einer Aufstellung: welche Orte abgesucht wurden. */
export function newDefense() {
  return { shots: [] };   // Region-IDs
}

const isFound = (p, shots) => p.regions.every(r => shots.includes(r));

/**
 * Löst eine Suche auf die eigene Aufstellung auf und aktualisiert `defense`.
 * Rückgabe: { result, tracks, animal?, regions? }
 *
 * Spuren: Bei „Daneben“ ist tracks = true, wenn ein Nachbarort ein noch nicht
 * gefundenes Tier enthält, das nicht im Lieblingsgelände steht.
 */
export function resolveShot(board, placements, defense, r) {
  if (defense.shots.includes(r)) throw new Error('Ort wurde schon abgesucht');
  defense.shots.push(r);

  const p = placements.find(q => q.regions.includes(r));
  if (p) {
    if (isFound(p, defense.shots)) return { result: FOUND, tracks: false, animal: p.animal, regions: [...p.regions] };
    return { result: HIT, tracks: false };
  }
  const near = new Set(board.adj[r]);
  const tracks = placements.some(q => !isFound(q, defense.shots) && !isInFavorite(board, q) && q.regions.some(id => near.has(id)));
  return { result: MISS, tracks };
}

/** Sind alle Tiere dieser Aufstellung aufgedeckt? */
export function allFound(placements, defense) {
  return placements.every(p => isFound(p, defense.shots));
}

export function other(player) { return player === 'host' ? 'guest' : 'host'; }

/** Gefundene Tiere aus einer Liste eigener Suchen. */
export function foundAnimals(shots) {
  return shots.filter(s => s.result === FOUND).map(s => s.animal);
}

export function isFleetFound(shots) {
  const found = new Set(foundAnimals(shots));
  return ANIMAL_IDS.every(id => found.has(id));
}

export function animalName(id) { return ANIMALS[id]?.name ?? id; }
