/* Endbildschirm: Sieger, beide Reviere aufgedeckt, Fairness-Prüfung. */

import { BoardView } from './boardview.js';
import { el, $, esc } from './dom.js';
import { foundPlacements } from './play.js';

function stats(shots) {
  const hits = shots.filter(s => s.result !== 'miss').length;
  return `${shots.length} Suchen · ${hits} Treffer · ${shots.length ? Math.round((hits / shots.length) * 100) : 0} %`;
}

/**
 * @param {object} o
 * @param {import('../engine/game.js').PlayerGame} o.game   Sicht des Spielers, der hier zuschaut
 * @param {'online'|'hotseat'} o.mode
 * @param {object[]|null} [o.oppPlacements]  bekannt im Hot-Seat; online aus dem Aufdecken
 * @param {()=>void} [o.onRematch]
 * @param {()=>void} o.onNew
 */
export function endScreen(root, { game, mode, oppPlacements = null, onRematch = null, onNew }) {
  const s = game.s;
  const winnerName = s.winner === s.role ? s.name : s.oppName;
  const node = el(`
    <section class="screen end">
      <div class="card end-head">
        <div class="trophy" aria-hidden="true">🏆</div>
        <h2>${esc(winnerName)} gewinnt!</h2>
        <p class="verdict small"></p>
        <div class="row-btns">
          ${onRematch ? '<button class="btn" data-act="rematch">Revanche auf derselben Karte</button>' : ''}
          <button class="btn ${onRematch ? 'secondary' : ''}" data-act="new">Neues Spiel</button>
        </div>
      </div>
      <div class="boards">
        <div class="card"><h3>Revier von ${esc(s.name)}</h3><p class="small muted">${esc(s.oppName)}: ${stats(s.incoming)}</p><div class="board-wrap mine"></div></div>
        <div class="card"><h3>Revier von ${esc(s.oppName)}</h3><p class="small muted">${esc(s.name)}: ${stats(s.outgoing)}</p><div class="board-wrap theirs"></div></div>
      </div>
    </section>`);
  root.appendChild(node);
  if (onRematch) $(node, '[data-act=rematch]').onclick = onRematch;
  $(node, '[data-act=new]').onclick = onNew;

  const mine = new BoardView($(node, '.mine'), game.board, { maxWidth: 420 });
  const theirs = new BoardView($(node, '.theirs'), game.board, { maxWidth: 420 });

  function update() {
    mine.set({ animals: s.placements.map(p => ({ p })), shots: s.incoming });
    const opp = oppPlacements || (s.verdict?.ok ? s.oppReveal?.placements : null);
    const found = new Set(s.outgoing.filter(o => o.result === 'found').map(o => o.animal));
    theirs.set({
      animals: opp
        ? opp.map(p => ({ p, ghost: !found.has(p.animal) }))
        : foundPlacements(s.outgoing).map(p => ({ p })),
      shots: s.outgoing,
    });
    const v = $(node, '.verdict');
    if (mode === 'hotseat') v.textContent = '';
    else if (!s.oppReveal || s.verdict?.ok === null || !s.verdict) v.textContent = '⏳ Warte auf die Aufstellung des Gegners zur Prüfung …';
    else if (s.verdict.ok) v.innerHTML = '✅ Fair gespielt: Die Aufstellung passt zum Commitment und zu allen Antworten.';
    else v.innerHTML = `<b class="bad">⚠️ Spiel ungültig:</b> ${esc(s.verdict.reason)}`;
  }
  update();

  return {
    update,
    destroy() { mine.destroy(); theirs.destroy(); },
  };
}
