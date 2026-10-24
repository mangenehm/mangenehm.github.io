/* Lokaler Transport für Tests: zwei Endpunkte im selben Prozess, die sich Nachrichten spiegeln. */

import { BaseTransport } from './transport.js';

class LocalEndpoint extends BaseTransport {
  constructor() { super(); this.peer = null; this.closed = false; }
  send(m) {
    if (this.closed) return;
    const copy = structuredClone(m);       // wie über das Netz: keine geteilten Objekte
    queueMicrotask(() => { if (!this.peer.closed) this.peer.emitMessage(copy); });
  }
  close() { this.closed = true; }
}

/** Liefert [a, b]: was a sendet, empfängt b und umgekehrt. */
export function createLocalPair() {
  const a = new LocalEndpoint(), b = new LocalEndpoint();
  a.peer = b; b.peer = a;
  queueMicrotask(() => { a.emitStatus('connected'); b.emitStatus('connected'); });
  return [a, b];
}
