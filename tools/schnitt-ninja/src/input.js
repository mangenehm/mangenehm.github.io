/* Pointer-Tracking und Wischspur.
   Alle Koordinaten werden in den logischen 390x844-Raum umgerechnet, damit
   sichtbare Klinge, Trefferpruefung und Schnittkante exakt zusammenpassen. */

import { W, H } from './entities.js';

const TRAIL_MS = 150;

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.trail = [];
    this.segments = [];
    this.swipeId = 0;
    this.down = false;
    this.onFirstTouch = null;
    this._first = true;

    const opts = { passive: false };
    canvas.addEventListener('pointerdown', (e) => this._onDown(e), opts);
    canvas.addEventListener('pointermove', (e) => this._onMove(e), opts);
    canvas.addEventListener('pointerup', (e) => this._onUp(e), opts);
    canvas.addEventListener('pointercancel', (e) => this._onUp(e), opts);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  toLocal(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * W,
      y: ((clientY - rect.top) / rect.height) * H,
    };
  }

  _push(x, y, t) {
    const prev = this.trail[this.trail.length - 1];
    const pt = { x, y, t };
    this.trail.push(pt);
    if (prev) {
      const dt = Math.max(4, t - prev.t) / 1000;
      const dist = Math.hypot(x - prev.x, y - prev.y);
      if (dist > 0.5) {
        this.segments.push({
          a: prev,
          b: pt,
          speed: dist / dt,
          swipeId: this.swipeId,
        });
      }
    }
    if (this.segments.length > 60) this.segments.splice(0, this.segments.length - 60);
  }

  _onDown(e) {
    e.preventDefault();
    if (this._first) {
      this._first = false;
      if (this.onFirstTouch) this.onFirstTouch();
    }
    try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* egal */ }
    this.down = true;
    this.swipeId++;
    this.trail.length = 0;
    const p = this.toLocal(e.clientX, e.clientY);
    this._push(p.x, p.y, e.timeStamp || performance.now());
  }

  _onMove(e) {
    if (!this.down) return;
    e.preventDefault();
    // Bei schnellen Wischern liefert der Browser zwischengespeicherte Punkte nach –
    // ohne sie wuerde die Klinge Items ueberspringen.
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e];
    for (const ev of (events.length ? events : [e])) {
      const p = this.toLocal(ev.clientX, ev.clientY);
      this._push(p.x, p.y, ev.timeStamp || performance.now());
    }
  }

  _onUp(e) {
    if (!this.down) return;
    e.preventDefault();
    this.down = false;
    try { this.canvas.releasePointerCapture(e.pointerId); } catch (err) { /* egal */ }
  }

  /** Liefert die seit dem letzten Frame aufgelaufenen Streckenstuecke. */
  consume() {
    const segs = this.segments;
    this.segments = [];
    return segs;
  }

  /** Alte Punkte verwerfen, damit die Klinge kurz bleibt und ausblendet. */
  prune(now) {
    while (this.trail.length && now - this.trail[0].t > TRAIL_MS) this.trail.shift();
  }

  reset() {
    this.trail.length = 0;
    this.segments.length = 0;
    this.down = false;
  }
}
