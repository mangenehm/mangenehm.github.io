import { makeSample, sampleCsv } from './sample.js';
import { embedText } from './embed.js';
import { fmtInt, fmtSim, makeShortener, download, csvCell, esc } from './util.js';

const $ = (id) => document.getElementById(id);
const PAGE = 50;
const LEVELS = [[0.9, 'sehr eng', 'l3'], [0.8, 'eng', 'l2'], [0.7, 'verwandt', 'l1']];

let ds = null;          // { n, d, X, urls, titles, sample? }
let short = (u) => u;
let hay = [];
let currentFile = null;
let parser = null;
let ref = null;         // { type: 'page', i } | { type: 'text', text }
let scores = null, order = null, view = null, shown = PAGE;
const history = [];

/* ---------- Laden ---------- */
const drop = $('drop');
$('file').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) loadFile(f, null); });
['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) loadFile(f, null); });
$('sample').addEventListener('click', () => { currentFile = null; $('mapping').hidden = true; setData(makeSample()); });
$('sampleCsv').addEventListener('click', (e) => { e.preventDefault(); download('beispiel-embeddings.csv', sampleCsv(makeSample(), 300)); });
$('reparse').addEventListener('click', () => {
  if (!currentFile) return;
  const v = $('mapVec').value;
  loadFile(currentFile, {
    url: +$('mapUrl').value,
    title: +$('mapTitle').value,
    vec: v.startsWith('cols') ? -1 : +v,
    vecCols: v.startsWith('cols') ? JSON.parse(v.slice(4)) : null,
  });
});

function loadFile(file, mapping) {
  currentFile = file;
  showErr('loadError', null);
  $('compare').hidden = true; $('result').hidden = true;
  if (parser) parser.terminate();
  parser = new Worker(new URL('./parse-worker.js', import.meta.url));
  progress(0, `Lese ${file.name} …`);
  parser.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'progress') progress(m.value, `${fmtInt(m.rows)} Zeilen eingelesen …`);
    else if (m.type === 'header') fillMapping(m.header, m.mapping);
    else if (m.type === 'done') {
      parser.terminate(); parser = null; progress(null);
      const sk = m.skipped, skipped = sk.noVector + sk.wrongDim + sk.noUrl + sk.zero;
      $('parseInfo').textContent = `${fmtInt(m.n)} Seiten · ${m.dim} Dimensionen` + (skipped ? ` · ${fmtInt(skipped)} Zeilen ohne gültigen Vektor übersprungen` : '');
      setData({ n: m.n, d: m.dim, X: m.X, urls: m.urls, titles: m.titles });
    } else if (m.type === 'error') {
      parser.terminate(); parser = null; progress(null); showErr('loadError', m.message);
    }
  };
  parser.onerror = (e) => { progress(null); showErr('loadError', e.message || 'Fehler beim Lesen der Datei.'); };
  parser.postMessage({ type: 'parse', file, mapping });
}

function fillMapping(header, mapping) {
  $('mapping').hidden = false;
  const opt = (v, label, sel) => `<option value="${esc(v)}"${sel ? ' selected' : ''}>${esc(label)}</option>`;
  const cols = header.map((h, i) => [i, h || `Spalte ${i + 1}`]);
  $('mapUrl').innerHTML = cols.map(([i, h]) => opt(i, h, i === mapping.url)).join('');
  $('mapTitle').innerHTML = opt(-1, '– keiner –', mapping.title < 0) + cols.map(([i, h]) => opt(i, h, i === mapping.title)).join('');
  let vec = cols.map(([i, h]) => opt(i, h, i === mapping.vec)).join('');
  if (mapping.vecCols) vec = opt('cols' + JSON.stringify(mapping.vecCols), `${mapping.vecCols.length} Zahlenspalten`, true) + vec;
  $('mapVec').innerHTML = vec;
}

