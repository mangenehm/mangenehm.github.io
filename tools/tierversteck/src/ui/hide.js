/*
 * Tiere verstecken: auswählen, auf das Brett tippen oder ziehen,
 * drehen (Taste R / Doppeltipp), spiegeln (F), entfernen (Entf).
 * Ein Tier im Lieblingsgelände glänzt.
 */

import { ANIMALS, ANIMAL_IDS, shapeSize, TERRAIN_INFO, placementCells } from '../engine/shapes.js';
import { placementProblem, isInFavorite, randomFleet, validateFleet } from '../engine/board.js';
import { BoardView } from './boardview.js';
import { headHtml } from './sprites.js';
import { el, $, $$, esc, vibrate } from './dom.js';

const PROBLEM_TEXT = {
  bounds: 'ragt über den Rand',
  overlap: 'überlappt ein anderes Tier',
  touch: 'berührt ein anderes Tier',
};

/**
 * @param {object} o
 * @param {object} o.board
 * @param {string} o.title
 * @param {object[]} [o.draft]       vorherige, noch nicht bestätigte Aufstellung
 * @param {(placements:object[])=>void} o.onDone
 * @param {(placements:object[])=>void} [o.onDraft]
 */
export function hideScreen(root, { board, title, draft = [], onDone, onDraft = () => {} }) {
  const size = board.size;
  const pl = Object.fromEntries(ANIMAL_IDS.map(id => [id, draft.find(p => p.animal === id) || null]));
  let selected = ANIMAL_IDS.find(id => !pl[id]) || null;
  let showTerrain = false;
  let drag = null;
  let lastTap = { id: null, t: 0 };

  const node = el(`
    <section class="screen hide">
      <div class="card">
        <h2>${esc(title)}</h2>
        <p class="muted small hint">Tier auswählen und aufs Brett tippen. Ziehen verschiebt, Doppeltipp oder <kbd>R</kbd> dreht, <kbd>F</kbd> spiegelt.</p>
        <div class="tray"></div>
        <div class="board-wrap"></div>
        <div class="tools">
          <button type="button" class="btn secondary" data-act="rotate" title="Drehen (R)">⟳ Drehen</button>
          <button type="button" class="btn secondary" data-act="flip" title="Spiegeln (F)">⇋ Spiegeln</button>
          <button type="button" class="btn secondary" data-act="remove" title="Entfernen (Entf)">✕ Weg</button>
          <button type="button" class="btn secondary" data-act="random">🎲 Zufall</button>
        </div>
        <label class="toggle"><input type="checkbox" data-act="terrain"> Geländeklassen zeigen</label>
        <p class="problems small"></p>
      </div>
      <button class="btn block" data-act="done" disabled>Fertig versteckt</button>
    </section>`);
  root.appendChild(node);

  const view = new BoardView($(node, '.board-wrap'), board, { onPointer, label: 'Dein Revier zum Verstecken' });

  $(node, '[data-act=rotate]').onclick = () => transform('rotate');
  $(node, '[data-act=flip]').onclick = () => transform('flip');
  $(node, '[data-act=remove]').onclick = () => { if (selected && pl[selected]) { pl[selected] = null; changed(); } };
  $(node, '[data-act=random]').onclick = () => {
    for (const p of randomFleet(size)) pl[p.animal] = p;
    selected = null;
    changed();
  };
  $(node, '[data-act=terrain]').onchange = e => { showTerrain = e.target.checked; draw(); };
  $(node, '[data-act=done]').onclick = () => {
    const fleet = placements();
    if (!validateFleet(size, fleet)) onDone(fleet);
  };

  const onKey = e => {
    if (e.target.closest?.('input, textarea, select')) return;
    const k = e.key.toLowerCase();
    if (k === 'r') transform('rotate');
    else if (k === 'f') transform('flip');
    else if ((k === 'delete' || k === 'backspace') && selected && pl[selected]) { pl[selected] = null; changed(); }
    else if (k.startsWith('arrow') && selected && pl[selected]) {
      e.preventDefault();
      const d = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }[k];
      moveTo(selected, pl[selected].x + d[0], pl[selected].y + d[1]);
      changed();
    } else return;
  };
  document.addEventListener('keydown', onKey);

  function placements() { return ANIMAL_IDS.map(id => pl[id]).filter(Boolean); }

  function problemOf(id) {
    return pl[id] ? placementProblem(size, pl[id], placements()) : null;
  }

  /** Box innerhalb des Bretts halten. */
  function moveTo(id, x, y) {
    const p = pl[id];
    const { w, h } = shapeSize(id, p.rot, p.flip);
    p.x = Math.max(0, Math.min(size - w, x));
    p.y = Math.max(0, Math.min(size - h, y));
  }

  function transform(kind) {
    if (!selected) return;
    const p = pl[selected];
    if (!p) return;
    const before = shapeSize(selected, p.rot, p.flip);
    const cx = p.x + before.w / 2, cy = p.y + before.h / 2;
    if (kind === 'rotate') p.rot = (p.rot + 1) % 4;
    else p.flip = !p.flip;
    const after = shapeSize(selected, p.rot, p.flip);
    moveTo(selected, Math.round(cx - after.w / 2), Math.round(cy - after.h / 2));
    changed();
  }

  function animalAt(cell) {
    if (!cell) return null;
    // ausgewähltes Tier zuerst, falls es (ungültig) über einem anderen liegt
    const order = selected ? [selected, ...ANIMAL_IDS.filter(id => id !== selected)] : ANIMAL_IDS;
    for (const id of order) {
      const p = pl[id];
      if (!p) continue;
      const { w, h } = shapeSize(id, p.rot, p.flip);
      if (cell.x < p.x || cell.y < p.y || cell.x >= p.x + w || cell.y >= p.y + h) continue;
      if (placementCells(p).some(([x, y]) => x === cell.x && y === cell.y)) return id;
    }
    return null;
  }

  function onPointer(type, cell, e) {
    if (type === 'down') {
      const hitId = animalAt(cell);
      if (hitId) {
        const now = performance.now();
        const isDouble = lastTap.id === hitId && now - lastTap.t < 380;
        lastTap = { id: hitId, t: now };
        selected = hitId;
        if (isDouble) { transform('rotate'); drag = null; return; }
        drag = { id: hitId, dx: cell.x - pl[hitId].x, dy: cell.y - pl[hitId].y, moved: false, start: cell };
        changed(false);
      } else if (cell && selected && !pl[selected]) {
        const { w, h } = shapeSize(selected, 0, false);
        pl[selected] = { animal: selected, x: 0, y: 0, rot: 0, flip: false };
        moveTo(selected, cell.x - Math.floor(w / 2), cell.y - Math.floor(h / 2));
        drag = { id: selected, dx: cell.x - pl[selected].x, dy: cell.y - pl[selected].y, moved: true, start: cell };
        vibrate(8);
        changed();
      } else if (cell) {
        selected = null;
        changed(false);
      }
      e.preventDefault();
    } else if (type === 'move' && drag && cell) {
      const p = pl[drag.id];
      const nx = cell.x - drag.dx, ny = cell.y - drag.dy;
      if (nx !== p.x || ny !== p.y) {
        moveTo(drag.id, nx, ny);
        drag.moved = true;
        draw();
      }
    } else if (type === 'up' || type === 'cancel') {
      if (drag?.moved) changed();
      drag = null;
    }
  }

  function changed(save = true) {
    if (save) onDraft(placements());
    renderTray();
    draw();
  }

  function draw() {
    view.set({
      showTerrain,
      animals: ANIMAL_IDS.filter(id => pl[id]).map(id => ({
        p: pl[id],
        invalid: !!problemOf(id),
        glow: !problemOf(id) && isInFavorite(board, pl[id]),
        selected: id === selected,
      })),
    });
    const probs = ANIMAL_IDS.filter(id => problemOf(id)).map(id => `${ANIMALS[id].name} ${PROBLEM_TEXT[problemOf(id)]}`);
    $(node, '.problems').textContent = probs.join(' · ');
    const all = placements();
    $(node, '[data-act=done]').disabled = all.length !== ANIMAL_IDS.length || !!validateFleet(size, all);
    const sel = selected && pl[selected];
    for (const act of ['rotate', 'flip', 'remove']) $(node, `[data-act=${act}]`).disabled = !sel;
  }

  function renderTray() {
    $(node, '.tray').innerHTML = ANIMAL_IDS.map(id => {
      const a = ANIMALS[id];
      const p = pl[id];
      const fav = p && !problemOf(id) && isInFavorite(board, p);
      const state = !p ? 'offen' : problemOf(id) ? 'ungültig' : fav ? '✨ fühlt sich wohl' : 'versteckt';
      return `<button type="button" class="tray-item ${id === selected ? 'sel' : ''} ${p ? 'placed' : ''} ${fav ? 'fav' : ''}" data-id="${id}"
                aria-pressed="${id === selected}" title="${esc(a.name)}: ${a.cells.length} Felder, mag ${esc(a.favoriteLabel)}">
        ${headHtml(id)}
        <span class="ti-name">${esc(a.name)}</span>
        <span class="ti-meta">${a.cells.length} · ${esc(a.favorite.map(t => TERRAIN_INFO[t].label).join(', '))}</span>
        <span class="ti-state">${state}</span>
      </button>`;
    }).join('');
    $$(node, '.tray-item').forEach(b => { b.onclick = () => { selected = b.dataset.id; changed(false); }; });
  }

  renderTray();
  draw();

  return {
    destroy() { document.removeEventListener('keydown', onKey); view.destroy(); },
  };
}

