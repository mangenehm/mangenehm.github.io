/*
 * Brett-Canvas: Stadtplan (gecacht), Hervorhebungen je Ort, Tiere und
 * Suchmarker. Zeigerereignisse werden in Orte (Region-IDs) übersetzt.
 */

import { drawMap, regionPaths } from '../map/render.js';
import { drawSticker, drawMiss, drawHit, drawTracks } from './sprites.js';
import { ANIMALS } from '../engine/shapes.js';

const ORANGE = '#ef6f53';

export class BoardView {
  /**
   * @param {HTMLElement} host   Container; das Canvas füllt seine Breite
   * @param {object} board
   * @param {object} [o]
   * @param {(type:string, region:number|null, e:PointerEvent)=>void} [o.onPointer]
   * @param {number} [o.maxWidth]
   * @param {string} [o.label]  Barrierefreie Beschreibung
   * @param {boolean} [o.numbers]  Ortsnummern zeigen
   */
  constructor(host, board, { onPointer = null, maxWidth = 620, label = 'Spielbrett', numbers = true } = {}) {
    this.host = host;
    this.onPointer = onPointer;
    this.maxWidth = maxWidth;
    this.numbers = numbers;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'board-canvas';
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', label);
    host.appendChild(this.canvas);
    this.hitCtx = document.createElement('canvas').getContext('2d');
    this.layers = {
      animals: [],     // [{ p, glow, invalid, ghost, selected, dim }]
      shots: [],       // [{ r, result, tracks }]
      marks: [],       // [r] dezent hervorgehoben (z. B. mögliche Nachbarn)
      aim: null,       // r mit Fadenkreuz
      last: null,      // r zuletzt abgesucht
      hover: null,
      disabled: false,
    };
    this.setBoard(board, false);
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

  destroy() { this.ro.disconnect(); this.canvas.remove(); }

  resize() {
    const width = Math.max(200, Math.min(this.maxWidth, this.host.clientWidth || this.maxWidth));
    this.scale = width / this.board.size;
    this.cssSize = width;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.dpr = dpr;
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = width + 'px';
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(width * dpr);
    this.mapCache = null;
    this.draw();
  }

  #renderMap() {
    const c = document.createElement('canvas');
    c.width = this.canvas.width;
    c.height = this.canvas.height;
    const ctx = c.getContext('2d');
    ctx.scale(this.dpr, this.dpr);
    drawMap(ctx, this.board, this.scale, { numbers: this.numbers, paths: this.paths });
    this.mapCache = c;
  }

  /** Größe der Marker in CSS-Pixeln, passend zur Ortsgröße. */
  get unit() { return Math.max(18, Math.min(44, this.cssSize / Math.sqrt(this.board.regions.length) * 0.42)); }

  center(r) { const c = this.board.regions[r].c; return [c[0] * this.scale, c[1] * this.scale]; }

  draw() {
    if (!this.scale) return;
    if (!this.mapCache) this.#renderMap();
    const ctx = this.canvas.getContext('2d');
    const L = this.layers;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.mapCache, 0, 0);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const u = this.unit;

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
    ctx.save();
    ctx.scale(this.scale, this.scale);
    if (fill) { ctx.fillStyle = fill; ctx.fill(path); }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width / this.scale;
      ctx.lineJoin = 'round';
      if (dash) ctx.setLineDash(dash.map(v => v / this.scale));
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
    const rect = this.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / this.scale, y = (e.clientY - rect.top) / this.scale;
    if (x < 0 || y < 0 || x > this.board.size || y > this.board.size) return null;
    for (let r = 0; r < this.paths.length; r++) if (this.hitCtx.isPointInPath(this.paths[r], x, y)) return r;
    // in einer Fuge: nächstgelegener Beschriftungspunkt
    let best = null, bd = Infinity;
    this.board.regions.forEach((reg, r) => {
      const d = Math.hypot(reg.c[0] - x, reg.c[1] - y);
      if (d < bd) { bd = d; best = r; }
    });
    return bd < this.board.size / 12 ? best : null;
  }

  #bindPointer() {
    const c = this.canvas;
    c.addEventListener('pointerdown', e => this.onPointer('down', this.regionAt(e), e));
    c.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      const r = this.regionAt(e);
      if (this.layers.hover !== r) { this.set({ hover: r }); this.onPointer('hover', r, e); }
    });
    c.addEventListener('pointerup', e => this.onPointer('up', this.regionAt(e), e));
    c.addEventListener('pointercancel', e => this.onPointer('cancel', null, e));
    c.addEventListener('pointerleave', e => { if (this.layers.hover != null) { this.set({ hover: null }); this.onPointer('hover', null, e); } });
  }
}

function hexAlpha(hex, a) {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${v >> 16}, ${(v >> 8) & 255}, ${v & 255}, ${a})`;
}
