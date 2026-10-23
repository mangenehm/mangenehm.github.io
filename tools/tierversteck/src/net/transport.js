/*
 * Gemeinsames Transport-Interface. Die Engine kennt nur dieses:
 *
 *   transport.send(message)          Nachricht an den Gegner
 *   transport.onMessage(handler)     handler(message) für eingehende Nachrichten
 *   transport.onStatus(handler)      handler('connecting' | 'connected' | 'lost' | 'error', detail?)
 *   transport.close()
 *
 * Umsetzungen: local.js (Hot-Seat) und trystero.js (online).
 */

export class BaseTransport {
  constructor() {
    this.messageHandlers = [];
    this.statusHandlers = [];
    this.status = 'connecting';
  }
  onMessage(fn) { this.messageHandlers.push(fn); return () => this.#off(this.messageHandlers, fn); }
  onStatus(fn) { this.statusHandlers.push(fn); return () => this.#off(this.statusHandlers, fn); }
  emitMessage(m) { for (const fn of [...this.messageHandlers]) fn(m); }
  emitStatus(status, detail) {
    this.status = status;
    for (const fn of [...this.statusHandlers]) fn(status, detail);
  }
  #off(list, fn) { const i = list.indexOf(fn); if (i >= 0) list.splice(i, 1); }
  send() { throw new Error('not implemented'); }
  close() {}
}