function setData(data) {
  ds = data;
  short = makeShortener(ds.urls);
  hay = ds.urls.map((u, i) => (u + ' ' + (ds.titles ? ds.titles[i] : '')).toLowerCase());
  ref = null; history.length = 0;
  $('compare').hidden = false;
  $('result').hidden = true;
  $('q').value = '';
  $('embedInfo').textContent = ds.sample ? 'Bei den Beispieldaten nicht möglich – sie bestehen aus Zufallsvektoren.' : '';
  $('embedBtn').disabled = !!ds.sample;
  $('compare').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------- Modus ---------- */
document.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
function setMode(mode) {
  document.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
  $('mode-page').hidden = mode !== 'page';
  $('mode-text').hidden = mode !== 'text';
  showErr('cmpError', null);
}

/* ---------- Seitensuche ---------- */
const q = $('q'), sug = $('sug');
let hits = [], active = -1;
q.addEventListener('input', suggest);
q.addEventListener('focus', suggest);
q.addEventListener('keydown', (e) => {
  if (sug.hidden || !hits.length) return;
  const lis = sug.querySelectorAll('li[data-i]');
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    active = (active + (e.key === 'ArrowDown' ? 1 : -1) + lis.length) % lis.length;
    lis.forEach((li, k) => li.classList.toggle('active', k === active));
    lis[active].scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter') { e.preventDefault(); if (active >= 0) pickPage(hits[active]); }
  else if (e.key === 'Escape') closeSug();
});
sug.addEventListener('mousedown', (e) => { const li = e.target.closest('li[data-i]'); if (li) { e.preventDefault(); pickPage(+li.dataset.i); } });
q.addEventListener('blur', () => setTimeout(closeSug, 100));

function suggest() {
  if (!ds) return;
  const parts = q.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!parts.length) { closeSug(); return; }
  hits = [];
  for (let i = 0; i < hay.length && hits.length < 30; i++) if (parts.every((p) => hay[i].includes(p))) hits.push(i);
  active = hits.length ? 0 : -1;
  sug.innerHTML = hits.length
    ? hits.map((i, k) => `<li role="option" data-i="${i}" class="${k === 0 ? 'active' : ''}">${esc(short(ds.urls[i]))}${ds.titles && ds.titles[i] ? `<small>${esc(ds.titles[i])}</small>` : ''}</li>`).join('')
    : '<li class="muted">Keine Treffer</li>';
  sug.hidden = false;
  q.setAttribute('aria-expanded', 'true');
}
function closeSug() { sug.hidden = true; q.setAttribute('aria-expanded', 'false'); }
function pickPage(i) { closeSug(); q.value = short(ds.urls[i]); history.length = 0; showPage(i); }

/* ---------- Neuer Text ---------- */
try {
  const saved = localStorage.getItem('sv-openrouter-key');
  if (saved) { $('apiKey').value = saved; $('remember').checked = true; }
  const model = localStorage.getItem('sv-openrouter-model');
  if (model) $('model').value = model;
} catch { /* Speicher nicht verfügbar */ }

$('embedBtn').addEventListener('click', async () => {
  const text = $('text').value.trim(), key = $('apiKey').value.trim(), model = $('model').value.trim();
  showErr('cmpError', null);
  if (!text) return showErr('cmpError', 'Bitte einen Text eingeben.');
  if (!key) return showErr('cmpError', 'Bitte einen OpenRouter-API-Key eingeben.');
  if (!model) return showErr('cmpError', 'Bitte ein Embedding-Modell angeben.');
  try {
    if ($('remember').checked) { localStorage.setItem('sv-openrouter-key', key); localStorage.setItem('sv-openrouter-model', model); }
    else localStorage.removeItem('sv-openrouter-key');
  } catch { /* Speicher nicht verfügbar */ }
  const btn = $('embedBtn');
  btn.disabled = true; $('embedInfo').textContent = 'Erzeuge Embedding …';
  try {
    const v = await embedText(key, model, text, ds.d);
    $('embedInfo').textContent = '';
    history.length = 0;
    ref = { type: 'text', text };
    rank(v, -1);
  } catch (err) {
    $('embedInfo').textContent = '';
    showErr('cmpError', err.message);
  } finally {
    btn.disabled = false;
  }
});

/* ---------- Rangliste ---------- */
function showPage(i, push = false) {
  if (push && ref) history.push({ ref, scores, order });
  ref = { type: 'page', i };
  rank(ds.X.subarray(i * ds.d, (i + 1) * ds.d), i);
}

function rank(v, self) {
  const { n, d, X } = ds;
  scores = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * d;
    let s = 0;
    for (let k = 0; k < d; k++) s += X[o + k] * v[k];
    scores[i] = s;
  }
  const all = new Uint32Array(self >= 0 ? n - 1 : n);
  for (let i = 0, j = 0; i < n; i++) if (i !== self) all[j++] = i;
  order = all.sort((a, b) => scores[b] - scores[a]);
  $('filter').value = '';
  renderHead();
  applyFilter();
  $('result').hidden = false;
}

