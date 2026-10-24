/*
 * Brett-Canvas: Stadtplan (gecacht), Hervorhebungen je Ort, Tiere und
 * Suchmarker. Zeigerereignisse werden in Orte (Region-IDs) übersetzt.
 * Zoombar per Knöpfen, Pinch und Mausrad; gezoomt verschiebt Ziehen die Ansicht.
 */

import { drawMap, regionPaths, PALETTE } from '../map/render.js';
import { drawSticker, drawMiss, drawHit, drawTracks } from './sprites.js';
import { ANIMALS } from '../engine/shapes.js';
import { MAX_Z, clampView, zoomAt, toBoard, sameView } from './zoom.js';
import { burst } from './feedback.js';

const ORANGE = '#ef6f53';
const TAP_SLOP = 8;       // mehr Bewegung (CSS-px) gilt als Verschieben, nicht als Tipp
const LOUPE_CELL = 34;    // kleinere Orte (CSS-px im Mittel) → erster Tipp zoomt nur heran
const LOUPE_Z = 2.5;
const BUTTON_STEP = 1.6;

export class BoardView {
  /**
   * @param {HTMLElement} host   Container; das Canvas füllt seine Breite
   * @param {object} board
   * @param {object} [o]
   * @param {(type:string, region:number|null, e:PointerEvent)=>void} [o.onPointer]
   * @param {number} [o.maxWidth]
   * @param {string} [o.label]  Barrierefreie Beschreibung
   * @param {boolean} [o.numbers]  Ortsnummern zeigen
   * @param {boolean} [o.zoomable]  Zoom erlauben (Standard: wenn das Brett bedienbar ist)
   */
  constructor(host, board, { onPointer = null, maxWidth = 620, label = 'Spielbrett', numbers = true, zoomable = !!onPointer } = {}) {
    this.host = host;
    this.onPointer = onPointer;
    this.maxWidth = maxWidth;
    this.numbers = numbers;
    this.zoomable = zoomable;
    this.v = { z: 1, tx: 0, ty: 0 };
    this.frame = document.createElement('div');
    this.frame.className = 'board-frame';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'board-canvas';
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', label);
    this.frame.appendChild(this.canvas);
    host.appendChild(this.frame);
    this.hitCtx = document.createElement('canvas').getContext('2d');
    this.layers = {
      animals: [],     // [{ p, glow, invalid, ghost, selected, dim }]
      shots: [],       // [{ r, result, tracks }]
      favs: null,      // { regions: [r], color } Lieblingsgelände des ausgewählten Tiers
      marks: [],       // [r] dezent hervorgehoben (z. B. mögliche Nachbarn)
      aim: null,       // r mit Fadenkreuz
      last: null,      // r zuletzt abgesucht
      hover: null,
      disabled: false,
    };
    this.setBoard(board, false);
    if (zoomable) this.#zoomButtons();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    if (onPointer) this.#bindPointer();
    this.resize();
  }

  set(partial) { Object.assign(this.layers, partial); this.draw(); }

  setBoard(board, redraw = true) {
    this.board = board;
    this.paths = regionPaths(board);
    this.mapCache = null;
    if (redraw) this.resize();
  }

  destroy() { this.ro.disconnect(); clearTimeout(this.settleTimer); this.frame.remove(); }

  resize() {
    const width = Math.max(200, Math.min(this.maxWidth, this.host.clientWidth || this.maxWidth));
    if (this.cssSize && width !== this.cssSize) {
      const k = width / this.cssSize;
      this.v = clampView({ z: this.v.z, tx: this.v.tx * k, ty: this.v.ty * k }, width);
    }
    this.scale = width / this.board.size;
    this.cssSize = width;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.dpr = dpr;
    this.frame.style.width = width + 'px';
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = width + 'px';
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(width * dpr);
    this.mapCache = null;
    this.draw();
  }

  /** Effektiver Maßstab: CSS-Pixel je Brett-Einheit beim aktuellen Zoom. */
  get S() { return this.scale * this.v.z; }

