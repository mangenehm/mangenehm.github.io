/*
 * Zustandsmaschine aus Sicht eines Spielers:
 *   lobby → hiding → playing → over
 *
 * Jeder Spieler kennt nur die eigene Aufstellung und beantwortet die Schüsse
 * auf sein Brett selbst. Der Gegner sitzt hinter `send` (Transport) – ob
 * online oder am selben Gerät, weiß die Engine nicht.
 */

import { validateFleet, canonicalFleet, isValidBoard } from './board.js';
import { newDefense, resolveShot, allFound, other, isFleetFound, FOUND } from './rules.js';
import { msg, isValidMessage, PROTOCOL_VERSION } from '../net/protocol.js';
import { commitFleet, randomSalt, verifyReveal } from '../net/commit.js';

export class PlayerGame {
  /**
   * @param {object} o
   * @param {'host'|'guest'} o.role  host = Ersteller (hat das Brett, beginnt)
   * @param {string} o.name
   * @param {object} [o.board]       nur beim Ersteller
   * @param {(m:object)=>void} o.send
   * @param {(e:object)=>void} [o.onEvent]
   * @param {object} [saved]         Zustand aus toJSON() zum Fortsetzen
   */
  constructor({ role, name, board = null, send, onEvent = () => {} }, saved = null) {
    this.send = send;
    this.onEvent = onEvent;
    this.s = saved ? structuredClone(saved) : {
      role, name, oppName: null,
      phase: 'lobby',
      board,
      placements: null, salt: null, myCommit: null, oppCommit: null,
      defense: newDefense(),
      incoming: [],      // Suchen des Gegners bei mir: {r, result, tracks, animal?}
      outgoing: [],      // meine Suchen: {r, result, tracks, animal?, regions?}
      turn: 'host',
      pending: null,     // meine Suche, auf deren Antwort ich warte
      winner: null,
      oppReveal: null, verdict: null,
      helloSent: false,
    };
  }

  toJSON() { return structuredClone(this.s); }

  get role() { return this.s.role; }
  get phase() { return this.s.phase; }
  get board() { return this.s.board; }
  get myTurn() { return this.s.phase === 'playing' && this.s.turn === this.s.role && !this.s.pending; }

  /** Verbindung steht: Namen austauschen. Mehrfachaufruf ist harmlos. */
  start() {
    if (this.s.helloSent) return;
    this.s.helloSent = true;
    this.send(msg.hello(this.s.name));
  }

  /** Eigene Aufstellung festlegen und Commitment senden. */
  async commit(placements) {
    if (this.s.phase !== 'hiding' || this.s.myCommit) throw new Error('Gerade nicht möglich');
    const problem = validateFleet(this.s.board, placements);
    if (problem) throw new Error('Aufstellung ungültig: ' + problem);
    this.s.placements = canonicalFleet(placements);
    this.s.salt = randomSalt();
    this.s.myCommit = await commitFleet(this.s.placements, this.s.salt);
    this.send(msg.commit(this.s.myCommit));
    this.#maybeStartPlay();
    this.onEvent({ type: 'committed' });
  }

  /** Ort r im gegnerischen Revier absuchen. */
  shoot(r) {
    if (!this.myTurn) throw new Error('Nicht am Zug');
    if (!inside(this.s.board, r)) throw new Error('Unbekannter Ort');
    if (this.s.outgoing.some(s => s.r === r)) throw new Error('Schon abgesucht');
    this.s.pending = { r };
    this.send(msg.shot(r));
    this.onEvent({ type: 'shot-sent', r });
  }

  /** Eingehende Nachricht vom Gegner. */
  receive(m) {
    if (!isValidMessage(m)) { this.onEvent({ type: 'error', reason: 'Ungültige Nachricht' }); return; }
    const s = this.s;
    switch (m.t) {
      case 'hello':
        if (m.v !== PROTOCOL_VERSION) { this.onEvent({ type: 'error', reason: 'Andere Spielversion beim Gegner – bitte Seite neu laden.' }); return; }
        s.oppName = m.name.trim() || 'Gegner';
        this.start();
        if (s.role === 'host' && s.phase === 'lobby') {
          this.send(msg.board(s.board));
          s.phase = 'hiding';
        }
        this.onEvent({ type: 'hello' });
        break;

      case 'board':
        if (s.role !== 'guest' || s.phase !== 'lobby' || !isValidBoard(m.board)) return;
        s.board = m.board;
        s.phase = 'hiding';
        this.onEvent({ type: 'board' });
        break;

      case 'commit':
        if (s.phase !== 'hiding' || s.oppCommit) return;
        s.oppCommit = m.hash;
        this.#maybeStartPlay();
        this.onEvent({ type: 'opp-committed' });
        break;

      case 'shot': this.#onShot(m); break;
      case 'result': this.#onResult(m); break;
      case 'reveal': this.#onReveal(m); break;
    }
  }

  #maybeStartPlay() {
    if (this.s.phase === 'hiding' && this.s.myCommit && this.s.oppCommit) {
      this.s.phase = 'playing';
      this.s.turn = 'host';
      this.onEvent({ type: 'play' });
    }
  }

  #onShot(m) {
    const s = this.s;
    const shooter = other(s.role);
    if (s.phase !== 'playing' || s.turn !== shooter || !inside(s.board, m.r)) {
      this.onEvent({ type: 'error', reason: 'Suche außer der Reihe' });
      return;
    }
    let r;
    try { r = resolveShot(s.board, s.placements, s.defense, m.r); }
    catch { this.onEvent({ type: 'error', reason: 'Ort schon abgesucht' }); return; }
    s.incoming.push({ r: m.r, result: r.result, tracks: r.tracks, animal: r.animal });
    this.send(msg.result(m.r, r));
    const lost = allFound(s.placements, s.defense);
    this.#advance(shooter, lost ? shooter : null);
    this.onEvent({ type: 'incoming', r: m.r, ...r });
  }

  #onResult(m) {
    const s = this.s;
    const p = s.pending;
    if (!p || p.r !== m.r) { this.onEvent({ type: 'error', reason: 'Unerwartete Antwort' }); return; }
    s.pending = null;
    // Spuren gibt es nur bei Daneben – andere Behauptungen ignorieren
    const shot = { r: m.r, result: m.result, tracks: m.result === 'miss' && m.tracks };
    if (m.result === FOUND) { shot.animal = m.animal; shot.regions = m.regions; }
    s.outgoing.push(shot);
    const won = isFleetFound(s.outgoing);
    this.#advance(s.role, won ? s.role : null);
    this.onEvent({ type: 'outgoing', ...shot });
  }

  #advance(shooter, winner) {
    const s = this.s;
    if (winner) {
      s.winner = winner;
      s.phase = 'over';
      this.send(msg.reveal(s.placements, s.salt));
      this.onEvent({ type: 'over', winner });
      if (s.oppReveal) this.#verify();
      return;
    }
    s.turn = other(shooter);
  }

  #onReveal(m) {
    if (this.s.oppReveal) return;
    this.s.oppReveal = { placements: m.placements, salt: m.salt };
    if (this.s.phase === 'over') this.#verify();
  }

  async #verify() {
    const s = this.s;
    s.verdict = { ok: null };
    const v = await verifyReveal({
      board: s.board, commit: s.oppCommit,
      placements: s.oppReveal.placements, salt: s.oppReveal.salt,
      shots: s.outgoing,
    });
    s.verdict = v;
    this.onEvent({ type: 'verdict', ...v });
  }
}

function inside(board, r) { return Number.isInteger(r) && r >= 0 && r < board.regions.length; }
