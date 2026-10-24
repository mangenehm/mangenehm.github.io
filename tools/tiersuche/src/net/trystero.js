/*
 * Online-Transport über Trystero (WebRTC, Verbindungsaufbau über öffentliche
 * Nostr-Relays). Darüber liegt ein kleiner zuverlässiger Kanal:
 *
 *  - jede Nachricht bekommt eine laufende Nummer und bleibt im Postausgang,
 *  - beim (Wieder-)Verbinden schickt jede Seite `sync` mit der letzten
 *    empfangenen Nummer, die Gegenseite sendet alles Neuere erneut,
 *  - Doppeltes wird verworfen.
 *
 * So überlebt das Spiel einen Seiten-Reload oder kurzen Verbindungsabbruch:
 * Spielstand und Kanalzustand liegen in sessionStorage, der Raum wird neu betreten.
 */

import { BaseTransport } from './transport.js';

export const APP_ID = 'mangenehm-tierversteck-v1';
const ACTION = 'tv';

let trysteroPromise = null;
function loadTrystero() {
  // erst bei Bedarf laden – die Startseite braucht noch kein WebRTC
  trysteroPromise ??= import('../../vendor/trystero.js');
  return trysteroPromise;
}

// 4 Zeichen aus 32 ≈ 1 Mio. Codes: kurz zum Abtippen, Zusammenstöße bei wenigen gleichzeitigen Räumen praktisch ausgeschlossen
export function randomRoomId(len = 4) {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  const a = new Uint8Array(len);
  crypto.getRandomValues(a);
  return [...a].map(b => chars[b % chars.length]).join('');
}

export class TrysteroTransport extends BaseTransport {
  /**
   * @param {object} o
   * @param {string} o.roomId
   * @param {string} o.playerId   stabile Kennung dieses Spielers (überlebt Reloads)
   * @param {object} [o.saved]    Kanalzustand aus state()
   * @param {Function} [o.joinRoom] Ersatz für Trysteros joinRoom (Tests)
   */
  constructor({ roomId, playerId, saved = null, joinRoom = null }) {
    super();
    this.joinRoomImpl = joinRoom;
    this.roomId = roomId;
    this.playerId = playerId;
    this.ch = saved ? structuredClone(saved) : { nextSeq: 0, recvSeq: 0, outbox: [], oppPid: null };
    this.peerId = null;
    this.room = null;
    this.action = null;
  }

  state() { return structuredClone(this.ch); }

  async connect() {
    this.emitStatus('connecting');
    let joinRoom = this.joinRoomImpl;
    if (!joinRoom) {
      try { ({ joinRoom } = await loadTrystero()); }
      catch { this.emitStatus('error', 'Netzwerkbibliothek konnte nicht geladen werden.'); return; }
    }

    this.room = joinRoom({ appId: APP_ID }, this.roomId, {
      onJoinError: d => {
        const reason = String(d?.error || '');
        this.emitStatus('error', /password|decrypt/i.test(reason)
          ? 'Verbindung abgelehnt.'
          : 'Direkte Verbindung gescheitert – vermutlich blockiert eine Firewall WebRTC. Versucht es in einem anderen Netz oder spielt am selben Gerät.');
      },
    });
    this.action = this.room.makeAction(ACTION);
    this.action.onMessage = (data, meta) => this.#onData(data, meta?.peerId ?? meta);
    this.room.onPeerJoin = peerId => this.#sendSync(peerId);
    this.room.onPeerLeave = peerId => {
      if (peerId === this.peerId) { this.peerId = null; this.emitStatus('lost'); }
    };
    // Bereits verbundene Peers (beim Wiederbeitritt) begrüßen
    for (const peerId of Object.keys(this.room.getPeers?.() || {})) this.#sendSync(peerId);
  }

  send(m) {
    const seq = ++this.ch.nextSeq;
    this.ch.outbox.push({ seq, m });
    if (this.peerId) this.#raw({ k: 'msg', seq, m }, this.peerId);
  }

  close() {
    try { this.room?.leave(); } catch { /* egal */ }
    this.room = null;
    this.peerId = null;
  }

  #raw(data, target) {
    // Verbindung weg → egal, beim nächsten sync wird nachgeliefert
    try { this.action?.send(data, { target })?.catch?.(() => {}); } catch { /* s. o. */ }
  }

  #sendSync(peerId) {
    this.#raw({ k: 'sync', pid: this.playerId, recv: this.ch.recvSeq }, peerId);
  }

  #onData(d, peerId) {
    if (!d || typeof d !== 'object') return;
    if (d.k === 'sync') {
      if (typeof d.pid !== 'string' || !Number.isInteger(d.recv)) return;
      // Nur ein Gegner pro Raum: ein Dritter mit anderer Kennung wird ignoriert
      if (this.ch.oppPid && d.pid !== this.ch.oppPid) return;
      const fresh = this.peerId !== peerId;
      this.ch.oppPid = d.pid;
      this.peerId = peerId;
      if (fresh) this.#sendSync(peerId);   // Gegenseite kennt unseren Stand noch nicht
      for (const e of this.ch.outbox) if (e.seq > d.recv) this.#raw({ k: 'msg', seq: e.seq, m: e.m }, peerId);
      if (this.status !== 'connected') this.emitStatus('connected');
      return;
    }
    if (d.k === 'msg' && peerId === this.peerId && Number.isInteger(d.seq)) {
      if (d.seq <= this.ch.recvSeq) return;                  // doppelt
      if (d.seq !== this.ch.recvSeq + 1) { this.#sendSync(peerId); return; }   // Lücke → neu anfordern
      this.ch.recvSeq = d.seq;
      this.emitMessage(d.m);
    }
  }
}
