/*
 * Tiere verstecken: Tier auswählen, dann so viele zusammenhängende Orte
 * antippen, wie es braucht. Nochmal tippen nimmt einen Ort weg.
 * Ein Tier im Lieblingsgelände glänzt – und hinterlässt keine Spuren.
 */

import { ANIMALS, ANIMAL_IDS, TERRAIN_INFO } from '../engine/shapes.js';
import { placementProblem, isInFavorite, randomFleet, validateFleet, regionLabel } from '../engine/board.js';
import { BoardView } from './boardview.js';
import { headHtml } from './sprites.js';
import { sound } from './feedback.js';
import { el, $, $$, esc, vibrate } from './dom.js';

const PROBLEM_TEXT = {
  size: 'braucht noch Orte',
  apart: 'hängt nicht zusammen',
  overlap: 'teilt einen Ort mit einem anderen Tier',
};

/** Ortsbeschreibung für Hinweiszeilen: „Ort 12 · Häuser an der Lindenstraße (Häuser)“ */
export function regionText(board, r) {
  const reg = board.regions[r];
  const terrain = TERRAIN_INFO[reg.t].label;
  return `${regionLabel(r)} · ${reg.n}${reg.n.startsWith(TERRAIN_INFO[reg.t].plural) ? '' : ` (${terrain})`}`;
}

/**
 * @param {object} o
 * @param {object} o.board
 * @param {string} o.title
 * @param {object[]} [o.draft]       vorherige, noch nicht bestätigte Aufstellung
 * @param {(placements:object[])=>void} o.onDone
 * @param {(placements:object[])=>void} [o.onDraft]
 */