  /** Zurück zur Übersicht. */
  resetZoom() { this.#setView({ z: 1, tx: 0, ty: 0 }); }

  /** Neue Ansicht; während einer Geste wird nur das alte Kartenbild verschoben, danach scharf neu gezeichnet. */
  #setView(v, gesture = false) {
    if (sameView(v, this.v)) return;
    this.v = v;
    this.canvas.style.touchAction = v.z > 1 ? 'none' : 'pan-y';
    this.#updateButtons();
    clearTimeout(this.settleTimer);
    this.gesture = gesture;
    if (gesture) this.settleTimer = setTimeout(() => { this.gesture = false; this.draw(); }, 140);
    this.draw();
  }

  #renderMap() {
    const c = document.createElement('canvas');
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    const ctx = c.getContext('2d');
    ctx.scale(this.dpr, this.dpr);
    ctx.translate(-this.v.tx, -this.v.ty);
    drawMap(ctx, this.board, this.S, { numbers: this.numbers, paths: this.paths });
    this.mapCache = c;
    this.cacheView = { ...this.v };
  }

  /** Größe der Marker in CSS-Pixeln, passend zur sichtbaren Ortsgröße. */
  get unit() { return Math.max(18, Math.min(44, this.cssSize * this.v.z / Math.sqrt(this.board.regions.length) * 0.42)); }

  /** Beschriftungspunkt eines Orts in Inhaltskoordinaten (vor der Verschiebung). */
  center(r) { const c = this.board.regions[r].c; return [c[0] * this.S, c[1] * this.S]; }

  /** Große Animation über einem Ort (`found` erscheint in der Brettmitte). */
  fx(r, kind, opts = {}) {
    const [x, y] = this.center(r);
    const mid = this.cssSize / 2;
    const size = Math.max(56, Math.min(110, this.unit * 2.2));
    if (kind === 'found') return burst(this.frame, mid, mid, kind, { ...opts, size: this.cssSize * 0.42 });
    // nah am Rand: nach innen ziehen, damit nichts abgeschnitten wird
    const k = v => Math.max(size * 0.6, Math.min(this.cssSize - size * 0.6, v));
    return burst(this.frame, k(x - this.v.tx), k(y - this.v.ty), kind, { ...opts, size });
  }

  draw() {
    if (!this.scale) return;
    if (!this.mapCache || (!this.gesture && !sameView(this.cacheView, this.v))) this.#renderMap();
    const ctx = this.canvas.getContext('2d');
    const L = this.layers;
    const { dpr, v } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (sameView(this.cacheView, v)) ctx.drawImage(this.mapCache, 0, 0);
    else {
      // altes Kartenbild auf die neue Ansicht umrechnen
      const c = this.cacheView, k = v.z / c.z;
      ctx.fillStyle = PALETTE.ground;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.setTransform(k, 0, 0, k, (c.tx * k - v.tx) * dpr, (c.ty * k - v.ty) * dpr);
      ctx.drawImage(this.mapCache, 0, 0);
    }
    ctx.setTransform(dpr, 0, 0, dpr, -v.tx * dpr, -v.ty * dpr);
    const u = this.unit;

    if (L.favs) {
      // alles außerhalb des Lieblingsgeländes (und ohne Tier) verblasst, das Lieblingsgelände bekommt einen Rand
      const fav = new Set(L.favs.regions), taken = new Set(L.animals.flatMap(a => a.p.regions));
      for (let r = 0; r < this.paths.length; r++) {
        if (fav.has(r)) this.#region(r, { stroke: L.favs.color, width: 2.5 });
        else if (!taken.has(r)) this.#region(r, { fill: 'rgba(244, 239, 230, .6)' });
      }
    }
    for (const r of L.marks) this.#region(r, { fill: 'rgba(255, 255, 255, .45)', stroke: 'rgba(19, 41, 61, .35)', width: 1.5, dash: [4, 3] });

    // Orte der Tiere einfärben
    for (const a of L.animals) {
      const color = a.invalid ? '#e2574c' : ANIMALS[a.p.animal].color;
      for (const r of a.p.regions) {
        this.#region(r, {
          fill: hexAlpha(color, a.ghost || a.dim ? 0.25 : 0.5),
          stroke: '#fff', width: 3,
        });
        this.#region(r, { stroke: color, width: 1.5, dash: a.selected ? [5, 3] : null });
      }
    }

    const covered = new Set(L.animals.flatMap(a => a.p.regions));
    for (const s of L.shots) {
      const [x, y] = this.center(s.r);
      if (s.result === 'miss') {
        drawMiss(ctx, x, y, u * 0.9);
        if (s.tracks) drawTracks(ctx, x + u * 0.42, y - u * 0.36, u * 0.55);
      } else if (!covered.has(s.r)) drawHit(ctx, x, y, u * 0.9);
    }

    for (const a of L.animals) {
      const [x, y] = this.#anchor(a.p.regions);
      drawSticker(ctx, a.p.animal, x, y, u * 1.15, a);
      // Treffer auf sichtbaren Tieren: kleine Pfote je getroffenem Ort
      for (const r of a.p.regions) {
        if (!L.shots.some(s => s.r === r && s.result !== 'miss')) continue;
        const [hx, hy] = this.center(r);
        const near = Math.hypot(hx - x, hy - y) < u * 0.6;
        drawHit(ctx, near ? x + u * 0.5 : hx, near ? y + u * 0.45 : hy, u * 0.5);
      }
    }

    if (L.last != null) this.#region(L.last, { stroke: ORANGE, width: 3 });
    if (L.hover != null && !L.disabled) this.#region(L.hover, { stroke: 'rgba(19,41,61,.55)', width: 2.5 });
    if (L.aim != null) this.#crosshair(L.aim);
    if (L.disabled) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = 'rgba(244, 239, 230, .35)';
      ctx.fillRect(0, 0, this.cssSize, this.cssSize);
    }
  }

  /** Sticker-Platz: Beschriftungspunkt des Orts, der dem Schwerpunkt am nächsten liegt. */
  #anchor(ids) {
    const pts = ids.map(r => this.center(r));
    const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length, my = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    return pts.reduce((best, p) => (Math.hypot(p[0] - mx, p[1] - my) < Math.hypot(best[0] - mx, best[1] - my) ? p : best), pts[0]);
  }

  #region(r, { fill = null, stroke = null, width = 2, dash = null }) {
    const ctx = this.canvas.getContext('2d');
    const path = this.paths[r];
    if (!path) return;
    const S = this.S;
    ctx.save();
    ctx.scale(S, S);
    if (fill) { ctx.fillStyle = fill; ctx.fill(path); }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width / S;
      ctx.lineJoin = 'round';
      if (dash) ctx.setLineDash(dash.map(v => v / S));
      ctx.stroke(path);
    }
    ctx.restore();
  }

  #crosshair(r) {
    const ctx = this.canvas.getContext('2d');
    this.#region(r, { fill: 'rgba(239, 111, 83, .22)', stroke: ORANGE, width: 3 });
    const [cx, cy] = this.center(r);
    const u = this.unit * 0.55;
    ctx.save();
    ctx.strokeStyle = ORANGE;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, u * 0.7, 0, Math.PI * 2);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      ctx.moveTo(cx + dx * u * 0.35, cy + dy * u * 0.35);
      ctx.lineTo(cx + dx * u, cy + dy * u);
    }
    ctx.stroke();
    ctx.restore();
  }

  /** Ort unter einem Zeigerereignis oder null. */
  regionAt(e) {
    const [px, py] = this.#local(e);
    if (px < 0 || py < 0 || px > this.cssSize || py > this.cssSize) return null;
    const [x, y] = toBoard(px, py, this.v, this.scale);
    for (let r = 0; r < this.paths.length; r++) if (this.hitCtx.isPointInPath(this.paths[r], x, y)) return r;
    // in einer Fuge: nächstgelegener Beschriftungspunkt
    let best = null, bd = Infinity;
    this.board.regions.forEach((reg, r) => {
      const d = Math.hypot(reg.c[0] - x, reg.c[1] - y);
      if (d < bd) { bd = d; best = r; }
    });
    return bd < this.board.size / 12 / this.v.z ? best : null;
  }

  #local(e) {
    const rect = this.canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  #zoomButtons() {
    const box = document.createElement('div');
    box.className = 'zoom-ctl';
    box.innerHTML = `<button type="button" data-z="in" aria-label="Hineinzoomen">＋</button>
      <button type="button" data-z="out" aria-label="Herauszoomen">−</button>
      <button type="button" data-z="all" aria-label="Ganzes Revier zeigen" title="Übersicht">⤢</button>`;
    box.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      const mid = this.cssSize / 2;
      if (b.dataset.z === 'all') this.resetZoom();
      else this.#setView(zoomAt(this.v, this.cssSize, this.v.z * (b.dataset.z === 'in' ? BUTTON_STEP : 1 / BUTTON_STEP), mid, mid));
    });
    this.frame.appendChild(box);
    this.zoomBox = box;
    this.canvas.style.touchAction = 'pan-y';
    this.#updateButtons();
  }

  #updateButtons() {
    if (!this.zoomBox) return;
    this.zoomBox.querySelector('[data-z=in]').disabled = this.v.z >= MAX_Z;
    for (const k of ['out', 'all']) this.zoomBox.querySelector(`[data-z=${k}]`).hidden = this.v.z <= 1;
  }

  /** Orte so klein, dass der erste Tipp besser nur heranzoomt? */
  #needsLoupe() {
    return this.v.z === 1 && this.cssSize / Math.sqrt(this.board.regions.length) < LOUPE_CELL;
  }

  #bindPointer() {
    const c = this.canvas;
    const pts = new Map();   // aktive Zeiger: id → [x, y]
    let g = null;            // laufende Geste
    const start = () => {
      const list = [...pts.values()];
      if (list.length >= 2) {
        const [a, b] = list;
        g = { pinch: true, moved: true, d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], v: this.v };
      } else g = { pinch: false, moved: g?.moved ?? false, p: list[0], v: this.v };
    };
    c.addEventListener('pointerdown', e => {
      const first = !pts.size;
      pts.set(e.pointerId, this.#local(e));
      if (this.zoomable) try { c.setPointerCapture(e.pointerId); } catch { /* Zeiger schon weg */ }
      if (first) g = null;
      start();
      if (first) this.onPointer('down', this.regionAt(e), e);
    });
    c.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) {
        if (e.pointerType !== 'mouse') return;
        const r = this.regionAt(e);
        if (this.layers.hover !== r) { this.set({ hover: r }); this.onPointer('hover', r, e); }
        return;
      }
      const p = this.#local(e);
      pts.set(e.pointerId, p);
      if (!this.zoomable) return;
      if (g.pinch) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        // der Brettpunkt unter dem anfänglichen Fingermittelpunkt folgt den Fingern
        const z = Math.min(MAX_Z, Math.max(1, g.v.z * d / g.d));
        const bx = (g.m[0] + g.v.tx) / g.v.z, by = (g.m[1] + g.v.ty) / g.v.z;
        this.#setView(clampView({ z, tx: bx * z - m[0], ty: by * z - m[1] }, this.cssSize), true);
        return;
      }
      const dx = p[0] - g.p[0], dy = p[1] - g.p[1];
      if (!g.moved && Math.hypot(dx, dy) > TAP_SLOP) g.moved = true;
      if (g.moved && g.v.z > 1) this.#setView(clampView({ z: g.v.z, tx: g.v.tx - dx, ty: g.v.ty - dy }, this.cssSize), true);
    });
    const end = (e, cancel) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      const tap = !g.moved;
      if (pts.size) { start(); return; }
      g = null;
      if (cancel) this.onPointer('cancel', null, e);
      else if (!this.zoomable) this.onPointer('up', this.regionAt(e), e);
      else if (tap && this.#needsLoupe()) {
        const [x, y] = this.#local(e);
        this.#setView(zoomAt(this.v, this.cssSize, LOUPE_Z, x, y));
        this.onPointer('up', null, e);
      } else this.onPointer('up', tap ? this.regionAt(e) : null, e);
    };
    c.addEventListener('pointerup', e => end(e, false));
    c.addEventListener('pointercancel', e => end(e, true));
    c.addEventListener('pointerleave', e => { if (this.layers.hover != null) { this.set({ hover: null }); this.onPointer('hover', null, e); } });
    if (this.zoomable) {
      c.addEventListener('wheel', e => {
        e.preventDefault();
        const [x, y] = this.#local(e);
        const f = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0018));
        this.#setView(zoomAt(this.v, this.cssSize, this.v.z * f, x, y), true);
      }, { passive: false });
    }
  }
}

function hexAlpha(hex, a) {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${v >> 16}, ${(v >> 8) & 255}, ${v & 255}, ${a})`;
}
