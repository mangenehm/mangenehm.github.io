/* Schuss auflösen, Lieblingsgelände, Konter, Zugfolge. */

import { ANIMALS, ANIMAL_IDS, placementCells } from './shapes.js';
import { isInFavorite } from './board.js';

export const MISS = 'miss';
export const HIT = 'hit';
export const FOUND = 'found';

/** Verteidigungszustand einer Aufstellung: welche Felder getroffen wurden. */
export function newDefense() {
  return { shots: [], hitAnimals: [] };   // shots: ["x,y"], hitAnimals: einmal je Tier
}

/**
 * Löst einen Schuss auf die eigene Aufstellung auf und aktualisiert `defense`.
 * kind: 'normal' | 'counter' – ein Konter löst nie einen weiteren Konter aus.
 * Rückgabe: { result, animal?, cells?, counter }
 */
export function resolveShot(board, placements, defense, x, y, kind = 'normal') {
  const key = x + ',' + y;
  if (defense.shots.includes(key)) throw new Error('Feld wurde schon beschossen');
  defense.shots.push(key);

  for (const p of placements) {
    const cells = placementCells(p);
    if (!cells.some(([cx, cy]) => cx === x && cy === y)) continue;
    const firstHit = !defense.hitAnimals.includes(p.animal);
    if (firstHit) defense.hitAnimals.push(p.animal);
    const counter = kind === 'normal' && firstHit && isInFavorite(board, p);
    const allHit = cells.every(([cx, cy]) => defense.shots.includes(cx + ',' + cy));
    if (allHit) return { result: FOUND, animal: p.animal, cells, counter };
    return { result: HIT, counter };
  }
  return { result: MISS, counter: false };
}

/** Sind alle Tiere dieser Aufstellung aufgedeckt? */
export function allFound(placements, defense) {
  return placements.every(p => placementCells(p).every(([x, y]) => defense.shots.includes(x + ',' + y)));
}

export function other(player) { return player === 'host' ? 'guest' : 'host'; }

/**
 * Wer schießt als Nächstes?
 * - Löst der Schuss einen Konter aus, schießt der Getroffene sofort (Konter).
 * - Nach einem Konter folgt der normale Zug desselben Spielers.
 * - Sonst wechselt der Zug; ein Treffer gibt keinen Extra-Schuss.
 */
export function nextTurn(shooter, kind, counterTriggered) {
  if (counterTriggered) return { turn: other(shooter), kind: 'counter' };
  if (kind === 'counter') return { turn: shooter, kind: 'normal' };
  return { turn: other(shooter), kind: 'normal' };
}

/** Anzahl gefundener Tiere aus einer Liste eigener Schüsse. */
export function foundAnimals(shots) {
  return shots.filter(s => s.result === FOUND).map(s => s.animal);
}

export function isFleetFound(shots) {
  const found = new Set(foundAnimals(shots));
  return ANIMAL_IDS.every(id => found.has(id));
}

export function animalName(id) { return ANIMALS[id]?.name ?? id; }
