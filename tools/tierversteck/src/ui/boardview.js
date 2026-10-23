/*
 * Brett-Canvas: Karte (gecacht), Geländeflächen, Raster mit Koordinaten,
 * Tiere und Schussmarker. Zeigerereignisse werden in Zellen übersetzt.
 */

import { drawMap, drawTerrainOverlay, drawGrid } from '../map/render.js';
import { drawAnimal, drawMiss, drawHit, drawCounterBadge } from './sprites.js';
import { placementCells } from '../engine/shapes.js';

export class BoardView {
  /**
   * @param {HTMLElement} host   Container; das Canvas füllt seine Breite
   * @param {object} board
   * @param {object} [o]
   * @param {(type:string, cell:{x:number,y:number}|null, e:PointerEvent)=>void} [o.onPointer]
   * @param {number} [o.maxWidth]
   * @param {string} [o.label]  Barrierefreie Beschreibung
   */
  constructor(host, board, { onPointer = null, maxWidth = 620, label = 'Spielbrett' } = {}) {
    this.host = host;
    this.board = board;
    this.onPointer = onPointer;
    this.maxWidth = maxWidth;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'board-canvas';
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', label);
    host.appendChild(this.canvas);
    this.layers = {
      showTerrain: false,
      animals: [],     // [{ p, glow, invalid, ghost, selected, dim }]
      shots: [],       // [{ x, y, result, counter }]
      aim: null,       // {x, y} Fadenkreuz
      last: null,      // {x, y} zuletzt beschossen
      hover: null,
      disabled: false,
    };
    this.mapCache = null;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    if (onPointer) this.#bindPointer();
    this.resize();
  }

  set(partial) { Object.assign(this.layers, partial); this.draw(); }

  setBoard(board) { this.board = board; this.mapCache = null; this.resize(); }

  destroy() { this.ro.disconnect(); this.canvas.remove(); }

  resize() {
    const n = this.board.size;
    const width = Math.max(200, Math.min(this.maxWidth, this.host.clientWidth || this.maxWidth));
    // Rand für die Beschriftung: 0,75 Zellen links/oben
    const cell = (width - 4) / (n + 0.75);
    this.cell = cell;
    this.ox = cell * 0.75;
    this.oy = cell * 0.75;
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
    drawMap(ctx, this.board, this.cell, this.ox, this.oy);
    this.mapCache = c;
  }

  draw() {
    if (!this.cell) return;
    if (!this.mapCache) this.#renderMap();
    const ctx = this.canvas.getContext('2d');
    const { cell, ox, oy } = this;
    const n = this.board.size;
    const L = this.layers;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.mapCache, 0, 0);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    if (L.showTerrain) drawTerrainOverlay(ctx, this.board, cell, ox, oy);
    drawGrid(ctx, n, cell, ox, oy);

    for (const a of L.animals) drawAnimal(ctx, a.p, cell, ox, oy, a);

    const covered = new Set(L.animals.flatMap(a => placementCells(a.p).map(c => c.join())));
    for (const s of L.shots) {
      if (s.result === 'miss') drawMiss(ctx, s.x, s.y, cell, ox, oy);
      else drawHit(ctx, s.x, s.y, cell, ox, oy, { small: covered.has(s.x + ',' + s.y) });
      if (s.counter) drawCounterBadge(ctx, s.x, s.y, cell, ox, oy);
    }

    if (L.last) this.#ring(L.last, '#ef6f53', 0.08);
    if (L.hover && !L.disabled) this.#ring(L.hover, 'rgba(19,41,61,.45)', 0.05);
    if (L.aim) this.#crosshair(L.aim);
    if (L.disabled) {
      ctx.fillStyle = 'rgba(244, 239, 230, .35)';
      ctx.fillRect(ox, oy, n * cell, n * cell);
    }
  }

  #ring({ x, y }, color, w) {
    const ctx = this.canvas.getContext('2d');
    const { cell, ox, oy } = this;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, cell * w);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(ox + x * cell + 2, oy + y * cell + 2, cell - 4, cell - 4, cell * 0.18);
    else ctx.rect(ox + x * cell + 2, oy + y * cell + 2, cell - 4, cell - 4);
    ctx.stroke();
    ctx.restore();
  }

  #crosshair({ x, y }) {
    const ctx = this.canvas.getContext('2d');
    const { cell, ox, oy } = this;
    const cx = ox + (x + 0.5) * cell, cy = oy + (y + 0.5) * cell;
    const n = this.board.size;
    ctx.save();
    ctx.fillStyle = 'rgba(239, 111, 83, .14)';
    ctx.fillRect(ox, oy + y * cell, n * cell, cell);
    ctx.fillRect(ox + x * cell, oy, cell, n * cell);
    ctx.strokeStyle = '#ef6f53';
    ctx.lineWidth = Math.max(2, cell * 0.07);
    ctx.beginPath();
    ctx.arc(cx, cy, cell * 0.34, 0, Math.PI * 2);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      ctx.moveTo(cx + dx * cell * 0.18, cy + dy * cell * 0.18);
      ctx.lineTo(cx + dx * cell * 0.48, cy + dy * cell * 0.48);
    }
    ctx.stroke();
    ctx.restore();
  }

  /** Zelle unter einem Zeigerereignis oder null. */
  cellAt(e) {
    const r = this.canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left - this.ox) / this.cell);
    const y = Math.floor((e.clientY - r.top - this.oy) / this.cell);
    const n = this.board.size;
    return x >= 0 && y >= 0 && x < n && y < n ? { x, y } : null;
  }

  #bindPointer() {
    const c = this.canvas;
    c.style.touchAction = 'none';
    c.addEventListener('pointerdown', e => {
      c.setPointerCapture?.(e.pointerId);
      this.onPointer('down', this.cellAt(e), e);
    });
    c.addEventListener('pointermove', e => {
      const cell = this.cellAt(e);
      if (e.pointerType === 'mouse') {
        const h = this.layers.hover;
        if ((h?.x !== cell?.x) || (h?.y !== cell?.y)) this.set({ hover: cell });
      }
      this.onPointer('move', cell, e);
    });
    c.addEventListener('pointerup', e => this.onPointer('up', this.cellAt(e), e));
    c.addEventListener('pointercancel', e => this.onPointer('cancel', null, e));
    c.addEventListener('pointerleave', () => { if (this.layers.hover) this.set({ hover: null }); });
  }
}
