/* Hash-Commitment gegen Schummeln: SHA-256(Aufstellung + Zufallssalz). */

import { canonicalFleet, validateFleet, regionLabel } from '../engine/board.js';
import { newDefense, resolveShot } from '../engine/rules.js';

export function randomSalt(bytes = 16) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function commitPayload(placements, salt) {
  return JSON.stringify({ fleet: canonicalFleet(placements), salt });
}

export function commitFleet(placements, salt) {
  return sha256Hex(commitPayload(placements, salt));
}

/**
 * Prüft die offengelegte Aufstellung des Gegners:
 * Hash passt zum Commitment, Aufstellung ist regelkonform, und jede
 * Antwort auf meine Schüsse stimmt mit der Aufstellung überein.
 * Rückgabe: { ok: true } oder { ok: false, reason }
 */
export async function verifyReveal({ board, commit, placements, salt, shots }) {
  if (typeof salt !== 'string' || !salt) return { ok: false, reason: 'Salz fehlt' };
  let hash;
  try { hash = await commitFleet(placements, salt); } catch { return { ok: false, reason: 'Aufstellung unlesbar' }; }
  if (hash !== commit) return { ok: false, reason: 'Aufstellung passt nicht zum Commitment' };
  const problem = validateFleet(board, placements);
  if (problem) return { ok: false, reason: 'Aufstellung verstößt gegen die Regeln' };
  const defense = newDefense();
  for (const s of shots) {
    const r = resolveShot(board, placements, defense, s.r);
    const same = r.result === s.result && !!r.tracks === !!s.tracks
      && (r.result !== 'found' || r.animal === s.animal);
    if (!same) return { ok: false, reason: `Antwort auf ${regionLabel(s.r)} war falsch` };
  }
  return { ok: true };
}
