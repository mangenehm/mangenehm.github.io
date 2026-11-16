import { esc, fmtSim, fmtInt } from '../util.js';

/* Ansicht „Seite": URL suchen, ähnlichste Seiten anzeigen. */
export class SearchView {
  constructor(el, ctx) {
    this.el = el;
    this.ctx = ctx;
    this.cur = -1;
    this.history = [];
    const { ds } = ctx;
    this.hay = ds.urls.map((u, i) => (u + ' ' + (ds.titles ? ds.titles[i] : '')).toLowerCase());
    el.innerHTML = `
      <div class="card">
        <div class="search">
          <input type="search" id="sv-q" placeholder="URL oder Titel suchen …" autocomplete="off" aria-label="Seite suchen" role="combobox" aria-expanded="false" aria-controls="sv-sug">
          <ul class="suggest" id="sv-sug" role="listbox" hidden></ul>
        </div>
        <div id="sv-detail"></div>
      </div>`;
    this.q = el.querySelector('#sv-q');
    this.sug = el.querySelector('#sv-sug');
    this.detail = el.querySelector('#sv-detail');
    this.active = -1;
    this.q.addEventListener('input', () => this.suggest());
    this.q.addEventListener('focus', () => this.suggest());
    this.q.addEventListener('keydown', (e) => this.keys(e));
    document.addEventListener('click', (e) => { if (!el.contains(e.target) || !e.target.closest('.search')) this.closeSug(); });
    this.detail.addEventListener('click', (e) => this.onClick(e));
    this.renderEmpty();
  }

  show(params) {
    if (params && params.page != null) this.open(params.page);
  }

