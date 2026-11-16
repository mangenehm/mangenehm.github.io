import { download, csvCell, fmtInt } from '../util.js';

/* Ansicht „Export": Ergebnisse als CSV. */
export class ExportView {
  constructor(el, ctx) {
    this.ctx = ctx;
    const { ds, res, cl } = ctx;
    el.innerHTML = `
      <div class="export-grid">
        <div class="card"><h2>Ähnlichste Seiten</h2><p>Für jede Seite die ${res.top.K} ähnlichsten Seiten mit Rang und Ähnlichkeit (${fmtInt(ds.n * res.top.K)} Zeilen). Ideal als Grundlage für interne Verlinkung.</p><button class="btn primary" data-x="nb">nachbarn.csv</button></div>
        <div class="card"><h2>Seitenpaare</h2><p>Alle ${fmtInt(res.pairs.s.length)} gespeicherten Paare mit Ähnlichkeit und Cluster – für Duplikat- und Kannibalisierungs-Checks.</p><button class="btn primary" data-x="pairs">paare.csv</button></div>
        <div class="card"><h2>Cluster</h2><p>Cluster-Zuordnung jeder Seite mit Label, Nähe zum Zentrum und Kartenkoordinaten (${fmtInt(cl.list.length)} Cluster).</p><button class="btn primary" data-x="cl">cluster.csv</button></div>
      </div>
      <p class="muted small">Trennzeichen Semikolon, Dezimalpunkt, UTF-8 – öffnet sich direkt in Excel.</p>`;
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-x]');
      if (b) this.export(b.dataset.x);
    });
  }
  show() {}

  export(kind) {
    const { ds, res, cl } = this.ctx;
    const L = [];
    const row = (...v) => L.push(v.map(csvCell).join(';'));
    const sim = (s) => s.toFixed(4);
    if (kind === 'nb') {
      row('url', 'rang', 'aehnliche_url', 'aehnlichkeit', 'gleicher_cluster');
      const K = res.top.K;
      for (let i = 0; i < ds.n; i++) for (let q = 0; q < K; q++) {
        const j = res.top.idx[i * K + q];
        if (j < 0) break;
        row(ds.urls[i], q + 1, ds.urls[j], sim(res.top.sc[i * K + q]), res.asg[i] === res.asg[j] ? 'ja' : 'nein');
      }
      download('nachbarn.csv', L.join('\n'));
    } else if (kind === 'pairs') {
      row('url_a', 'url_b', 'aehnlichkeit', 'cluster_a', 'cluster_b', 'hinweis');
      const p = res.pairs;
      for (let k = 0; k < p.s.length; k++) {
        const a = p.a[k], b = p.b[k], s = p.s[k];
        row(ds.urls[a], ds.urls[b], sim(s), cl.pageCluster(a).name, cl.pageCluster(b).name, s >= 0.97 ? 'moegliches Duplikat' : s >= 0.93 ? 'sehr nah' : '');
      }
      download('paare.csv', L.join('\n'));
    } else {
      row('url', 'titel', 'cluster', 'cluster_label', 'cluster_groesse', 'naehe_zum_zentrum', 'karte_x', 'karte_y');
      for (let i = 0; i < ds.n; i++) {
        const c = cl.pageCluster(i);
        row(ds.urls[i], ds.titles ? ds.titles[i] : '', c.name, c.label, c.size, sim(res.centerSim[i]), res.nbXY[2 * i].toFixed(3), res.nbXY[2 * i + 1].toFixed(3));
      }
      download('cluster.csv', L.join('\n'));
    }
  }
}
