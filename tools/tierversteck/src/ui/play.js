/* Spielansicht: gegnerisches Revier absuchen, eigenes Revier im Blick. */

import { ANIMALS, ANIMAL_IDS } from '../engine/shapes.js';
import { isInFavorite, regionLabel, animalAt } from '../engine/board.js';
import { BoardView } from './boardview.js';
import { regionText } from './hide.js';
import { headHtml } from './sprites.js';
import { sound } from './feedback.js';
import { el, $, esc, vibrate } from './dom.js';

/** Aufgedeckte Tiere aus den eigenen Suchen. */
export function foundPlacements(shots) {
  return shots.filter(s => s.result === 'found' && Array.isArray(s.regions)).map(s => ({ animal: s.animal, regions: s.regions }));
}

/** Beschreibung eines Suchergebnisses aus Sicht des Suchenden bzw. des Gesuchten (für Screenreader). */
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

/** Ergebnis als Bild mit höchstens einem Wort – lesbar auch ohne Lesen. */
export function resultHtml(e, game) {
  if (e.type === 'outgoing') {
    if (e.result === 'miss') return e.tracks
      ? '<span class="res"><b class="emoji">💨</b><b class="emoji">👣</b>Spuren!</span>'
      : '<span class="res"><b class="emoji">💨</b>Daneben</span>';
    if (e.result === 'hit') return '<span class="res hit"><b class="emoji">🐾</b>Treffer!</span>';
    return `<span class="res found">${headHtml(e.animal, 'head big')}<b class="emoji">✅</b></span>`;
  }
  // Was der Gegner bei mir gefunden hat: nur Treffer zählen
  const mine = e.result === 'found' ? e.animal : animalAt(game.s.placements, e.r)?.animal;
  if (e.result === 'miss') return `<span class="res small-res"><b class="emoji">💨</b></span>`;
  return `<span class="res small-res lost">${headHtml(mine)}<b class="emoji">${e.result === 'found' ? '😱' : '🐾'}</b></span>`;
}

/**
 * @param {object} o
 * @param {import('../engine/game.js').PlayerGame} o.game
 * @param {(r:number)=>void} o.onShoot
 */
export function playScreen(root, { game, onShoot }) {
  let lastIncoming = null;
  let result = '';           // Bild zum letzten eigenen Ergebnis
  let srText = '';
  const timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const opp = () => game.s.oppName || 'Gegner';

  const node = el(`
    <section class="screen play">
      <div class="turn card"><div class="turn-text"></div><div class="banner"></div>
        <p class="sr-only" aria-live="polite"></p></div>
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

  function shotAt(r) { return game.s.outgoing.some(s => s.r === r); }

  function onTargetPointer(type, r) {
    if (type === 'hover') { $(node, '.region-info').textContent = r != null ? regionText(game.board, r) : ''; return; }
    if (type !== 'up' || r == null) return;
    $(node, '.region-info').textContent = regionText(game.board, r);
    if (!game.myTurn) return;
    if (shotAt(r)) { sound('nope'); vibrate(40); return; }
    // Ein Tipp genügt: sofort suchen
    sound('tap');
    vibrate(10);
    target.fx(r, 'aim');
    onShoot(r);
  }

  function update() {
    const s = game.s;
    $(node, '.opp-title').textContent = `Revier von ${opp()}`;

    let text;
    if (s.phase === 'over') text = s.winner === s.role ? '<b class="emoji">🏆</b> Gewonnen!' : '<b class="emoji">😿</b>';
    else if (s.pending) text = '<b class="emoji searching">🔍</b>';
    else if (game.myTurn) text = s.outgoing.at(-1)?.result && s.outgoing.at(-1).result !== 'miss'
      ? '<b class="emoji point">👆</b> Nochmal!'
      : '<b class="emoji point">👆</b> Du bist dran!';
    else text = `<b class="emoji">⏳</b> ${esc(opp())}`;
    $(node, '.turn-text').innerHTML = text;
    $(node, '.banner').innerHTML = result;
    node.classList.toggle('my-turn', game.myTurn);

    const lastOut = s.outgoing[s.outgoing.length - 1];
    target.set({
      shots: s.outgoing,
      animals: foundPlacements(s.outgoing).map(p => ({ p })),
      aim: s.pending ? s.pending.r : null,
      last: lastOut ? lastOut.r : null,
      disabled: !game.myTurn && !s.pending && s.phase === 'playing',
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
    $(node, '.sr-only').textContent = srText;
  }

  function flash() {
    const turn = $(node, '.turn');
    turn.classList.remove('flash');
    void turn.offsetWidth;
    turn.classList.add('flash');
  }

  /** Eigenes Suchergebnis: Animation am Ort und Geräusch. */
  function showOutgoing(e) {
    const kind = e.result === 'miss' ? (e.tracks ? 'tracks' : 'miss') : e.result;
    target.fx(e.r, kind, { animal: e.animal });
    sound(e.result === 'miss' ? 'miss' : e.result);
    if (e.tracks) later(() => sound('tracks'), 350);
    vibrate(e.result === 'miss' ? 20 : [40, 40, 80]);
    result = resultHtml(e, game);
    // Daneben: erst das Ergebnis zeigen, dann zurück zur Übersicht. Nach Treffern geht es gleich weiter – Zoom bleibt
    if (!game.myTurn) later(() => target.resetZoom(), 1100);
  }

  /** Suche des Gegners im eigenen Revier. */
  function showIncoming(e) {
    lastIncoming = e.r;
    own.fx(e.r, e.result === 'miss' ? 'miss' : 'ouch');
    if (e.result !== 'miss') sound('ouch');
  }

  update();
  if (game.myTurn) later(() => sound('turn'), 150);

  return {
    /** Neues Ereignis aus der Engine anzeigen. */
    update(e) {
      if (e?.type === 'outgoing') showOutgoing(e);
      if (e?.type === 'incoming') {
        showIncoming(e);
        result = resultHtml(e, game);
        if (game.myTurn) later(() => sound('turn'), 900);
      }
      if (e?.type === 'outgoing' || e?.type === 'incoming') { srText = describe(e, game); flash(); }
      update();
    },
    destroy() { timers.forEach(clearTimeout); target.destroy(); own.destroy(); },
  };
}