  suggest() {
    const v = this.q.value.trim().toLowerCase();
    if (!v) { this.closeSug(); return; }
    const parts = v.split(/\s+/);
    const hits = [];
    for (let i = 0; i < this.hay.length && hits.length < 30; i++) {
      const h = this.hay[i];
      if (parts.every((p) => h.includes(p))) hits.push(i);
    }
    const { ds, short } = this.ctx;
    this.hits = hits;
    this.active = hits.length ? 0 : -1;
    this.sug.innerHTML = hits.length
      ? hits.map((i, k) => `<li role="option" data-i="${i}" class="${k === 0 ? 'active' : ''}">${esc(short(ds.urls[i]))}${ds.titles && ds.titles[i] ? `<small>${esc(ds.titles[i])}</small>` : ''}</li>`).join('')
      : '<li class="muted">Keine Treffer</li>';
    this.sug.hidden = false;
    this.q.setAttribute('aria-expanded', 'true');
    this.sug.onclick = (e) => { const li = e.target.closest('li[data-i]'); if (li) { this.open(+li.dataset.i); this.closeSug(); } };
  }
  closeSug() { this.sug.hidden = true; this.q.setAttribute('aria-expanded', 'false'); }
  keys(e) {
    if (this.sug.hidden || !this.hits || !this.hits.length) return;
    const lis = this.sug.querySelectorAll('li[data-i]');
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      this.active = (this.active + (e.key === 'ArrowDown' ? 1 : -1) + lis.length) % lis.length;
      lis.forEach((li, k) => li.classList.toggle('active', k === this.active));
      lis[this.active].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (this.active >= 0) { this.open(this.hits[this.active]); this.closeSug(); }
    } else if (e.key === 'Escape') this.closeSug();
  }

  renderEmpty() {
    const { ds, res, short } = this.ctx;
    // Vorschläge: Seiten mit den engsten Nachbarn
    const K = res.K;
    const best = [];
    for (let i = 0; i < ds.n; i++) best.push([i, res.top.sc[i * res.top.K]]);
    best.sort((a, b) => b[1] - a[1]);
    const picks = best.slice(0, 6);
    this.detail.innerHTML = `
      <p class="muted" style="margin:16px 0 8px">Wähle eine Seite, um ihre ${K} ähnlichsten Seiten zu sehen. Zum Beispiel eine mit sehr engem Nachbarn:</p>
      <div class="row">${picks.map(([i]) => `<button class="chip" data-open="${i}"><span class="dot"></span>${esc(short(ds.urls[i]))}</button>`).join('')}
      <button class="btn ghost" data-random="1">Zufällige Seite</button></div>`;
  }

  open(i, push = true) {
    if (push && this.cur >= 0 && this.cur !== i) this.history.push(this.cur);
    this.cur = i;
    const { ds, res, cl, short } = this.ctx;
    const K = res.top.K;
    const c = cl.pageCluster(i);
    const rows = [];
    for (let q = 0; q < K; q++) {
      const j = res.top.idx[i * K + q];
      if (j < 0) break;
      rows.push([j, res.top.sc[i * K + q]]);
    }
    const max = rows.length ? rows[0][1] : 1;
    const min = rows.length ? Math.min(...rows.map((r) => r[1])) : 0;
    const lo = Math.min(min, max - 0.05);
    const title = ds.titles && ds.titles[i] ? `<div class="muted">${esc(ds.titles[i])}</div>` : '';
    this.detail.innerHTML = `
      <div class="page-head">
        <div class="t">
          <h2>${esc(short(ds.urls[i]))} <a href="${esc(ds.urls[i])}" target="_blank" rel="noopener" title="Seite öffnen" aria-label="Seite öffnen">↗</a></h2>
          ${title}
          <div class="row" style="margin-top:6px">
            <button class="chip" data-cluster="${c.id}" title="Cluster auf der Karte zeigen"><span class="dot"></span>${esc(c.name)} · ${esc(c.label)}</button>
            <span class="muted small">Nähe zum Clusterzentrum ${fmtSim(res.centerSim[i])}</span>
          </div>
        </div>
        <div class="row">
          ${this.history.length ? '<button class="btn" data-back="1">← Zurück</button>' : ''}
          <button class="btn" data-map="1">Auf Karte zeigen</button>
          <button class="btn" data-hm="1">Heatmap der Nachbarschaft</button>
        </div>
      </div>
      <table class="list">
        <colgroup><col style="width:40px"><col><col style="width:170px"><col class="col-cl" style="width:110px"></colgroup>
        <thead><tr><th>#</th><th>Ähnliche Seite</th><th>Ähnlichkeit</th><th class="col-cl">Cluster</th></tr></thead>
        <tbody>
        ${rows.map(([j, s], r) => {
          const cj = cl.pageCluster(j);
          const w = Math.max(3, ((s - lo) / Math.max(1e-6, max - lo)) * 100);
          const badge = s >= 0.97 ? ' <span class="badge dup">Duplikat?</span>' : '';
          return `<tr class="click" data-open="${j}">
            <td class="muted num">${r + 1}</td>
            <td><span class="u">${esc(short(ds.urls[j]))}</span>${ds.titles && ds.titles[j] ? `<span class="ut">${esc(ds.titles[j])}</span>` : ''}</td>
            <td><div class="simcell"><span class="num">${fmtSim(s)}</span><span class="simbar"><i style="width:${w}%"></i></span></div>${badge}</td>
            <td class="col-cl small ${cj.id === c.id ? '' : 'muted'}">${esc(cj.name)}</td></tr>`;
        }).join('')}
        </tbody>
      </table>
      <p class="muted small">Balken relativ zwischen ${fmtSim(lo)} und ${fmtSim(max)}. ${fmtInt(rows.filter(([j]) => cl.pageCluster(j).id === c.id).length)} von ${rows.length} Nachbarn liegen im selben Cluster.</p>`;
  }

  onClick(e) {
    const t = e.target.closest('[data-open],[data-random],[data-back],[data-cluster],[data-map],[data-hm]');
    if (!t) return;
    if (t.dataset.open != null) { this.open(+t.dataset.open); window.scrollTo({ top: this.el.offsetTop - 10, behavior: 'smooth' }); }
    else if (t.dataset.random) this.open((Math.random() * this.ctx.ds.n) | 0);
    else if (t.dataset.back) this.open(this.history.pop(), false);
    else if (t.dataset.cluster != null) this.ctx.go('map', { cluster: +t.dataset.cluster, page: this.cur });
    else if (t.dataset.map) this.ctx.go('map', { page: this.cur });
    else if (t.dataset.hm) this.ctx.go('heatmap', { mode: 'page', page: this.cur });
  }
}
