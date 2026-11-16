import { esc, fmtSim, fmtInt, cssVar, showTip, hideTip } from '../util.js';

/* Ansicht „Cluster & Karte": 2D-Streudiagramm aller Seiten + Clusterliste. */
export class MapView {
  constructor(el, ctx) {
    this.el = el;
    this.ctx = ctx;
    this.mode = 'nb';
    this.selCluster = -1;
    this.selPage = -1;
    this.view = { s: 1, x: 0, y: 0 }; // Zoom/Pan in Bildschirmpixeln
    el.innerHTML = `
      <div class="map-layout">
        <div class="card" style="margin:0">
          <div class="row" style="justify-content:space-between;margin-bottom:10px">
            <label class="field" style="flex-direction:row;align-items:center;gap:8px"><span>Anordnung</span>
              <select id="mv-mode"><option value="nb">Nachbarschaft (empfohlen)</option><option value="pca">PCA (lineare Projektion)</option></select></label>
            <span class="muted small">Mausrad/Pinch zoomt · Ziehen verschiebt · Klick wählt Seite</span>
          </div>
          <div class="canvas-wrap" id="mv-wrap">
            <canvas id="mv-c" role="img" aria-label="Karte aller Seiten nach inhaltlicher Nähe"></canvas>
            <div class="zoom"><button class="btn" id="mv-in" aria-label="Hineinzoomen">+</button><button class="btn" id="mv-out" aria-label="Herauszoomen">−</button><button class="btn" id="mv-reset" aria-label="Ansicht zurücksetzen">⤢</button></div>
          </div>
          <div class="legend" id="mv-legend"></div>
          <div class="info-panel" id="mv-info"></div>
        </div>
        <div class="card" style="margin:0">
          <h3>Cluster (${fmtInt(ctx.cl.list.length)})</h3>
          <p class="muted small" style="margin-top:0">Beschriftung aus häufigen URL- und Titelbegriffen. „Zusammenhalt" = mittlere Ähnlichkeit innerhalb des Clusters.</p>
          <ul class="clist" id="mv-list"></ul>
        </div>
      </div>`;
    this.c = el.querySelector('#mv-c');
    this.wrap = el.querySelector('#mv-wrap');
    el.querySelector('#mv-mode').addEventListener('change', (e) => { this.mode = e.target.value; this.prepare(); this.resetView(); });
    el.querySelector('#mv-in').addEventListener('click', () => this.zoomAt(1.5));
    el.querySelector('#mv-out').addEventListener('click', () => this.zoomAt(1 / 1.5));
    el.querySelector('#mv-reset').addEventListener('click', () => this.resetView());
    this.renderList();
    el.querySelector('#mv-list').addEventListener('click', (e) => {
      const li = e.target.closest('li[data-c]');
      if (!li) return;
      const id = +li.dataset.c;
      this.selCluster = this.selCluster === id ? -1 : id;
      this.renderList(); this.draw(); this.renderInfo();
    });
    el.querySelector('#mv-info').addEventListener('click', (e) => {
      const t = e.target.closest('[data-open],[data-hm]');
      if (!t) return;
      if (t.dataset.open != null) ctx.go('search', { page: +t.dataset.open });
      else ctx.go('heatmap', { mode: 'cluster', cluster: +t.dataset.hm });
    });
    this.bindPointer();
    new ResizeObserver(() => this.resize()).observe(this.wrap);
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.draw());
    this.prepare();
  }

  show(params) {
    if (params) {
      if (params.cluster != null) this.selCluster = params.cluster;
      if (params.page != null) {
        this.selPage = params.page;
        if (params.cluster == null) this.selCluster = this.ctx.res.asg[params.page];
      }
      this.renderList();
      this.renderInfo();
    }
    requestAnimationFrame(() => this.resize());
  }

  /* Datenkoordinaten auf [0,1] normieren (robust gegen Ausreißer). */
  prepare() {
    const { ds, res } = this.ctx;
    const src = this.mode === 'nb' ? res.nbXY : res.pcaXY;
    const n = ds.n;
    const xs = new Float32Array(n), ys = new Float32Array(n);
    for (let i = 0; i < n; i++) { xs[i] = src[2 * i]; ys[i] = src[2 * i + 1]; }
    const q = (arr, p) => { const s = Float32Array.from(arr).sort(); return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))))]; };
    const x0 = q(xs, 0.002), x1 = q(xs, 0.998), y0 = q(ys, 0.002), y1 = q(ys, 0.998);
    const span = Math.max(x1 - x0, y1 - y0) || 1;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    this.P = new Float32Array(2 * n);
    for (let i = 0; i < n; i++) {
      this.P[2 * i] = 0.5 + (xs[i] - cx) / span / 1.08;
      this.P[2 * i + 1] = 0.5 - (ys[i] - cy) / span / 1.08;
    }
    // Clusterbeschriftungen an der Median-Position
    this.labelPos = new Map();
    for (const c of this.ctx.cl.list.slice(0, 14)) {
      const mx = c.members.map((i) => this.P[2 * i]).sort((a, b) => a - b);
      const my = c.members.map((i) => this.P[2 * i + 1]).sort((a, b) => a - b);
      // Beschriftung über dem Cluster (oberes 5-%-Quantil), damit sie keine Punkte verdeckt
      this.labelPos.set(c.id, [mx[mx.length >> 1], my[Math.floor(my.length * 0.05)]]);
    }
  }

  resetView() { this.view = { s: 1, x: 0, y: 0 }; this.draw(); }

  resize() {
    if (this.el.hidden) return;
    const r = this.wrap.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.W = r.width; this.H = r.height;
    this.c.width = Math.round(r.width * dpr); this.c.height = Math.round(r.height * dpr);
    this.dpr = dpr;
    this.draw();
  }

  toScreen(i) {
    const base = Math.min(this.W, this.H);
    const ox = (this.W - base) / 2, oy = (this.H - base) / 2;
    return [(ox + this.P[2 * i] * base) * this.view.s + this.view.x, (oy + this.P[2 * i + 1] * base) * this.view.s + this.view.y];
  }

  draw() {
    if (!this.W || this.el.hidden) return;
    const { ds, res, cl } = this.ctx;
    const g = this.c.getContext('2d');
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.W, this.H);
    const n = ds.n;
    const pointCol = cssVar('--point'), accent = cssVar('--accent'), hi = cssVar('--hi'), surface = cssVar('--surface'), ink = cssVar('--ink'), ink2 = cssVar('--ink-2');
    const r = n > 15000 ? 1.2 : n > 4000 ? 1.6 : 2.2;
    const sx = new Float32Array(n), sy = new Float32Array(n);
    // Raster für Hover-Suche
    const cell = 12;
    const gw = Math.ceil(this.W / cell) + 1, gh = Math.ceil(this.H / cell) + 1;
    const grid = new Map();
    g.fillStyle = pointCol;
    const selC = this.selCluster;
    for (let i = 0; i < n; i++) {
      const [x, y] = this.toScreen(i);
      sx[i] = x; sy[i] = y;
      if (x < -4 || y < -4 || x > this.W + 4 || y > this.H + 4) continue;
      const key = Math.floor(y / cell) * gw + Math.floor(x / cell);
      const b = grid.get(key); if (b) b.push(i); else grid.set(key, [i]);
      if (selC >= 0 && res.asg[i] === selC) continue;
      g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    this.sx = sx; this.sy = sy; this.grid = grid; this.gw = gw; this.cell = cell;
    if (selC >= 0) {
      g.fillStyle = accent;
      const rr = r + 1;
      for (const i of cl.byId.get(selC).members) {
        g.beginPath(); g.arc(sx[i], sy[i], rr, 0, Math.PI * 2); g.fill();
      }
    }
    if (this.selPage >= 0) {
      const i = this.selPage, K = res.top.K;
      g.strokeStyle = hi; g.lineWidth = 1;
      g.globalAlpha = 0.55;
      for (let q = 0; q < Math.min(10, K); q++) {
        const j = res.top.idx[i * K + q]; if (j < 0) break;
        g.beginPath(); g.moveTo(sx[i], sy[i]); g.lineTo(sx[j], sy[j]); g.stroke();
      }
      g.globalAlpha = 1;
      for (let q = 0; q < Math.min(10, K); q++) {
        const j = res.top.idx[i * K + q]; if (j < 0) break;
        dot(g, sx[j], sy[j], 4, hi, surface);
      }
      dot(g, sx[i], sy[i], 7, hi, surface);
    }
    // Beschriftung der größten Cluster
    g.font = '600 12px system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round';
    for (const [id, [px, py]] of this.labelPos) {
      const c = cl.byId.get(id);
      const base = Math.min(this.W, this.H);
      const x = ((this.W - base) / 2 + px * base) * this.view.s + this.view.x;
      const y = ((this.H - base) / 2 + py * base) * this.view.s + this.view.y - 12;
      if (x < 0 || y < 0 || x > this.W || y > this.H) continue;
      const txt = `${c.name} ${c.label.split(' · ')[0]}`;
      g.lineWidth = 4; g.strokeStyle = surface; g.strokeText(txt, x, y);
      g.fillStyle = id === selC ? ink : ink2; g.fillText(txt, x, y);
    }
    const leg = [`<span><i style="background:${pointCol}"></i>Seite</span>`];
    if (selC >= 0) leg.push(`<span><i style="background:${accent}"></i>${esc(cl.byId.get(selC).name)} · ${esc(cl.byId.get(selC).label)}</span>`);
    if (this.selPage >= 0) leg.push(`<span><i style="background:${hi}"></i>Gewählte Seite und ihre 10 nächsten Nachbarn</span>`);
    this.el.querySelector('#mv-legend').innerHTML = leg.join('');
  }

  pick(x, y) {
    if (!this.grid) return -1;
    const cx = Math.floor(x / this.cell), cy = Math.floor(y / this.cell);
    let best = -1, bd = 10 * 10;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const b = this.grid.get((cy + dy) * this.gw + (cx + dx));
      if (!b) continue;
      for (const i of b) { const d = (this.sx[i] - x) ** 2 + (this.sy[i] - y) ** 2; if (d < bd) { bd = d; best = i; } }
    }
    return best;
  }

  zoomAt(f, x = this.W / 2, y = this.H / 2) {
    const s = Math.max(0.5, Math.min(60, this.view.s * f));
    const k = s / this.view.s;
    this.view.x = x - (x - this.view.x) * k;
    this.view.y = y - (y - this.view.y) * k;
    this.view.s = s;
    this.draw();
  }

  bindPointer() {
    const c = this.c;
    const pts = new Map();
    let moved = false, lastDist = 0;
    const pos = (e) => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    c.addEventListener('wheel', (e) => { e.preventDefault(); const [x, y] = pos(e); this.zoomAt(Math.exp(-e.deltaY * 0.0015), x, y); }, { passive: false });
    c.addEventListener('pointerdown', (e) => { c.setPointerCapture(e.pointerId); pts.set(e.pointerId, pos(e)); moved = false; if (pts.size === 2) { const [a, b] = [...pts.values()]; lastDist = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
    c.addEventListener('pointermove', (e) => {
      const p = pos(e);
      if (pts.has(e.pointerId)) {
        const prev = pts.get(e.pointerId);
        if (pts.size === 1) {
          const dx = p[0] - prev[0], dy = p[1] - prev[1];
          if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
          if (moved) { this.view.x += dx; this.view.y += dy; this.draw(); }
          pts.set(e.pointerId, p);
        } else if (pts.size === 2) {
          pts.set(e.pointerId, p);
          const [a, b] = [...pts.values()];
          const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
          if (lastDist) this.zoomAt(dist / lastDist, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
          lastDist = dist; moved = true;
        }
        hideTip();
        return;
      }
      const i = this.pick(p[0], p[1]);
      if (i >= 0) {
        const { ds, cl } = this.ctx;
        const k = cl.pageCluster(i);
        showTip(`<b>${esc(this.ctx.short(ds.urls[i]))}</b>${ds.titles && ds.titles[i] ? '<br>' + esc(ds.titles[i]) : ''}<br><span class="muted">${esc(k.name)} · ${esc(k.label)}</span>`, e.clientX, e.clientY);
        c.style.cursor = 'pointer';
      } else { hideTip(); c.style.cursor = 'crosshair'; }
    });
    const up = (e) => {
      const p = pos(e);
      if (pts.size === 1 && !moved) {
        const i = this.pick(p[0], p[1]);
        this.selPage = i;
        if (i >= 0) this.selCluster = this.ctx.res.asg[i];
        this.renderList(); this.draw(); this.renderInfo();
      }
      pts.delete(e.pointerId);
      if (pts.size < 2) lastDist = 0;
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', (e) => pts.delete(e.pointerId));
    c.addEventListener('pointerleave', () => hideTip());
  }

  renderList() {
    const { cl } = this.ctx;
    const ul = this.el.querySelector('#mv-list');
    ul.innerHTML = cl.list.map((c) => `<li data-c="${c.id}" class="${c.id === this.selCluster ? 'sel' : ''}">
      <div class="cl-top"><span>${esc(c.name)} · ${esc(c.label)}</span><span class="num">${fmtInt(c.size)}</span></div>
      <div class="muted small">Zusammenhalt ${fmtSim(c.cohesion)}</div></li>`).join('');
    const sel = ul.querySelector('.sel');
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  }

  renderInfo() {
    const { ds, cl, short, res } = this.ctx;
    const box = this.el.querySelector('#mv-info');
    const parts = [];
    if (this.selPage >= 0) {
      const i = this.selPage;
      parts.push(`<div class="row" style="justify-content:space-between"><div style="min-width:0"><span class="u">${esc(short(ds.urls[i]))}</span>${ds.titles && ds.titles[i] ? `<span class="ut">${esc(ds.titles[i])}</span>` : ''}</div>
        <button class="btn" data-open="${i}">Ähnliche Seiten</button></div>`);
    }
    if (this.selCluster >= 0) {
      const c = cl.byId.get(this.selCluster);
      const ex = c.members.slice(0, 6);
      parts.push(`<h3 style="margin-top:14px">${esc(c.name)} · ${esc(c.label)} – ${fmtInt(c.size)} Seiten</h3>
        <table class="list"><tbody>${ex.map((i) => `<tr class="click" data-open="${i}"><td><span class="u">${esc(short(ds.urls[i]))}</span></td><td style="width:90px" class="num muted">${fmtSim(res.centerSim[i])}</td></tr>`).join('')}</tbody></table>
        <div class="row" style="margin-top:8px"><span class="muted small">Typischste Seiten (Nähe zum Zentrum)</span><button class="btn" data-hm="${c.id}">Heatmap dieses Clusters</button></div>`);
    }
    box.innerHTML = parts.join('');
  }
}

function dot(g, x, y, r, fill, ring) {
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = fill; g.fill();
  g.lineWidth = 2; g.strokeStyle = ring; g.stroke();
}