function renderHead() {
  let html;
  if (ref.type === 'page') {
    const i = ref.i;
    html = `<div class="muted small">Verwandtschaft zu</div><h2>${esc(short(ds.urls[i]))} <a href="${esc(ds.urls[i])}" target="_blank" rel="noopener" aria-label="Seite öffnen" title="Seite öffnen">↗</a></h2>` +
      (ds.titles && ds.titles[i] ? `<div class="muted">${esc(ds.titles[i])}</div>` : '');
  } else {
    const t = ref.text.length > 160 ? ref.text.slice(0, 160) + ' …' : ref.text;
    html = `<div class="muted small">Passende Seiten für den Text</div><h2 style="font-weight:600;font-size:1rem;word-break:normal">„${esc(t)}"</h2>`;
  }
  $('refBox').innerHTML = html;
  $('back').hidden = !history.length;
  const counts = LEVELS.map(([thr]) => { let c = 0; for (const i of order) { if (scores[i] >= thr) c++; else break; } return c; });
  $('dist').innerHTML = LEVELS.map(([thr, label], k) => `<span><b>${fmtInt(counts[k])}</b> ${label} (≥ ${fmtSim(thr).slice(0, 4)})</span>`).join('') +
    `<span><b>${fmtInt(order.length)}</b> Seiten insgesamt</span>`;
}

$('filter').addEventListener('input', () => { clearTimeout(applyFilter.t); applyFilter.t = setTimeout(applyFilter, 120); });
function applyFilter() {
  const parts = $('filter').value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  view = [];
  for (let r = 0; r < order.length; r++) {
    const i = order[r];
    if (!parts.length || parts.every((p) => hay[i].includes(p))) view.push(r);
  }
  shown = PAGE;
  renderRows();
}

function renderRows() {
  const top = scores[order[0]], bottom = Math.min(scores[order[Math.min(order.length - 1, 199)]], top - 0.05);
  const rows = view.slice(0, shown).map((r) => {
    const i = order[r], s = scores[i];
    const w = Math.max(2, Math.min(100, ((s - bottom) / Math.max(1e-6, top - bottom)) * 100));
    const lv = LEVELS.find(([thr]) => s >= thr);
    return `<tr data-i="${i}"><td class="num muted">${r + 1}</td>
      <td><span class="u" title="${esc(ds.urls[i])}">${esc(short(ds.urls[i]))}</span>${ds.titles && ds.titles[i] ? `<span class="ut">${esc(ds.titles[i])}</span>` : ''}</td>
      <td><div class="simcell"><span class="num">${fmtSim(s)}</span><span class="simbar"><i style="width:${w}%"></i></span></div></td>
      <td class="c-lvl"><span class="lvl ${lv ? lv[2] : 'l0'}">${lv ? lv[1] : '–'}</span></td></tr>`;
  });
  $('rows').innerHTML = rows.join('') || '<tr><td colspan="4" class="muted">Keine Seite passt zum Filter.</td></tr>';
  $('shown').textContent = `${fmtInt(Math.min(shown, view.length))} von ${fmtInt(view.length)} Seiten angezeigt`;
  $('more').hidden = shown >= view.length;
}

$('more').addEventListener('click', () => { shown += PAGE; renderRows(); });
$('rows').addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-i]');
  if (!tr || e.target.closest('a')) return;
  showPage(+tr.dataset.i, true);
  $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
$('back').addEventListener('click', () => {
  const prev = history.pop();
  if (!prev) return;
  ({ ref, scores, order } = prev);
  $('filter').value = '';
  renderHead();
  applyFilter();
});

$('csv').addEventListener('click', () => {
  const lines = ['rang;url;titel;aehnlichkeit;einstufung'];
  order.forEach((i, r) => {
    const s = scores[i], lv = LEVELS.find(([thr]) => s >= thr);
    lines.push([r + 1, ds.urls[i], ds.titles ? ds.titles[i] : '', s.toFixed(4), lv ? lv[1] : ''].map(csvCell).join(';'));
  });
  const base = ref.type === 'page' ? short(ds.urls[ref.i]).replace(/[^a-z0-9äöüß]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'seite' : 'text';
  download(`verwandtschaft-${base}.csv`, lines.join('\n'));
});

/* ---------- Hilfen ---------- */
function progress(f, text) {
  if (f === null) { $('progress').hidden = true; return; }
  $('progress').hidden = false;
  $('progBar').style.width = Math.round(f * 100) + '%';
  $('progText').textContent = text;
}
function showErr(id, msg) { const e = $(id); e.hidden = !msg; e.textContent = msg || ''; }

// Für Tests in der Konsole
window.__seitenverwandtschaft = { get state() { return { ds, scores, order, ref }; } };
