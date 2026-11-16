import { esc, fmtSim, fmtInt } from '../util.js';

const ROW_H = 52, ROW_H_MOBILE = 72;

/* Ansicht „Paare & Duplikate": virtuelle Liste aller gespeicherten Paare. */
export class PairsView {
  constructor(el, ctx) {
    this.el = el;
    this.ctx = ctx;
    const { res } = ctx;
    const lo = Math.floor(res.pairThr * 1000) / 1000;
    this.lo = lo;
    el.innerHTML = `
      <div class="card">
        <div class="pair-controls">
          <label class="field"><span>Mindest-Ähnlichkeit</span>
            <div class="range-wrap"><input type="range" id="pv-min" min="${lo}" max="1" step="0.001" value="${lo}"><b class="num" id="pv-minv">${fmtSim(lo)}</b></div></label>
          <label class="field"><span>URL-Filter</span><input type="text" id="pv-f" placeholder="z. B. /blog/"></label>
          <label class="field"><span>Cluster</span><select id="pv-cl">
            <option value="all">Alle Paare</option><option value="same">Im selben Cluster</option><option value="diff">Clusterübergreifend</option></select></label>
          <label class="field"><span>Sortierung</span><select id="pv-sort">
            <option value="desc">Ähnlichste zuerst</option><option value="asc">Am wenigsten ähnlich zuerst</option><option value="url">Nach URL A</option></select></label>
        </div>
        <p class="small" id="pv-count"></p>
        <div class="vlist" id="pv-list" tabindex="0" aria-label="Seitenpaare">
          <div class="vhead"><div>Seite A</div><div>Seite B</div><div>Ähnlichkeit</div><div class="ph">Hinweis</div></div>
          <div id="pv-body" style="position:relative"></div>
        </div>
        <p class="muted small" style="margin-bottom:0">⚠ Duplikat? = Ähnlichkeit ≥ 0,970 (sehr wahrscheinlich gleicher Inhalt) · ≈ sehr nah = ≥ 0,930 (mögliche Keyword-Kannibalisierung). Klick auf eine Zeile öffnet Seite A.</p>
      </div>`;
    this.list = el.querySelector('#pv-list');
    this.body = el.querySelector('#pv-body');
    const upd = () => this.filter();
    el.querySelector('#pv-min').addEventListener('input', (e) => { el.querySelector('#pv-minv').textContent = fmtSim(+e.target.value); this.schedule(); });
    el.querySelector('#pv-f').addEventListener('input', () => this.schedule());
    el.querySelector('#pv-cl').addEventListener('change', upd);
    el.querySelector('#pv-sort').addEventListener('change', upd);
    this.list.addEventListener('scroll', () => this.render());
    this.body.addEventListener('click', (e) => {
      const r = e.target.closest('[data-a]');
      if (r) ctx.go('search', { page: +r.dataset.a });
    });
    new ResizeObserver(() => this.render()).observe(this.list);
    this.filtered = null;
  }

  show() { if (!this.filtered) this.filter(); else this.render(); }

  schedule() {
    clearTimeout(this.t);
    this.t = setTimeout(() => this.filter(), 120);
  }

  filter() {
    const { res, ds, cl } = this.ctx;
    const p = res.pairs, asg = res.asg;
    const min = +this.el.querySelector('#pv-min').value;
    const f = this.el.querySelector('#pv-f').value.trim().toLowerCase();
    const mode = this.el.querySelector('#pv-cl').value;
    const sort = this.el.querySelector('#pv-sort').value;
    const out = [];
    for (let i = 0; i < p.s.length; i++) {
      if (p.s[i] < min) continue;
      const a = p.a[i], b = p.b[i];
      if (mode === 'same' && asg[a] !== asg[b]) continue;
      if (mode === 'diff' && asg[a] === asg[b]) continue;
      if (f && !ds.urls[a].toLowerCase().includes(f) && !ds.urls[b].toLowerCase().includes(f)) continue;
      out.push(i);
    }
    // Paare sind bereits absteigend sortiert
    if (sort === 'asc') out.reverse();
    else if (sort === 'url') out.sort((x, y) => (ds.urls[p.a[x]] < ds.urls[p.a[y]] ? -1 : ds.urls[p.a[x]] > ds.urls[p.a[y]] ? 1 : p.s[y] - p.s[x]));
    this.filtered = out;
    let dup = 0;
    for (const i of out) if (p.s[i] >= 0.97) dup++;
    this.el.querySelector('#pv-count').innerHTML = `<b>${fmtInt(out.length)}</b> Paare · davon <b>${fmtInt(dup)}</b> mögliche Duplikate` +
      (res.pairsTruncated ? ` <span class="muted">(gespeichert sind nur die ${fmtInt(p.s.length)} ähnlichsten)</span>` : '');
    this.list.scrollTop = 0;
    this.render();
  }

  render() {
    if (!this.filtered || this.el.hidden) return;
    const { res, ds, short } = this.ctx;
    const p = res.pairs;
    const rh = matchMedia('(max-width: 600px)').matches ? ROW_H_MOBILE : ROW_H;
    const total = this.filtered.length;
    this.body.style.height = total * rh + 'px';
    const top = Math.max(0, this.list.scrollTop - 34);
    const h = this.list.clientHeight;
    const from = Math.max(0, Math.floor(top / rh) - 5);
    const to = Math.min(total, Math.ceil((top + h) / rh) + 5);
    let html = '';
    const t = (i) => (ds.titles && ds.titles[i] ? `<span class="ut">${esc(ds.titles[i])}</span>` : '');
    for (let r = from; r < to; r++) {
      const k = this.filtered[r];
      const a = p.a[k], b = p.b[k], s = p.s[k];
      const w = Math.max(3, ((s - this.lo) / Math.max(1e-6, 1 - this.lo)) * 100);
      const hint = s >= 0.97 ? '<span class="badge dup">Duplikat?</span>' : s >= 0.93 ? '<span class="badge near">sehr nah</span>' : '';
      html += `<div class="vrow" style="top:${r * rh}px" data-a="${a}">
        <div class="pa"><span class="u" title="${esc(ds.urls[a])}">${esc(short(ds.urls[a]))}</span>${t(a)}</div>
        <div class="pb"><span class="u" title="${esc(ds.urls[b])}">${esc(short(ds.urls[b]))}</span>${t(b)}</div>
        <div class="ps simcell"><span class="num">${fmtSim(s)}</span><span class="simbar"><i style="width:${w}%"></i></span></div>
        <div class="ph">${hint}</div></div>`;
    }
    if (!total) html = '<p class="muted" style="padding:16px">Keine Paare für diese Filter.</p>';
    this.body.innerHTML = html;
  }
}
