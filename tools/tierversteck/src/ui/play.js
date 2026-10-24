/* Spielansicht: gegnerisches Revier absuchen, eigenes Revier im Blick. */

import { ANIMALS, ANIMAL_IDS } from '../engine/shapes.js';
import { isInFavorite, regionLabel, animalAt } from '../engine/board.js';
import { BoardView } from './boardview.js';
import { regionText } from './hide.js';
import { headHtml } from './sprites.js';
import { el, $, esc } from './dom.js';

/** Aufgedeckte Tiere aus den eigenen Suchen. */
export function foundPlacements(shots) {
  return shots.filter(s => s.result === 'found' && Array.isArray(s.regions)).map(s => ({ animal: s.animal, regions: s.regions }));
}

/** Beschreibung eines Suchergebnisses aus Sicht des Suchenden bzw. des Gesuchten. */
export function describe(e, game) {
  const reg = game.board.regions[e.r];
  const where = `${regionLabel(e.r)} (${reg.n})`;
  const opp = game.s.oppName || 'Gegner';
  if (e.type === 'outgoing') {
    if (e.result === 'miss') return `${where}: Daneben.${e.tracks ? ' 👣 Aber hier sind Spuren – ein Tier ist ganz in der Nähe!' : ''}`;
    if (e.result === 'hit') return `${where}: Treffer! 🐾`;
    return `${where}: Gefunden – ${ANIMALS[e.animal].name}! ${ANIMALS[e.animal].emoji}`;
  }
  if (e.type === 'incoming') {
    const mine = animalAt(game.s.placements, e.r);
    const t = `${opp} sucht bei ${where}: `;
    if (e.result === 'miss') return t + (e.tracks ? 'Daneben, aber findet Spuren 👣 deiner Tiere.' : 'Daneben.');
    if (e.result === 'hit') return t + `Treffer bei deinem Tier (${ANIMALS[mine.animal].name})!`;
    return t + `${ANIMALS[e.animal].name} gefunden!`;
  }
  return '';
}

/**
 * @param {object} o
 * @param {import('../engine/game.js').PlayerGame} o.game
 * @param {(r:number)=>void} o.onShoot
 * @param {string} [o.banner]
 */
export function playScreen(root, { game, onShoot, banner = '' }) {
  let aim = null;
  let lastIncoming = null;
  let continueFn = null;
  const opp = () => game.s.oppName || 'Gegner';

  const node = el(`
    <section class="screen play">
      <div class="turn card" aria-live="polite"><div class="turn-text"></div><div class="banner"></div>
        <div class="turn-actions"><button class="btn" data-act="fire">Ort antippen</button>
        <button class="btn teal" data-act="continue" hidden>Weiter</button></div></div>
      <div class="boards">
        <div class="card target">
          <h3 class="opp-title"></h3>
          <div class="board-wrap target-board"></div>
          <p class="region-info small muted"></p>
          <div class="animal-list opp-list"></div>
        </div>
        <div class="card own">
          <h3>Dein Revier</h3>
          <div class="board-wrap own-board"></div>
          <div class="animal-list own-list"></div>
        </div>
      </div>
      <p class="attribution">${game.board.source === 'osm' ? '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>-Mitwirkende (ODbL)' : ''}</p>
    </section>`);
  root.appendChild(node);

  const target = new BoardView($(node, '.target-board'), game.board, { onPointer: onTargetPointer, label: 'Revier des Gegners' });
  const own = new BoardView($(node, '.own-board'), game.board, { maxWidth: 380, label: 'Dein Revier' });

  $(node, '[data-act=fire]').onclick = fire;
  $(node, '[data-act=continue]').onclick = () => continueFn?.();

  function shotAt(r) { return game.s.outgoing.some(s => s.r === r); }

  function onTargetPointer(type, r) {
    if (type === 'hover') { $(node, '.region-info').textContent = r != null ? regionText(game.board, r) : (aim != null ? regionText(game.board, aim) : ''); return; }
    if (type !== 'up' || r == null) return;
    $(node, '.region-info').textContent = regionText(game.board, r);
    if (!game.myTurn || shotAt(r)) return;
    if (aim === r) fire();
    else { aim = r; update(); }
  }

  function fire() {
    if (aim == null || !game.myTurn) return;
    const r = aim;
    aim = null;
    onShoot(r);
  }

  function update() {
    const s = game.s;
    $(node, '.opp-title').textContent = `Revier von ${opp()}`;

    let text;
    if (s.phase === 'over') text = s.winner === s.role ? '🏆 Gewonnen!' : 'Alle deine Tiere wurden gefunden.';
    else if (s.pending) text = `Suche bei ${regionLabel(s.pending.r)} …`;
    else if (game.myTurn) text = `Du bist dran: Tippe einen Ort im Revier von ${opp()} an.`;
    else text = `${opp()} ist dran …`;
    $(node, '.turn-text').textContent = text;
    $(node, '.banner').textContent = banner;
    node.classList.toggle('my-turn', game.myTurn);

    // Knöpfe teilen sich einen Platz fester Höhe – sonst verrutscht das Brett zwischen zwei Tipps
    const fireBtn = $(node, '[data-act=fire]');
    const showFire = game.myTurn && aim != null;
    fireBtn.hidden = !showFire && !!continueFn;
    fireBtn.classList.toggle('invisible', !showFire);
    fireBtn.textContent = aim != null ? `Bei ${regionLabel(aim)} suchen!` : 'Ort antippen';
    $(node, '[data-act=continue]').hidden = !continueFn;

    const lastOut = s.outgoing[s.outgoing.length - 1];
    target.set({
      shots: s.outgoing,
      animals: foundPlacements(s.outgoing).map(p => ({ p })),
      aim: game.myTurn ? aim : null,
      last: lastOut ? lastOut.r : null,
      disabled: !game.myTurn && s.phase === 'playing',
    });
    const foundMine = new Set(s.incoming.filter(i => i.result === 'found').map(i => i.animal));
    own.set({
      shots: s.incoming,
      animals: s.placements.map(p => ({ p, dim: foundMine.has(p.animal), glow: !foundMine.has(p.animal) && isInFavorite(game.board, p) })),
      last: lastIncoming,
    });

    const found = new Set(s.outgoing.filter(o => o.result === 'found').map(o => o.animal));
    $(node, '.opp-list').innerHTML = ANIMAL_IDS.map(id =>
      `<span class="chip ${found.has(id) ? 'done' : ''}" title="${esc(ANIMALS[id].name)}">${headHtml(id)}${found.has(id) ? '✓' : ANIMALS[id].size}</span>`).join('');
    const hits = id => s.placements.find(p => p.animal === id).regions.filter(r => s.incoming.some(i => i.r === r)).length;
    $(node, '.own-list').innerHTML = ANIMAL_IDS.map(id =>
      `<span class="chip ${foundMine.has(id) ? 'lost' : ''}" title="${esc(ANIMALS[id].name)}">${headHtml(id)}${hits(id)}/${ANIMALS[id].size}</span>`).join('');
  }

  update();

  return {
    /** Neues Ereignis aus der Engine anzeigen. */
    update(e) {
      if (e && (e.type === 'outgoing' || e.type === 'incoming')) {
        banner = describe(e, game);
        if (e.type === 'incoming') lastIncoming = e.r;
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
