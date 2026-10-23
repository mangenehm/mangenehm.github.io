/*
 * Zustandsmaschine aus Sicht eines Spielers:
 *   lobby → hiding → playing → over
 *
 * Jeder Spieler kennt nur die eigene Aufstellung und beantwortet die Schüsse
 * auf sein Brett selbst. Der Gegner sitzt hinter `send` (Transport) – ob
 * online oder am selben Gerät, weiß die Engine nicht.
 */

import { validateFleet, canonicalFleet, isValidBoard } from './board.js';
import { newDefense, resolveShot, allFound, nextTurn, other, isFleetFound, FOUND } from './rules.js';
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
      incoming: [],      // Schüsse des Gegners auf mich: {x, y, kind, result, animal?, counter}
      outgoing: [],      // meine Schüsse: {x, y, kind, result, animal?, cells?, counter}
      turn: 'host', kind: 'normal',
      pending: null,     // mein Schuss, auf dessen Antwort ich warte
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
    const problem = validateFleet(this.s.board.size, placements);
    if (problem) throw new Error('Aufstellung ungültig: ' + problem);
    this.s.placements = canonicalFleet(placements);
    this.s.salt = randomSalt();
    this.s.myCommit = await commitFleet(this.s.placements, this.s.salt);
    this.send(msg.commit(this.s.myCommit));
    this.#maybeStartPlay();
    this.onEvent({ type: 'committed' });
  }

  /** Schuss auf das gegnerische Brett. */
  shoot(x, y) {
    if (!this.myTurn) throw new Error('Nicht am Zug');
    if (this.s.outgoing.some(s => s.x === x && s.y === y)) throw new Error('Schon beschossen');
    this.s.pending = { x, y, kind: this.s.kind };
    this.send(msg.shot(x, y, this.s.kind));
    this.onEvent({ type: 'shot-sent', x, y });
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
      this.s.kind = 'normal';
      this.onEvent({ type: 'play' });
    }
  }

  #onShot(m) {
    const s = this.s;
    const shooter = other(s.role);
    if (s.phase !== 'playing' || s.turn !== shooter || s.kind !== m.kind || !inside(s.board, m.x, m.y)) {
      this.onEvent({ type: 'error', reason: 'Schuss außer der Reihe' });
      return;
    }
    let r;
    try { r = resolveShot(s.board, s.placements, s.defense, m.x, m.y, m.kind); }
    catch { this.onEvent({ type: 'error', reason: 'Feld schon beschossen' }); return; }
    s.incoming.push({ x: m.x, y: m.y, kind: m.kind, result: r.result, animal: r.animal, counter: r.counter });
    this.send(msg.result(m.x, m.y, r));
    const lost = allFound(s.placements, s.defense);
    this.#advance(shooter, m.kind, r.counter, lost ? shooter : null);
    this.onEvent({ type: 'incoming', x: m.x, y: m.y, kind: m.kind, ...r });
  }

  #onResult(m) {
    const s = this.s;
    const p = s.pending;
    if (!p || p.x !== m.x || p.y !== m.y) { this.onEvent({ type: 'error', reason: 'Unerwartete Antwort' }); return; }
    s.pending = null;
    // Ein Konter-Schuss kann keinen Konter auslösen – Behauptung des Gegners ignorieren
    const counter = p.kind === 'normal' && m.counter;
    const shot = { x: m.x, y: m.y, kind: p.kind, result: m.result, counter };
    if (m.result === FOUND) { shot.animal = m.animal; shot.cells = m.cells; }
    s.outgoing.push(shot);
    const won = isFleetFound(s.outgoing);
    this.#advance(s.role, p.kind, counter, won ? s.role : null);
    this.onEvent({ type: 'outgoing', ...shot });
  }

  #advance(shooter, kind, counter, winner) {
    const s = this.s;
    if (winner) {
      s.winner = winner;
      s.phase = 'over';
      this.send(msg.reveal(s.placements, s.salt));
      this.onEvent({ type: 'over', winner });
      if (s.oppReveal) this.#verify();
      return;
    }
    const n = nextTurn(shooter, kind, counter);
    s.turn = n.turn;
    s.kind = n.kind;
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

function inside(board, x, y) { return x < board.size && y < board.size; }