export function hideScreen(root, { board, title, draft = [], onDone, onDraft = () => {} }) {
  const pl = Object.fromEntries(ANIMAL_IDS.map(id => [id, null]));
  for (const p of draft) if (ANIMAL_IDS.includes(p?.animal) && Array.isArray(p.regions)) pl[p.animal] = { animal: p.animal, regions: [...p.regions] };
  let selected = ANIMAL_IDS.find(id => !complete(id)) || null;
  let info = '';

  const node = el(`
    <section class="screen hide">
      <div class="card">
        <h2>${esc(title)}</h2>
        <p class="muted small hint">Tier auswählen und zusammenhängende Orte antippen. Nochmal tippen nimmt den Ort weg. Mit ＋/− oder zwei Fingern zoomen.
          Im Lieblingsgelände ✨ hinterlässt ein Tier keine Spuren 👣.</p>
        <div class="tray"></div>
        <div class="board-wrap"></div>
        <p class="region-info small muted" aria-live="polite"></p>
        <div class="tools">
          <button type="button" class="btn secondary" data-act="remove">✕ Tier weg</button>
          <button type="button" class="btn secondary" data-act="random">🎲 Zufall</button>
        </div>
        <p class="problems small"></p>
      </div>
      <button class="btn block" data-act="done" disabled>Fertig versteckt</button>
    </section>`);
  root.appendChild(node);

  const view = new BoardView($(node, '.board-wrap'), board, { onPointer, label: 'Dein Revier zum Verstecken' });

  $(node, '[data-act=remove]').onclick = () => { if (selected && pl[selected]) { pl[selected] = null; changed(); } };
  $(node, '[data-act=random]').onclick = () => {
    for (const p of randomFleet(board)) pl[p.animal] = p;
    view.resetZoom();
    sound('place');
    selected = null;
    changed();
  };
  $(node, '[data-act=done]').onclick = () => {
    const fleet = placements();
    if (!validateFleet(board, fleet)) onDone(fleet);
  };

  function placements() { return ANIMAL_IDS.map(id => pl[id]).filter(Boolean); }
  function complete(id) { return !!pl[id] && pl[id].regions.length === ANIMALS[id].size; }
  function owner(r) { return ANIMAL_IDS.find(id => pl[id]?.regions.includes(r)) || null; }

  function problemOf(id) {
    return pl[id] ? placementProblem(board, pl[id], placements()) : null;
  }

  /** Orte, die das ausgewählte Tier als Nächstes belegen kann. */
  function candidates() {
    const p = selected && pl[selected];
    if (!p || complete(selected) || !p.regions.length) return [];
    return [...new Set(p.regions.flatMap(r => board.adj[r]))].filter(r => !owner(r));
  }

  function tap(r) {
    const who = owner(r);
    if (who && who === selected) {
      // Ort wieder freigeben; ohne Orte ist das Tier weg
      pl[who].regions = pl[who].regions.filter(x => x !== r);
      if (!pl[who].regions.length) pl[who] = null;
    } else if (who) {
      selected = who;
      changed(false);
      return;
    } else if (selected) {
      const p = pl[selected];
      const neighbor = p && p.regions.some(x => board.adj[x].includes(r));
      if (!p || complete(selected) || !neighbor) pl[selected] = { animal: selected, regions: [r] };   // neu anfangen
      else p.regions.push(r);
      vibrate(8);
      // fertig → kurzer Jubel (✨ im Lieblingsgelände), dann nächstes offenes Tier auswählen
      if (complete(selected) && !problemOf(selected)) {
        sound('place');
        if (isInFavorite(board, pl[selected])) setTimeout(() => sound('sparkle'), 150);
        view.fx(r, 'place');
        selected = ANIMAL_IDS.find(id => !complete(id)) || selected;
      } else sound(complete(selected) ? 'nope' : 'tap');
    } else return;
    changed();
  }

  function onPointer(type, r) {
    if (type === 'up' && r != null) tap(r);
    if (type === 'hover' || type === 'up') { info = r != null ? regionText(board, r) : ''; $(node, '.region-info').textContent = info; }
  }

  function changed(save = true) {
    if (save) onDraft(placements());
    renderTray();
    draw();
  }

  function draw() {
    view.set({
      marks: candidates(),
      animals: ANIMAL_IDS.filter(id => pl[id]).map(id => ({
        p: pl[id],
        invalid: !!problemOf(id) && complete(id),
        glow: !problemOf(id) && isInFavorite(board, pl[id]),
        selected: id === selected,
      })),
    });
    const probs = ANIMAL_IDS.filter(id => pl[id] && problemOf(id))
      .map(id => `${ANIMALS[id].name} ${problemOf(id) === 'size' ? `braucht noch ${ANIMALS[id].size - pl[id].regions.length} Ort(e)` : PROBLEM_TEXT[problemOf(id)]}`);
    $(node, '.problems').textContent = probs.join(' · ');
    const all = placements();
    $(node, '[data-act=done]').disabled = all.length !== ANIMAL_IDS.length || !!validateFleet(board, all);
    $(node, '[data-act=remove]').disabled = !(selected && pl[selected]);
  }

  function renderTray() {
    $(node, '.tray').innerHTML = ANIMAL_IDS.map(id => {
      const a = ANIMALS[id];
      const p = pl[id];
      const ok = complete(id) && !problemOf(id);
      const fav = ok && isInFavorite(board, p);
      const state = !p ? 'offen' : !complete(id) ? `${p.regions.length}/${a.size}` : problemOf(id) ? 'ungültig' : fav ? '✨ getarnt' : 'versteckt';
      return `<button type="button" class="tray-item ${id === selected ? 'sel' : ''} ${ok ? 'placed' : ''} ${fav ? 'fav' : ''}" data-id="${id}"
                aria-pressed="${id === selected}" title="${esc(a.name)}: ${a.size} ${a.size === 1 ? 'Ort' : 'Orte'}, mag ${esc(a.favoriteLabel)}">
        ${headHtml(id)}
        <span class="ti-name">${esc(a.name)}</span>
        <span class="ti-meta">${a.size} · ${esc(a.favorite.map(t => TERRAIN_INFO[t].label).join(', '))}</span>
        <span class="ti-state">${state}</span>
      </button>`;
    }).join('');
    $$(node, '.tray-item').forEach(b => { b.onclick = () => { selected = b.dataset.id; changed(false); }; });
  }

  renderTray();
  draw();

  return {
    destroy() { view.destroy(); },
  };
}
