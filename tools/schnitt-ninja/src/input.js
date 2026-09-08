/* Pointer-Tracking und Wischspur.
   Alle Koordinaten werden in den logischen 390x844-Raum umgerechnet, damit
   sichtbare Klinge, Trefferpruefung und Schnittkante exakt zusammenpassen. */

import { W, H } from './entities.js';

const TRAIL_MS = 150;
const SPEED_WINDOW_MS = 50;     // Fenster, ueber das die Wischgeschwindigkeit gemittelt wird
const MIN_SPAN_MS = 10;         // darunter ist das Fenster zu kurz fuer eine Aussage

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.trail = [];
    this.segments = [];
    this.anchor = null;       // letzter ausgegebener Punkt (Start des naechsten Segments)
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
    const pt = { x, y, t };
    this.trail.push(pt);
    // Vom letzten *ausgegebenen* Punkt aus messen, nicht vom letzten empfangenen:
    // liegen die Punkte sehr dicht (coalesced, 1–2 ms), sind die Einzelschritte
    // kleiner als eine halbe Pixelbreite. Frueher fielen sie samt ihrer Strecke
    // weg – jetzt sammeln sie sich, bis ein belastbares Stueck zusammenkommt.
    const anchor = this.anchor;
    if (anchor) {
      const dist = Math.hypot(x - anchor.x, y - anchor.y);
      if (dist > 0.5) {
        const dt = (t - anchor.t) / 1000;
        this.segments.push({
          a: anchor,
          b: pt,
          speed: dt > 0 ? dist / dt : 0,
          swipeId: this.swipeId,
        });
        this.anchor = pt;
      }
    } else {
      this.anchor = pt;
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
    this.anchor = null;
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

  /** Geschwindigkeit des Wischers ueber ein Zeitfenster statt ueber ein einzelnes
      Punktpaar. `getCoalescedEvents()` liefert auf 120-Hz-Geraeten Punkte im
      1–2-ms-Abstand; deren Einzelmessung ist so verrauscht, dass ein voellig
      normaler Wisch unter die Schnittschwelle fallen kann und gar nichts
      passiert. Der Wisch als Ganzes ist das verlaessliche Mass. */
  _windowSpeed() {
    const n = this.trail.length;
    if (n < 2) return 0;
    const end = this.trail[n - 1];
    let i = n - 1;
    let dist = 0;
    while (i > 0 && end.t - this.trail[i - 1].t <= SPEED_WINDOW_MS) {
      dist += Math.hypot(this.trail[i].x - this.trail[i - 1].x, this.trail[i].y - this.trail[i - 1].y);
      i--;
    }
    const span = end.t - this.trail[i].t;
    return span >= MIN_SPAN_MS ? (dist / span) * 1000 : 0;
  }

  /** Liefert die seit dem letzten Frame aufgelaufenen Streckenstuecke. */
  consume() {
    const segs = this.segments;
    this.segments = [];
    // Die Fenstermessung hebt nur an, sie senkt nie: ein Tipp bleibt unter der
    // Schwelle, ein schneller Schlenker innerhalb eines langsamen Zugs behaelt
    // seinen hoeheren Einzelwert.
    const ws = this._windowSpeed();
    if (ws > 0) for (const seg of segs) if (ws > seg.speed) seg.speed = ws;
    return segs;
  }

  /** Alte Punkte verwerfen, damit die Klinge kurz bleibt und ausblendet. */
  prune(now) {
    while (this.trail.length && now - this.trail[0].t > TRAIL_MS) this.trail.shift();
  }

  reset() {
    this.trail.length = 0;
    this.segments.length = 0;
    this.anchor = null;
    this.down = false;
  }
}
