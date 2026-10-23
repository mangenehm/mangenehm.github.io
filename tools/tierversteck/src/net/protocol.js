/*
 * Nachrichtentypen zwischen zwei Spielern.
 *
 *  hello   { v, name }                    Version und Spielername austauschen
 *  board   { board }                      Ersteller sendet das fertige Brett
 *  commit  { hash }                       SHA-256(Aufstellung + Salz), vor dem ersten Schuss
 *  shot    { x, y, kind }                 Schuss; kind 'normal' oder 'counter'
 *  result  { x, y, result, animal?, cells?, counter }
 *                                         Antwort; counter: true heißt, der Getroffene
 *                                         darf jetzt einen Konter-Schuss abgeben
 *  reveal  { placements, salt }           am Ende Aufstellung und Salz offenlegen
 *
 * Der Gegner ist nicht vertrauenswürdig: jede Nachricht wird vor der
 * Verarbeitung auf Form und Wertebereich geprüft.
 */

import { isValidBoard, MAX_SIZE } from '../engine/board.js';
import { ANIMAL_IDS } from '../engine/shapes.js';

export const PROTOCOL_VERSION = 1;

const isInt = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;
const isCell = c => Array.isArray(c) && c.length === 2 && isInt(c[0], 0, MAX_SIZE - 1) && isInt(c[1], 0, MAX_SIZE - 1);

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
      return isInt(m.x, 0, MAX_SIZE - 1) && isInt(m.y, 0, MAX_SIZE - 1) && (m.kind === 'normal' || m.kind === 'counter');
    case 'result':
      return isInt(m.x, 0, MAX_SIZE - 1) && isInt(m.y, 0, MAX_SIZE - 1)
        && ['miss', 'hit', 'found'].includes(m.result)
        && typeof m.counter === 'boolean'
        && (m.result !== 'found' || (ANIMAL_IDS.includes(m.animal) && Array.isArray(m.cells) && m.cells.every(isCell)));
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
  shot: (x, y, kind) => ({ t: 'shot', x, y, kind }),
  result: (x, y, r) => ({ t: 'result', x, y, result: r.result, counter: !!r.counter, ...(r.result === 'found' ? { animal: r.animal, cells: r.cells } : {}) }),
  reveal: (placements, salt) => ({ t: 'reveal', placements, salt }),
};
