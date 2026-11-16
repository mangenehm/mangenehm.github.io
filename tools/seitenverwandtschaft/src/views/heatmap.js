import { esc, fmtSim, fmtInt, rampColor, rampGradientCss, cssVar, showTip, hideTip } from '../util.js';
import { chainOrder } from '../clusters.js';

const MAX_PAGES = 240;

/* Ansicht „Heatmap": Cluster × Cluster oder eine Auswahl von Seiten. */
export class HeatmapView {
  constructor(el, ctx) {
    this.el = el;
    this.ctx = ctx;
    this.mode = 'clusters';
    this.a = ctx.cl.list[0].id;
    this.b = (ctx.cl.list[1] || ctx.cl.list[0]).id;
    this.page = -1;
    const copts = ctx.cl.list.map((c) => `<option value="${c.id}">${esc(c.name)} · ${esc(c.label)} (${fmtInt(c.size)})</option>`).join('');
    el.innerHTML = `
      <div class="hm-layout">
        <div class="card" style="margin:0">
          <div class="hm-wrap" id="hm-wrap"><canvas id="hm-c" role="img" aria-label="Ähnlichkeits-Heatmap"></canvas></div>
          <div class="ramp-row"><span class="num" id="hm-lo"></span><span class="ramp" id="hm-ramp"></span><span class="num" id="hm-hi"></span><span class="muted">Kosinus-Ähnlichkeit</span></div>
        </div>
        <div class="card" style="margin:0">
          <label class="field"><span>Ansicht</span><select id="hm-mode">
            <option value="clusters">Cluster × Cluster</option>
            <option value="cluster">Seiten eines Clusters</option>
            <option value="two">Zwei Cluster im Vergleich</option>
            <option value="page">Seite und ihre Nachbarschaft</option></select></label>
          <label class="field" id="hm-fa" style="margin-top:10px"><span>Cluster</span><select id="hm-a">${copts}</select></label>
          <label class="field" id="hm-fb" style="margin-top:10px"><span>Zweiter Cluster</span><select id="hm-b">${copts}</select></label>
          <p class="muted small" id="hm-desc"></p>
          <div id="hm-side"></div>
        </div>
      </div>`;
    this.c = el.querySelector('#hm-c');
    this.wrap = el.querySelector('#hm-wrap');
    el.querySelector('#hm-mode').addEventListener('change', (e) => { this.mode = e.target.value; this.build(); });
    el.querySelector('#hm-a').addEventListener('change', (e) => { this.a = +e.target.value; this.build(); });
    el.querySelector('#hm-b').addEventListener('change', (e) => { this.b = +e.target.value; this.build(); });
    el.querySelector('#hm-side').addEventListener('click', (e) => {
      const t = e.target.closest('[data-two]');
      if (t) { const [a, b] = t.dataset.two.split(',').map(Number); this.show({ mode: 'two', a, b }); }
    });
    this.c.addEventListener('mousemove', (e) => this.hover(e));
    this.c.addEventListener('mouseleave', hideTip);
    this.c.addEventListener('click', (e) => this.click(e));
    new ResizeObserver(() => this.draw()).observe(this.wrap);
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.draw());
    this.built = false;
  }

  show(params) {
    if (params) {
      if (params.mode) this.mode = params.mode;
      if (params.page != null) this.page = params.page;
      if (params.cluster != null) this.a = params.cluster;
      if (params.a != null) this.a = params.a;
      if (params.b != null) this.b = params.b;
      this.build();
    } else if (!this.built) this.build();
    else requestAnimationFrame(() => this.draw());
  }

  build() {
    this.built = true;
    const { cl, ds, res, short } = this.ctx;
    if (this.mode === 'page' && this.page < 0) this.page = cl.list[0].members[0];
    this.el.querySelector('#hm-mode').value = this.mode;
    this.el.querySelector('#hm-a').value = this.a;
    this.el.querySelector('#hm-b').value = this.b;
    this.el.querySelector('#hm-fa').hidden = !(this.mode === 'cluster' || this.mode === 'two');
    this.el.querySelector('#hm-fb').hidden = this.mode !== 'two';
    const desc = this.el.querySelector('#hm-desc');
    const side = this.el.querySelector('#hm-side');
    side.innerHTML = '';

    if (this.mode === 'clusters') {
      const m = cl.list.length;
      const order = chainOrder(m, (i, j) => cl.between[i * m + j]);
      this.items = order.map((r) => ({ label: cl.list[r].name, full: `${cl.list[r].name} · ${cl.list[r].label} (${fmtInt(cl.list[r].size)} Seiten)`, cluster: cl.list[r].id }));
      this.M = (i, j) => cl.between[order[i] * m + order[j]];
      desc.textContent = 'Jede Zelle zeigt die mittlere Ähnlichkeit aller Seiten zweier Cluster, die Diagonale den Zusammenhalt innerhalb eines Clusters. Ähnliche Cluster stehen nebeneinander. Klick auf eine Zelle zeigt die Seiten beider Cluster.';
      // Tabellenansicht: ähnlichste Clusterpaare
      const pairs = [];
      for (let i = 0; i < m; i++) for (let j = i + 1; j < m; j++) pairs.push([i, j, cl.between[i * m + j]]);
      pairs.sort((x, y) => y[2] - x[2]);
      side.innerHTML = `<h3 style="margin-top:14px">Ähnlichste Clusterpaare</h3>
        <table class="list"><tbody>${pairs.slice(0, 12).map(([i, j, v]) => `<tr class="click" data-two="${cl.list[i].id},${cl.list[j].id}">
          <td><span class="u">${esc(cl.list[i].name)} · ${esc(cl.list[i].label)}</span><span class="ut">${esc(cl.list[j].name)} · ${esc(cl.list[j].label)}</span></td>
          <td class="num" style="width:64px">${fmtSim(v)}</td></tr>`).join('')}</tbody></table>`;
    } else {
      let idx;
      if (this.mode === 'cluster') {
        idx = sampleEven(cl.byId.get(this.a).members, MAX_PAGES);
        const c = cl.byId.get(this.a);
        desc.textContent = `${fmtInt(idx.length)} von ${fmtInt(c.size)} Seiten aus ${c.name}, so sortiert, dass ähnliche Seiten nebeneinander liegen. Klick öffnet die Seite der Zeile.`;
      } else if (this.mode === 'two') {
        const A = sampleEven(cl.byId.get(this.a).members, MAX_PAGES / 2);
        const B = this.a === this.b ? [] : sampleEven(cl.byId.get(this.b).members, MAX_PAGES / 2);
        idx = [...A, ...B];
        this.split = A.length;
        desc.textContent = `Links/oben ${cl.byId.get(this.a).name}, rechts/unten ${cl.byId.get(this.b).name} (je bis zu ${MAX_PAGES / 2} Seiten). Kräftig gefärbte Zellen in den Feldern rechts oben und links unten zeigen Seiten, die thematisch in beide Cluster passen.`;
      } else {
        const set = new Set([this.page]);
        const K = res.top.K;
        for (let q = 0; q < K; q++) { const j = res.top.idx[this.page * K + q]; if (j >= 0) set.add(j); }
        for (const i of [...set]) for (let q = 0; q < Math.min(K, 8) && set.size < 120; q++) { const j = res.top.idx[i * K + q]; if (j >= 0) set.add(j); }
        idx = [...set];
        desc.innerHTML = `Seite <b>${esc(short(ds.urls[this.page]))}</b>, ihre Nachbarn und deren Nachbarn (${fmtInt(idx.length)} Seiten).`;
      }
      const m = idx.length, d = ds.d, X = ds.X;
      const S = new Float32Array(m * m);
      for (let i = 0; i < m; i++) {
        const o = idx[i] * d;
        S[i * m + i] = 1;
        for (let j = i + 1; j < m; j++) {
          const p = idx[j] * d;
          let s = 0;
          for (let k = 0; k < d; k++) s += X[o + k] * X[p + k];
          S[i * m + j] = s; S[j * m + i] = s;
        }
      }
      let order;
      if (this.mode === 'two') {
        const sub = (lo, hi) => { const ids = []; for (let i = lo; i < hi; i++) ids.push(i); return chainOrder(ids.length, (x, y) => S[ids[x] * m + ids[y]]).map((x) => ids[x]); };
        order = [...sub(0, this.split), ...sub(this.split, m)];
      } else order = chainOrder(m, (i, j) => S[i * m + j]);
      if (this.mode === 'page') { const p = order.indexOf(0); order.splice(p, 1); order.unshift(0); }
      this.items = order.map((r) => ({ page: idx[r], label: '', full: short(ds.urls[idx[r]]) + (ds.titles && ds.titles[idx[r]] ? ' – ' + ds.titles[idx[r]] : '') }));
      this.M = (i, j) => S[order[i] * m + order[j]];
    }
    // Farbskala: robuste Spannweite der Werte außerhalb der Diagonale
    const m = this.items.length, vals = [];
    for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) if (i !== j || this.mode === 'clusters') vals.push(this.M(i, j));
    vals.sort((x, y) => x - y);
    this.lo = vals.length ? vals[Math.floor(vals.length * 0.02)] : 0;
    this.hi = vals.length ? vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.995))] : 1;
    if (this.hi - this.lo < 0.01) this.hi = this.lo + 0.01;
    this.el.querySelector('#hm-lo').textContent = fmtSim(this.lo);
    this.el.querySelector('#hm-hi').textContent = fmtSim(this.hi);
    this.draw();
  }

  geometry() {
    const m = this.items.length;
    const W = this.wrap.clientWidth;
    const labels = this.mode === 'clusters' && m <= 60;
    const margin = labels ? 36 : 4;
    const cs = (W - margin - 4) / m;
    return { m, W, margin, cs, labels };
  }

  draw() {
    if (this.el.hidden || !this.items) return;
    const { m, W, margin, cs, labels } = this.geometry();
    if (!W) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.c.width = Math.round(W * dpr); this.c.height = Math.round(W * dpr);
    const g = this.c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = cssVar('--surface');
    g.fillRect(0, 0, W, W);
    const gap = cs >= 8 ? 2 : cs >= 4 ? 1 : 0;
    const span = this.hi - this.lo;
    for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) {
      g.fillStyle = rampColor((this.M(i, j) - this.lo) / span);
      g.fillRect(margin + j * cs, margin + i * cs, Math.max(0.6, cs - gap), Math.max(0.6, cs - gap));
    }
    if (this.mode === 'two' && this.split > 0 && this.split < m) {
      g.strokeStyle = cssVar('--ink'); g.lineWidth = 1.5;
      const p = margin + this.split * cs - gap / 2;
      g.beginPath(); g.moveTo(p, margin); g.lineTo(p, margin + m * cs); g.moveTo(margin, p); g.lineTo(margin + m * cs, p); g.stroke();
    }
    if (labels) {
      g.fillStyle = cssVar('--muted');
      const fs = Math.max(8, Math.min(11, cs * 0.8));
      g.font = `${fs}px system-ui, sans-serif`;
      const every = Math.ceil(fs / cs);
      g.textAlign = 'right'; g.textBaseline = 'middle';
      for (let i = 0; i < m; i += every) g.fillText(this.items[i].label, margin - 4, margin + (i + 0.5) * cs);
      g.save();
      for (let j = 0; j < m; j += every) {
        g.save(); g.translate(margin + (j + 0.5) * cs, margin - 4); g.rotate(-Math.PI / 2);
        g.textAlign = 'left'; g.fillText(this.items[j].label, 0, 0); g.restore();
      }
      g.restore();
    }
    this.el.querySelector('#hm-ramp').style.background = rampGradientCss();
  }

  cellAt(e) {
    const { m, margin, cs } = this.geometry();
    const r = this.c.getBoundingClientRect();
    const j = Math.floor((e.clientX - r.left - margin) / cs), i = Math.floor((e.clientY - r.top - margin) / cs);
    return i >= 0 && j >= 0 && i < m && j < m ? [i, j] : null;
  }

  hover(e) {
    const c = this.cellAt(e);
    if (!c) { hideTip(); return; }
    const [i, j] = c;
    const A = this.items[i], B = this.items[j];
    showTip(`${esc(A.full)}<br>↔ ${esc(B.full)}<br>Ähnlichkeit <b>${fmtSim(this.M(i, j))}</b>`, e.clientX, e.clientY);
  }

  click(e) {
    const c = this.cellAt(e);
    if (!c) return;
    const [i, j] = c;
    hideTip();
    if (this.mode === 'clusters') {
      const a = this.items[i].cluster, b = this.items[j].cluster;
      if (a === b) this.show({ mode: 'cluster', a });
      else this.show({ mode: 'two', a, b });
    } else this.ctx.go('search', { page: this.items[i].page });
  }
}

function sampleEven(arr, max) {
  if (arr.length <= max) return arr.slice();
  const out = [];
  const step = arr.length / max;
  for (let k = 0; k < max; k++) out.push(arr[Math.floor(k * step)]);
  return out;
}
