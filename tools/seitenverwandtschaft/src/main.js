import { analyze } from './analysis.js';
import { buildClusters } from './clusters.js';
import { makeSample, sampleCsv } from './sample.js';
import { fmtInt, fmtSec, fmtSim, makeShortener, download, esc } from './util.js';
import { SearchView } from './views/search.js';
import { PairsView } from './views/pairs.js';
import { MapView } from './views/map.js';
import { HeatmapView } from './views/heatmap.js';
import { ExportView } from './views/export.js';

const $ = (id) => document.getElementById(id);
let currentFile = null;
let currentDs = null;
let abort = null;
let parser = null;
let views = null;
let activeView = 'search';
let lastResult = null;

/* ---------- Datei laden ---------- */
const drop = $('drop');
$('file').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) loadFile(f, null); });
['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) loadFile(f, null); });

$('sample').addEventListener('click', () => {
  currentFile = null;
  $('mapping').hidden = true;
  const ds = makeSample();
  run(ds);
});
$('sampleCsv').addEventListener('click', (e) => {
  e.preventDefault();
  download('beispiel-embeddings.csv', sampleCsv(makeSample(), 300));
});
$('reparse').addEventListener('click', () => {
  if (!currentFile) return;
  const v = $('mapVec').value;
  const mapping = {
    url: +$('mapUrl').value,
    title: +$('mapTitle').value,
    vec: v.startsWith('cols') ? -1 : +v,
    vecCols: v.startsWith('cols') ? JSON.parse(v.slice(4)) : null,
  };
  loadFile(currentFile, mapping);
});
$('cancel').addEventListener('click', () => {
  if (parser) { parser.terminate(); parser = null; }
  if (abort) abort.abort();
  setProgress(null);
  showError('Abgebrochen.');
});

function options() {
  const num = (id, def, lo, hi) => { const v = parseFloat($(id).value); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def; };
  return {
    K: Math.round(num('optK', 20, 5, 50)),
    thr: num('optThr', 0.9, 0.3, 0.999),
    maxPairs: Math.round(num('optMax', 200000, 1000, 2000000)),
    k: $('optClusters').value ? Math.round(num('optClusters', 0, 2, 200)) : 0,
    reduceTo: $('optReduce').checked ? 256 : 0,
  };
}

function loadFile(file, mapping) {
  currentFile = file;
  showError(null);
  $('results').hidden = true;
  if (parser) parser.terminate();
  parser = new Worker(new URL('./parse-worker.js', import.meta.url));
  setProgress('Lese Datei …', 0, `${file.name} · ${fmtInt(Math.round(file.size / 1024 / 1024 * 10) / 10)} MB`);
  parser.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'progress') {
      setProgress(m.phase === 'reduce' ? 'Verkleinere Vektoren …' : 'Lese Datei …', m.value, `${fmtInt(m.rows)} Zeilen eingelesen`);
    } else if (m.type === 'header') {
      fillMapping(m.header, m.mapping);
    } else if (m.type === 'done') {
      parser.terminate(); parser = null;
      const info = [];
      if (m.skipped.noVector) info.push(`${fmtInt(m.skipped.noVector)} ohne Vektor`);
      if (m.skipped.wrongDim) info.push(`${fmtInt(m.skipped.wrongDim)} mit abweichender Dimension`);
      if (m.skipped.noUrl) info.push(`${fmtInt(m.skipped.noUrl)} ohne URL`);
      if (m.skipped.zero) info.push(`${fmtInt(m.skipped.zero)} mit Nullvektor`);
      $('parseInfo').textContent = `${fmtInt(m.n)} Seiten · ${m.origDim} Dimensionen` + (info.length ? ` · übersprungen: ${info.join(', ')}` : '');
      run({ n: m.n, d: m.dim, origDim: m.origDim, X: m.X, urls: m.urls, titles: m.titles, skipped: m.skipped, name: file.name });
    } else if (m.type === 'error') {
      parser.terminate(); parser = null;
      setProgress(null);
      showError(m.message);
    }
  };
  parser.onerror = (e) => { setProgress(null); showError(e.message || 'Fehler beim Lesen der Datei.'); };
  parser.postMessage({ type: 'parse', file, mapping, reduceTo: options().reduceTo });
}

