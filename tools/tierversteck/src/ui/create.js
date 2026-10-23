/* Spiel erstellen: Namen, Adresse suchen, Ausschnitt festlegen, Brett-Vorschau. */

import { geocode } from '../map/geocode.js';
import { loadArea, covers, boardFromOsm, shiftCenter } from '../map/build.js';
import { OVERLAY } from '../map/render.js';
import { randomBoard, makeRng, terrainShares, dominantTerrain, MIN_SIZE, MAX_SIZE } from '../engine/board.js';
import { TERRAINS, TERRAIN_INFO } from '../engine/shapes.js';
import { BoardView } from './boardview.js';
import { el, $, $$, esc, store } from './dom.js';

const CELL_SIZES = [20, 35, 50];

export function createScreen(root, { mode, onDone, onBack }) {
  const saved = store('create') || {};
  const st = {
    names: mode === 'hotseat' ? [saved.name1 || '', saved.name2 || ''] : [saved.name1 || ''],
    source: saved.source || 'map',
    size: saved.size || 10,
    cellMeters: saved.cellMeters || 35,
    place: saved.place || null,          // { lat, lon, label }
    center: saved.place ? { lat: saved.place.lat, lon: saved.place.lon } : null,
    seed: Math.floor(Math.random() * 1e9),
    results: [],
    area: null,
    board: null,
    loading: false,
    error: '',
    showTerrain: false,
  };
  let view = null, abort = null, timer = null;

  const sizeOpts = Array.from({ length: MAX_SIZE - MIN_SIZE + 1 }, (_, i) => MIN_SIZE + i)
    .map(n => `<option value="${n}">${n} × ${n}</option>`).join('');
  const cellOpts = CELL_SIZES.map(m => `<option value="${m}">${m} m</option>`).join('');

  const node = el(`
    <section class="screen create">
      <div class="card">
        <h2>${mode === 'hotseat' ? 'Wer spielt?' : 'Dein Name'}</h2>
        <div class="names">
          ${st.names.map((n, i) => `<label class="field"><span>${mode === 'hotseat' ? `Spieler ${i + 1}` : 'Name'}</span>
            <input type="text" maxlength="20" data-name="${i}" value="${esc(n)}" placeholder="${i ? 'Bo' : 'Ada'}"></label>`).join('')}
        </div>
      </div>

      <div class="card">
        <h2>Spielfeld</h2>
        <div class="seg" role="tablist">
          <button type="button" data-src="map" role="tab">🗺️ Echte Karte</button>
          <button type="button" data-src="random" role="tab">🎲 Zufallsgelände</button>
        </div>

        <div class="map-only">
          <form class="search-row" autocomplete="off">
            <input type="text" name="q" placeholder="Adresse, Platz oder Ort" aria-label="Adresse suchen" value="${esc(saved.query || '')}">
            <button class="btn secondary" type="submit">Suchen</button>
          </form>
          <div class="results"></div>
        </div>

        <div class="settings">
          <label class="field"><span>Brettgröße</span><select data-set="size">${sizeOpts}</select></label>
          <label class="field map-only"><span>Zellgröße</span><select data-set="cellMeters">${cellOpts}</select></label>
          <button type="button" class="btn secondary random-only" data-act="reroll">Neu würfeln</button>
        </div>

        <div class="preview">
          <div class="preview-board"></div>
          <div class="pan map-only" aria-label="Ausschnitt verschieben">
            <button type="button" data-pan="0,-1" aria-label="nach Norden">↑</button>
            <button type="button" data-pan="-1,0" aria-label="nach Westen">←</button>
            <button type="button" data-pan="1,0" aria-label="nach Osten">→</button>
            <button type="button" data-pan="0,1" aria-label="nach Süden">↓</button>
          </div>
          <p class="status small muted"></p>
          <div class="shares"></div>
          <label class="toggle"><input type="checkbox" data-act="terrain"> Geländeklassen zeigen</label>
          <p class="attribution map-only">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>-Mitwirkende (ODbL)</p>
        </div>
      </div>

      <div class="row-btns">
        <button class="btn secondary" data-act="back">Zurück</button>
        <button class="btn" data-act="next" disabled>${mode === 'hotseat' ? 'Tiere verstecken' : 'Raum erstellen'}</button>
      </div>
    </section>`);
  root.appendChild(node);

  $(node, '[data-set=size]').value = String(st.size);
  $(node, '[data-set=cellMeters]').value = String(st.cellMeters);

  view = new BoardView($(node, '.preview-board'), randomBoard(st.size, makeRng(1)), {
    maxWidth: 460, label: 'Vorschau des Spielbretts', onPointer: onPreviewPointer,
  });

  // ---------- Ereignisse ----------
  $$(node, '[data-name]').forEach(inp => { inp.oninput = () => { st.names[+inp.dataset.name] = inp.value; validate(); }; });
  $$(node, '[data-src]').forEach(b => { b.onclick = () => { st.source = b.dataset.src; sync(); refresh(); }; });
  $(node, '[data-set=size]').onchange = e => { st.size = +e.target.value; refreshSoon(); };
  $(node, '[data-set=cellMeters]').onchange = e => { st.cellMeters = +e.target.value; refreshSoon(); };
  $(node, '[data-act=reroll]').onclick = () => { st.seed = Math.floor(Math.random() * 1e9); refresh(); };
  $(node, '[data-act=terrain]').onchange = e => { st.showTerrain = e.target.checked; view.set({ showTerrain: st.showTerrain }); };
  $$(node, '[data-pan]').forEach(b => {
    b.onclick = () => { const [dx, dy] = b.dataset.pan.split(',').map(Number); pan(dx, dy); };
  });
  $(node, '[data-act=back]').onclick = onBack;
  $(node, '[data-act=next]').onclick = () => {
    persist();
    onDone({ names: st.names.map((n, i) => n.trim() || (i ? 'Bo' : 'Ada')), board: st.board });
  };
  $(node, '.search-row').onsubmit = async e => {
    e.preventDefault();
    const q = e.target.q.value;
    store('create', { ...store('create'), query: q });
    setStatus('Suche …');
    try {
      st.results = await geocode(q);
      if (!st.results.length) setStatus('Nichts gefunden. Andere Schreibweise probieren?');
      else if (st.results.length === 1) choose(st.results[0]);
      else setStatus('Mehrere Treffer – bitte auswählen.');
    } catch (err) {
      setStatus(err.message || 'Adresssuche fehlgeschlagen.');
      st.results = [];
    }
    renderResults();
  };

  // Ausschnitt durch Ziehen der Vorschau verschieben
  let drag = null;
  function onPreviewPointer(type, _cell, e) {
    if (st.source !== 'map' || !st.center) return;
    if (type === 'down') drag = { x: e.clientX, y: e.clientY };
    else if (type === 'up' && drag) {
      const dx = Math.round((drag.x - e.clientX) / view.cell);
      const dy = Math.round((drag.y - e.clientY) / view.cell);
      drag = null;
      if (dx || dy) pan(dx, dy);
    } else if (type === 'cancel') drag = null;
  }

  function choose(r) {
    st.place = r;
    st.center = { lat: r.lat, lon: r.lon };
    st.results = [];
    renderResults();
    refresh();
  }

  function pan(dx, dy) {
    if (!st.center) return;
    st.center = shiftCenter(st.center, st.cellMeters, dx, dy);
    refresh();
  }

  function renderResults() {
    const box = $(node, '.results');
    box.innerHTML = st.results.length > 1
      ? st.results.map((r, i) => `<button type="button" class="result" data-i="${i}">${esc(r.label)}</button>`).join('')
      : '';
    $$(box, '[data-i]').forEach(b => { b.onclick = () => choose(st.results[+b.dataset.i]); });
  }

  function setStatus(text) { $(node, '.status').textContent = text; }

  function refreshSoon() { clearTimeout(timer); timer = setTimeout(refresh, 350); }

  async function refresh() {
    clearTimeout(timer);
    st.error = '';
    if (st.source === 'random') {
      abort?.abort();
      st.loading = false;
      showBoard(randomBoard(st.size, makeRng(st.seed)));
      setStatus('Zufälliges Gelände – ganz ohne Karte.');
      return;
    }
    if (!st.center) {
      st.board = null;
      setStatus('Suche eine Adresse, um das Spielfeld aus echten Kartendaten zu bauen.');
      sync();
      return;
    }
    const want = { center: st.center, size: st.size, cellMeters: st.cellMeters, label: st.place?.label || '' };
    if (!covers(st.area, st.center, st.size, st.cellMeters)) {
      abort?.abort();
      abort = new AbortController();
      st.loading = true;
      st.board = null;
      sync();
      setStatus('Lade Kartendaten …');
      try {
        st.area = await loadArea(st.center, st.size, st.cellMeters, { signal: abort.signal });
      } catch (err) {
        if (err.name === 'AbortError') return;
        st.loading = false;
        setStatus((err.message || 'Kartendaten nicht erreichbar') + ' – du kannst es erneut versuchen oder Zufallsgelände wählen.');
        sync();
        return;
      }
      st.loading = false;
    }
    showBoard(boardFromOsm(st.area.osm, want));
    setStatus(st.place?.label ? `Mitte: ${st.place.label}` : '');
  }

  function showBoard(board) {
    st.board = board;
    view.setBoard(board);
    view.set({ showTerrain: st.showTerrain });
    renderShares();
    sync();
  }

  function renderShares() {
    const box = $(node, '.shares');
    if (!st.board) { box.innerHTML = ''; return; }
    const shares = terrainShares(st.board);
    const bar = TERRAINS.filter(t => shares[t] > 0)
      .map(t => `<i style="width:${(shares[t] * 100).toFixed(1)}%;background:${OVERLAY[t]}" title="${TERRAIN_INFO[t].label}"></i>`).join('');
    const legend = TERRAINS.filter(t => shares[t] > 0)
      .map(t => `<span><i style="background:${OVERLAY[t]}"></i>${TERRAIN_INFO[t].label} ${Math.round(shares[t] * 100)} %</span>`).join('');
    const dom = dominantTerrain(st.board);
    box.innerHTML = `<div class="share-bar">${bar}</div><div class="share-legend small">${legend}</div>
      ${dom ? `<p class="warn small">⚠️ Über 80 % ${TERRAIN_INFO[dom].label} – das Brett wird eintönig. Ausschnitt verschieben oder Zellgröße ändern?</p>` : ''}`;
  }

  function sync() {
    $$(node, '[data-src]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.src === st.source)));
    node.classList.toggle('src-random', st.source === 'random');
    node.classList.toggle('src-map', st.source === 'map');
    node.classList.toggle('loading', st.loading);
    validate();
  }

  function validate() {
    $(node, '[data-act=next]').disabled = !st.board || st.loading;
  }

  function persist() {
    store('create', {
      ...store('create'),
      name1: st.names[0], ...(mode === 'hotseat' ? { name2: st.names[1] } : {}),
      source: st.source, size: st.size, cellMeters: st.cellMeters,
      place: st.place && { ...st.place, lat: st.center.lat, lon: st.center.lon },
    });
  }

  sync();
  refresh();

  return {
    destroy() { abort?.abort(); clearTimeout(timer); view.destroy(); },
  };
}
