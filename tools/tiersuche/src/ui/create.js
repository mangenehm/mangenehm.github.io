/* Spiel erstellen: Namen, Adresse suchen, Ausschnitt festlegen, Brett-Vorschau. */

import { geocode } from '../map/geocode.js';
import { loadArea, covers, boardFromOsm, shiftCenter, AREAS } from '../map/build.js';
import { randomBoard } from '../map/regions.js';
import { EDGE } from '../map/render.js';
import { makeRng, terrainShares, dominantTerrain } from '../engine/board.js';
import { TERRAINS, TERRAIN_INFO } from '../engine/shapes.js';
import { BoardView } from './boardview.js';
import { regionText } from './hide.js';
import { el, $, $$, esc, store } from './dom.js';

export function createScreen(root, { onDone, onBack }) {
  const saved = store('create') || {};
  const st = {
    names: [saved.name1 || ''],
    source: saved.source || 'map',
    area: AREAS[saved.area] ? saved.area : 'm',
    place: saved.place || null,          // { lat, lon, label }
    center: saved.place ? { lat: saved.place.lat, lon: saved.place.lon } : null,
    seed: Math.floor(Math.random() * 1e9),
    results: [],
    loaded: null,
    board: null,
    loading: false,
  };
  let view = null, abort = null, timer = null;

  const areaOpts = Object.entries(AREAS).map(([k, a]) => `<option value="${k}">${esc(a.label)}</option>`).join('');

  const node = el(`
    <section class="screen create">
      <div class="card">
        <h2>Dein Name</h2>
        <div class="names">
          ${st.names.map((n, i) => `<label class="field"><span>Name</span>
            <input type="text" maxlength="20" data-name="${i}" value="${esc(n)}" placeholder="${i ? 'Bo' : 'Ada'}"></label>`).join('')}
        </div>
      </div>

      <div class="card">
        <h2>Spielfeld</h2>
        <div class="seg" role="tablist">
          <button type="button" data-src="map" role="tab">🗺️ Echte Karte</button>
          <button type="button" data-src="random" role="tab">🎲 Fantasie-Gegend</button>
        </div>

        <div class="map-only">
          <form class="search-row" autocomplete="off">
            <input type="text" name="q" placeholder="Adresse, Platz oder Ort" aria-label="Adresse suchen" value="${esc(saved.query || '')}">
            <button class="btn secondary" type="submit">Suchen</button>
          </form>
          <div class="results"></div>
        </div>

        <div class="settings">
          <label class="field"><span>Gebiet</span><select data-set="area">${areaOpts}</select></label>
          <button type="button" class="btn secondary random-only" data-act="reroll">Neu würfeln</button>
        </div>

        <div class="preview">
          <div class="preview-board"></div>
          <p class="region-info small muted"></p>
          <div class="pan map-only" aria-label="Ausschnitt verschieben">
            <button type="button" data-pan="0,-1" aria-label="nach Norden">↑</button>
            <button type="button" data-pan="-1,0" aria-label="nach Westen">←</button>
            <button type="button" data-pan="1,0" aria-label="nach Osten">→</button>
            <button type="button" data-pan="0,1" aria-label="nach Süden">↓</button>
          </div>
          <p class="status small muted"></p>
          <div class="shares"></div>
          <p class="attribution map-only"><a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> · © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>-Mitwirkende (ODbL)</p>
        </div>
      </div>

      <div class="row-btns">
        <button class="btn secondary" data-act="back">Zurück</button>
        <button class="btn" data-act="next" disabled>Raum erstellen</button>
      </div>
    </section>`);
  root.appendChild(node);

  $(node, '[data-set=area]').value = st.area;

  view = new BoardView($(node, '.preview-board'), randomBoard(makeRng(1)), {
    maxWidth: 460, label: 'Vorschau des Spielbretts', onPointer: onPreviewPointer, zoomable: false,
  });

  // ---------- Ereignisse ----------
  $$(node, '[data-name]').forEach(inp => { inp.oninput = () => { st.names[+inp.dataset.name] = inp.value; validate(); }; });
  $$(node, '[data-src]').forEach(b => { b.onclick = () => { st.source = b.dataset.src; sync(); refresh(); }; });
  $(node, '[data-set=area]').onchange = e => { st.area = e.target.value; refreshSoon(); };
  $(node, '[data-act=reroll]').onclick = () => { st.seed = Math.floor(Math.random() * 1e9); refresh(); };
  $$(node, '[data-pan]').forEach(b => {
    b.onclick = () => {
      const [dx, dy] = b.dataset.pan.split(',').map(Number);
      const step = AREAS[st.area].meters / 5;
      pan(dx * step, dy * step);
    };
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

  // Ausschnitt durch Ziehen der Vorschau verschieben; Antippen zeigt den Ort
  let drag = null;
  function onPreviewPointer(type, r, e) {
    if (type === 'hover') { $(node, '.region-info').textContent = r != null && st.board ? regionText(st.board, r) : ''; return; }
    if (type === 'down') drag = { x: e.clientX, y: e.clientY };
    else if (type === 'up' && drag) {
      const px = Math.hypot(drag.x - e.clientX, drag.y - e.clientY);
      const m = AREAS[st.area].meters / view.cssSize;
      const dx = (drag.x - e.clientX) * m, dy = (drag.y - e.clientY) * m;
      drag = null;
      if (px > 12 && st.source === 'map' && st.center) pan(dx, dy);
      else if (r != null && st.board) $(node, '.region-info').textContent = regionText(st.board, r);
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
    st.center = shiftCenter(st.center, dx, dy);
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
    const { meters, regions: targetCount } = AREAS[st.area];
    if (st.source === 'random') {
      abort?.abort();
      st.loading = false;
      showBoard(randomBoard(makeRng(st.seed), { targetCount }));
      setStatus('Ausgedachte Gegend – ganz ohne Karte.');
      return;
    }
    if (!st.center) {
      st.board = null;
      setStatus('Suche eine Adresse, um das Spielfeld aus echten Kartendaten zu bauen.');
      sync();
      return;
    }
    if (!covers(st.loaded, st.center, meters)) {
      abort?.abort();
      abort = new AbortController();
      st.loading = true;
      st.board = null;
      sync();
      setStatus('Lade Kartendaten …');
      const signal = abort.signal;
      const onProgress = ({ attempt, total, round }) => {
        if (signal.aborted || (attempt === 1 && round === 1)) return;
        setStatus(round > 1
          ? `Lade Kartendaten … (Kartenserver überlastet, neuer Versuch ${attempt}/${total})`
          : `Lade Kartendaten … (Kartenserver ist langsam, frage Server ${attempt}/${total})`);
      };
      try {
        st.loaded = await loadArea(st.center, meters, { signal, onProgress });
      } catch (err) {
        if (err.name === 'AbortError') return;
        st.loading = false;
        setStatus((err.message || 'Kartendaten nicht erreichbar') + ' – du kannst es erneut versuchen oder eine Fantasie-Gegend wählen.');
        sync();
        return;
      }
      st.loading = false;
    }
    setStatus('Baue Orte …');
    await new Promise(r => setTimeout(r, 0));
    showBoard(boardFromOsm(st.loaded.osm, { center: st.center, label: st.place?.label || '', meters, targetCount }));
    setStatus(st.place?.label ? `Mitte: ${st.place.label}` : '');
  }

  function showBoard(board) {
    st.board = board;
    view.setBoard(board);
    renderShares();
    sync();
  }

  function renderShares() {
    const box = $(node, '.shares');
    if (!st.board) { box.innerHTML = ''; return; }
    const shares = terrainShares(st.board);
    const present = TERRAINS.filter(t => shares[t] > 0);
    const bar = present.map(t => `<i style="width:${(shares[t] * 100).toFixed(1)}%;background:${EDGE[t]}" title="${TERRAIN_INFO[t].label}"></i>`).join('');
    const legend = present.map(t => `<span><i style="background:${EDGE[t]}"></i>${TERRAIN_INFO[t].label} ${Math.round(shares[t] * st.board.regions.length)}</span>`).join('');
    const dom = dominantTerrain(st.board);
    box.innerHTML = `<p class="small"><b>${st.board.regions.length} Orte</b></p>
      <div class="share-bar">${bar}</div><div class="share-legend small">${legend}</div>
      ${dom ? `<p class="warn small">⚠️ Über 80 % ${TERRAIN_INFO[dom].label} – das Brett wird eintönig. Ausschnitt verschieben oder Gebiet ändern?</p>` : ''}`;
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
      name1: st.names[0],
      source: st.source, area: st.area,
      place: st.place && { ...st.place, lat: st.center.lat, lon: st.center.lon },
    });
  }

  sync();
  refresh();

  return {
    destroy() { abort?.abort(); clearTimeout(timer); view.destroy(); },
  };
}