function fillMapping(header, mapping) {
  $('mapping').hidden = false;
  const opt = (v, label, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(label)}</option>`;
  const cols = header.map((h, i) => [i, h || `Spalte ${i + 1}`]);
  $('mapUrl').innerHTML = cols.map(([i, h]) => opt(i, h, i === mapping.url)).join('');
  $('mapTitle').innerHTML = opt(-1, '– keine –', mapping.title < 0) + cols.map(([i, h]) => opt(i, h, i === mapping.title)).join('');
  let vec = cols.map(([i, h]) => opt(i, h, i === mapping.vec)).join('');
  if (mapping.vecCols) vec = opt('cols' + JSON.stringify(mapping.vecCols), `${mapping.vecCols.length} Zahlenspalten`, true) + vec;
  $('mapVec').innerHTML = vec;
}

/* ---------- Berechnung ---------- */
async function run(ds) {
  currentDs = ds;
  showError(null);
  const o = options();
  abort = new AbortController();
  $('results').hidden = true;
  setProgress('Ähnlichkeiten berechnen', 0, `${fmtInt(ds.n)} Seiten · ${ds.d} Dimensionen`);
  const t0 = performance.now();
  try {
    const res = await analyze(ds, { ...o, signal: abort.signal }, (label, f) => {
      const el = (performance.now() - t0) / 1000;
      const eta = f > 0.03 ? ` · noch ca. ${fmtSec(Math.max(0, el / f - el))}` : '';
      setProgress(label, f, `${fmtInt(ds.n)} Seiten · ${ds.d} Dimensionen · ${fmtSec(el)}${eta}`);
    });
    res.K = Math.min(o.K, ds.n - 1);
    const cl = buildClusters(ds, res);
    setProgress(null);
    showResults(ds, res, cl, o);
  } catch (err) {
    setProgress(null);
    if (String(err.message) !== 'abgebrochen') { console.error(err); showError(err.message || String(err)); }
  } finally {
    abort = null;
  }
}

function showResults(ds, res, cl, o) {
  const short = makeShortener(ds.urls);
  let dup = 0, near = 0;
  for (let i = 0; i < res.pairs.s.length; i++) { const s = res.pairs.s[i]; if (s >= 0.97) dup++; else if (s >= 0.93) near++; }
  const tiles = [
    [fmtInt(ds.n), 'Seiten'],
    [ds.origDim !== ds.d ? `${ds.origDim}→${ds.d}` : String(ds.d), 'Dimensionen'],
    [fmtInt(res.pairs.s.length), `Paare ≥ ${fmtSim(res.pairThr)}`],
    [fmtInt(dup), 'Beinahe-Duplikate ≥ 0,970'],
    [fmtInt(cl.list.length), 'Themencluster'],
    [fmtSec(res.seconds), `Rechenzeit (${res.workers} Threads)`],
  ];
  $('stats').innerHTML = tiles.map(([v, l]) => `<div class="stat"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('');
  const notes = [];
  if (res.pairsTruncated) notes.push(`Es gibt mehr Paare über der Schwelle als gespeichert werden. Gezeigt werden die ${fmtInt(res.pairs.s.length)} ähnlichsten (ab ${fmtSim(res.pairThr)}). Schwelle oder Maximum in den Einstellungen anpassen.`);
  if (o.reduceTo && ds.origDim > ds.d) notes.push('Schnellmodus aktiv: Ähnlichkeiten wurden auf verkleinerten Vektoren berechnet und sind Näherungswerte.');
  $('notices').innerHTML = notes.map((t) => `<p class="notice">${esc(t)}</p>`).join('');

  const ctx = { ds, res, cl, short, opts: o, go };
  lastResult = ctx;
  views = {
    search: new SearchView($('view-search'), ctx),
    pairs: new PairsView($('view-pairs'), ctx),
    map: new MapView($('view-map'), ctx),
    heatmap: new HeatmapView($('view-heatmap'), ctx),
    export: new ExportView($('view-export'), ctx),
  };
  $('results').hidden = false;
  go(activeView);
}

function go(name, params) {
  activeView = name;
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === name)));
  for (const k of Object.keys(views)) $('view-' + k).hidden = k !== name;
  views[name].show(params);
}
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => go(b.dataset.view)));

/* ---------- Anzeige ---------- */
function setProgress(label, f, sub) {
  const p = $('progress');
  if (label === null) { p.hidden = true; return; }
  p.hidden = false;
  $('progLabel').textContent = label;
  const pct = Math.round(Math.max(0, Math.min(1, f)) * 100);
  $('progPct').textContent = pct + ' %';
  $('progBar').style.width = pct + '%';
  if (sub != null) $('progSub').textContent = sub;
}
function showError(msg) {
  const e = $('error');
  e.hidden = !msg;
  e.textContent = msg || '';
}

$('optClusters').placeholder = 'automatisch';
// Für Tests/Debugging in der Konsole
window.__seitenverwandtschaft = { get result() { return lastResult; } };
