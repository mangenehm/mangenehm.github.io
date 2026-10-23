/* Spielansicht: gegnerisches Revier absuchen, eigenes Revier im Blick. */

import { ANIMALS, ANIMAL_IDS, placementCells, placementFromCells } from '../engine/shapes.js';
import { cellLabel, isInFavorite } from '../engine/board.js';
import { BoardView } from './boardview.js';
import { headHtml } from './sprites.js';
import { el, $, esc } from './dom.js';

/** Aufgedeckte Tiere aus den eigenen Schüssen. */
export function foundPlacements(shots) {
  return shots.filter(s => s.result === 'found')
    .map(s => placementFromCells(s.animal, s.cells))
    .filter(Boolean);
}

/** Beschreibung eines Schussergebnisses aus Sicht des Schützen bzw. des Getroffenen. */
export function describe(e, game) {
  const where = cellLabel(e.x, e.y);
  const opp = game.s.oppName || 'Gegner';
  if (e.type === 'outgoing') {
    let t = e.result === 'miss' ? `${where}: Daneben.`
      : e.result === 'hit' ? `${where}: Treffer! 🐾`
        : `${where}: Gefunden – ${ANIMALS[e.animal].name}! ${ANIMALS[e.animal].emoji}`;
    if (e.counter) t += ` ⚡ ${opp} darf kontern.`;
    return t;
  }
  if (e.type === 'incoming') {
    const mine = game.s.placements.find(p => placementCells(p).some(([x, y]) => x === e.x && y === e.y));
    let t = `${opp} sucht bei ${where}: `;
    t += e.result === 'miss' ? 'Daneben.' : e.result === 'hit' ? `Treffer bei deinem Tier (${ANIMALS[mine.animal].name})!` : `${ANIMALS[e.animal].name} gefunden!`;
    if (e.counter) t += ' ⚡ Du darfst kontern!';
    return t;
  }
  return '';
}

/**
 * @param {object} o
 * @param {import('../engine/game.js').PlayerGame} o.game
 * @param {(x:number, y:number)=>void} o.onShoot
 * @param {string} [o.banner]
 */
