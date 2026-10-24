/*
 * Hot-Seat: zwei Spieler-Engines im selben Browser, verbunden über den
 * lokalen Transport. Zwischen den Zügen sorgt ein Sichtschutz dafür,
 * dass niemand die Tiere des anderen sieht.
 */

import { PlayerGame } from '../engine/game.js';
import { createLocalPair } from '../net/local.js';
import { coverScreen } from '../ui/cover.js';
import { hideScreen } from '../ui/hide.js';
import { playScreen, describe } from '../ui/play.js';
import { endScreen } from '../ui/end.js';

const tick = () => new Promise(r => setTimeout(r, 0));

export function runHotseat(ui, { names, board, onExit }) {
  let games, active = null, screen = null;
  let news = { host: [], guest: [] };    // was der andere beim Gegner angerichtet hat

  ui.setInGame(true);
  setup(names);

  async function setup(n) {
    const [ta, tb] = createLocalPair();
    news = { host: [], guest: [] };
    games = {
      host: new PlayerGame({ role: 'host', name: n[0], board, send: m => ta.send(m), onEvent: e => onEvent('host', e) }),
      guest: new PlayerGame({ role: 'guest', name: n[1], send: m => tb.send(m), onEvent: e => onEvent('guest', e) }),
    };
    ta.onMessage(m => games.host.receive(m));
    tb.onMessage(m => games.guest.receive(m));
    games.host.start();
    games.guest.start();
    await tick();
    hideFor('host');
  }

  function hideFor(role) {
    const g = games[role];
    const otherName = games[role === 'host' ? 'guest' : 'host'].s.name;
    ui.show(coverScreen, {
      name: g.s.name,
      title: 'Du versteckst jetzt deine fünf Tiere.',
      info: `${otherName}, bitte nicht hinschauen!`,
      onReady: () => {
        screen = ui.show(hideScreen, {
          board: g.board,
          title: `${g.s.name}: Tiere verstecken`,
          onDone: async placements => {
            await g.commit(placements);
            await tick();
            if (role === 'host') hideFor('guest');
            else nextTurn();
          },
        });
      },
    });
  }

  function nextTurn() {
    const g0 = games.host;
    if (g0.phase === 'over') { showEnd(); return; }
    const role = g0.s.turn;
    const g = games[role];
    active = null;
    ui.show(coverScreen, {
      name: g.s.name,
      title: 'Du bist dran.',
      info: news[role].join(' '),
      onReady: () => showPlay(role),
    });
  }

  function showPlay(role) {
    const g = games[role];
    active = role;
    screen = ui.show(playScreen, {
      game: g,
      banner: news[role].join(' '),
      onShoot: r => g.shoot(r),
    });
    news[role] = [];
  }

  function onEvent(role, e) {
    if (e.type === 'incoming') news[role].push(describe(e, games[role]));
    if (e.type !== 'outgoing' || role !== active) return;
    screen.update(e);
    const g = games[role];
    if (g.phase === 'over') screen.setContinue(showEnd, 'Ergebnis ansehen');
    else screen.setContinue(() => { screen.setContinue(null); nextTurn(); }, 'Weiter – Gerät übergeben');
  }

  function showEnd() {
    const winner = games[games.host.s.winner];
    const loser = games[winner.role === 'host' ? 'guest' : 'host'];
    active = null;
    ui.show(endScreen, {
      game: winner,
      mode: 'hotseat',
      oppPlacements: loser.s.placements,
      // Revanche: der andere beginnt
      onRematch: () => setup([games.guest.s.name, games.host.s.name]),
      onNew: () => { ui.setInGame(false); onExit(); },
    });
  }
}
