/*
 * Nachrichtentypen zwischen zwei Spielern.
 *
 *  hello   { v, name }                    Version und Spielername austauschen
 *  board   { board }                      Ersteller sendet das fertige Brett
 *  commit  { hash }                       SHA-256(Aufstellung + Salz), vor der ersten Suche
 *  shot    { r }                          Suche auf Ort r
 *  result  { r, result, tracks, animal?, regions? }
 *                                         Antwort; tracks: Spuren in der Nähe (nur bei Daneben)
 *  reveal  { placements, salt }           am Ende Aufstellung und Salz offenlegen
 *
 * Der Gegner ist nicht vertrauenswürdig: jede Nachricht wird vor der
 * Verarbeitung auf Form und Wertebereich geprüft.
 */

import { isValidBoard, MAX_REGIONS } from '../engine/board.js';
import { ANIMAL_IDS } from '../engine/shapes.js';

export const PROTOCOL_VERSION = 2;

const isInt = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;
const isRegion = r => isInt(r, 0, MAX_REGIONS - 1);

export function isValidMessage(m) {
  if (!m || typeof m !== 'object' || typeof m.t !== 'string') return false;
  switch (m.t) {
    case 'hello':
      return Number.isInteger(m.v) && typeof m.name === 'string' && m.name.length <= 40;
    case 'board':
      return isValidBoard(m.board);
    case 'commit':
      return typeof m.hash === 'string' && /^[0-9a-f]{64}$/.test(m.hash);
    case 'shot':
      return isRegion(m.r);
    case 'result':
      return isRegion(m.r)
        && ['miss', 'hit', 'found'].includes(m.result)
        && typeof m.tracks === 'boolean'
        && (m.result !== 'found' || (ANIMAL_IDS.includes(m.animal) && Array.isArray(m.regions) && m.regions.length <= 10 && m.regions.every(isRegion)));
    case 'reveal':
      return Array.isArray(m.placements) && m.placements.length <= 10 && typeof m.salt === 'string' && m.salt.length <= 128;
    default:
      return false;
  }
}

export const msg = {
  hello: name => ({ t: 'hello', v: PROTOCOL_VERSION, name }),
  board: board => ({ t: 'board', board }),
  commit: hash => ({ t: 'commit', hash }),
  shot: r => ({ t: 'shot', r }),
  result: (r, res) => ({ t: 'result', r, result: res.result, tracks: !!res.tracks, ...(res.result === 'found' ? { animal: res.animal, regions: res.regions } : {}) }),
  reveal: (placements, salt) => ({ t: 'reveal', placements, salt }),
};