export function playScreen(root, { game, onShoot, banner = '' }) {
  let aim = null;
  let showTerrain = false;
  let lastIncoming = null;
  let continueFn = null;
  const opp = () => game.s.oppName || 'Gegner';

  const node = el(`
    <section class="screen play">
      <div class="turn card" aria-live="polite"><div class="turn-text"></div><div class="banner"></div>
        <div class="turn-actions"><button class="btn" data-act="fire">Feld antippen</button>
        <button class="btn teal" data-act="continue" hidden>Weiter</button></div></div>
      <div class="boards">
        <div class="card target">
          <h3 class="opp-title"></h3>
          <div class="board-wrap target-board"></div>
          <div class="animal-list opp-list"></div>
        </div>
        <div class="card own">
          <h3>Dein Revier</h3>
          <div class="board-wrap own-board"></div>
          <div class="animal-list own-list"></div>
        </div>
      </div>
      <label class="toggle"><input type="checkbox" data-act="terrain"> Geländeklassen zeigen</label>
      <p class="attribution">${game.board.source === 'osm' ? '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>-Mitwirkende (ODbL)' : ''}</p>
    </section>`);
  root.appendChild(node);

  const target = new BoardView($(node, '.target-board'), game.board, { onPointer: onTargetPointer, label: 'Revier des Gegners' });
  const own = new BoardView($(node, '.own-board'), game.board, { maxWidth: 380, label: 'Dein Revier' });

  $(node, '[data-act=terrain]').onchange = e => { showTerrain = e.target.checked; update(); };
  $(node, '[data-act=fire]').onclick = fire;
  $(node, '[data-act=continue]').onclick = () => continueFn?.();

  function shotAt(x, y) { return game.s.outgoing.some(s => s.x === x && s.y === y); }

  function onTargetPointer(type, cell) {
    if (type !== 'up' || !cell || !game.myTurn || shotAt(cell.x, cell.y)) return;
    if (aim && aim.x === cell.x && aim.y === cell.y) fire();
    else { aim = cell; update(); }
  }

  function fire() {
    if (!aim || !game.myTurn) return;
    const { x, y } = aim;
    aim = null;
    onShoot(x, y);
  }

  function update() {
    const s = game.s;
    $(node, '.opp-title').textContent = `Revier von ${opp()}`;

    let text;
    if (s.phase === 'over') text = s.winner === s.role ? '🏆 Gewonnen!' : 'Alle deine Tiere wurden gefunden.';
    else if (s.pending) text = `Suche bei ${cellLabel(s.pending.x, s.pending.y)} …`;
    else if (game.myTurn) text = s.kind === 'counter'
      ? '⚡ Konter-Schuss! Schieß sofort zurück – danach bist du normal dran.'
      : `Du bist dran: Tippe ein Feld im Revier von ${opp()} an.`;
    else text = s.kind === 'counter' ? `⚡ ${opp()} kontert …` : `${opp()} ist dran …`;
    $(node, '.turn-text').textContent = text;
    $(node, '.banner').textContent = banner;
    node.classList.toggle('my-turn', game.myTurn);
    node.classList.toggle('counter', game.myTurn && s.kind === 'counter');

    // Knöpfe teilen sich einen Platz fester Höhe – sonst verrutscht das Brett zwischen zwei Tipps
    const fireBtn = $(node, '[data-act=fire]');
    const showFire = game.myTurn && !!aim;
    fireBtn.hidden = !showFire && !!continueFn;
    fireBtn.classList.toggle('invisible', !showFire);
    fireBtn.textContent = aim ? `Bei ${cellLabel(aim.x, aim.y)} suchen!` : 'Feld antippen';
    $(node, '[data-act=continue]').hidden = !continueFn;

    const lastOut = s.outgoing[s.outgoing.length - 1];
    target.set({
      showTerrain,
      shots: s.outgoing,
      animals: foundPlacements(s.outgoing).map(p => ({ p, dim: false })),
      aim: game.myTurn ? aim : null,
      last: lastOut ? { x: lastOut.x, y: lastOut.y } : null,
      disabled: !game.myTurn && s.phase === 'playing',
    });
    const foundMine = new Set(s.incoming.filter(i => i.result === 'found').map(i => i.animal));
    own.set({
      showTerrain,
      shots: s.incoming,
      animals: s.placements.map(p => ({ p, dim: foundMine.has(p.animal), glow: !foundMine.has(p.animal) && isInFavorite(game.board, p) })),
      last: lastIncoming,
    });

    const found = new Set(s.outgoing.filter(o => o.result === 'found').map(o => o.animal));
    $(node, '.opp-list').innerHTML = ANIMAL_IDS.map(id =>
      `<span class="chip ${found.has(id) ? 'done' : ''}" title="${esc(ANIMALS[id].name)}">${headHtml(id)}${found.has(id) ? '✓' : ANIMALS[id].cells.length}</span>`).join('');
    const hits = id => s.incoming.filter(i => i.result !== 'miss' && placementCells(s.placements.find(p => p.animal === id)).some(([x, y]) => x === i.x && y === i.y)).length;
    $(node, '.own-list').innerHTML = ANIMAL_IDS.map(id =>
      `<span class="chip ${foundMine.has(id) ? 'lost' : ''}" title="${esc(ANIMALS[id].name)}">${headHtml(id)}${hits(id)}/${ANIMALS[id].cells.length}</span>`).join('');
  }

  update();

  return {
    /** Neues Ereignis aus der Engine anzeigen. */
    update(e) {
      if (e && (e.type === 'outgoing' || e.type === 'incoming')) {
        banner = describe(e, game);
        if (e.type === 'incoming') lastIncoming = { x: e.x, y: e.y };
        const turn = $(node, '.turn');
        turn.classList.remove('flash');
        void turn.offsetWidth;
        turn.classList.add('flash');
      }
      update();
    },
    /** Hot-Seat: „Weiter“-Knopf zeigen (null = verbergen). */
    setContinue(fn, label = 'Weiter') {
      continueFn = fn;
      $(node, '[data-act=continue]').textContent = label;
      update();
    },
    setBanner(text) { banner = text; update(); },
    destroy() { target.destroy(); own.destroy(); },
  };
}
