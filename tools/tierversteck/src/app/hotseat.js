/*
 * Hot-Seat: zwei Spieler-Engines im selben Browser, verbunden über den
 * lokalen Transport. Zwischen den Zügen sorgt ein Sichtschutz dafür,
 * dass niemand die Tiere des anderen sieht.
 */

import { PlayerGame } from '../engine/game.js';
import { createLocalPair } from '../net/local.js';
import { coverScreen } from '../ui/cover.js';
import { hideScreen } from '../ui/hide.js';
import { playScreen } from '../ui/play.js';
import { say } from '../ui/feedback.js';
import { endScreen } from '../ui/end.js';
import { toast } from '../ui/dom.js';

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
      icon: '🙈',
      onReady: () => {
        screen = ui.show(hideScreen, {
          board: g.board,
          title: `${g.s.name}: Tiere verstecken`,
          onDone: async placements => {
            try { await g.commit(placements); } catch (err) { toast(err.message || 'Verstecken fehlgeschlagen'); return; }
            await tick();
            if (role === 'host') hideFor('guest');
            else nextTurn();
          },
        });
      },
    });
    say(`${g.s.name} versteckt die Tiere. ${otherName}, nicht hinschauen!`, { interrupt: true });
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
      icon: '👆',
      onReady: () => showPlay(role),
    });
    say(`${g.s.name} ist dran.`, { interrupt: true });
  }

  function showPlay(role) {
    const g = games[role];
    active = role;
    screen = ui.show(playScreen, {
      game: g,
      news: news[role],
      handover: true,
      onShoot: r => g.shoot(r),
    });
    news[role] = [];
  }

  function onEvent(role, e) {
    if (e.type === 'incoming') news[role].push(e);
    if (e.type !== 'outgoing' || role !== active) return;
    screen.update(e);
    const g = games[role], s = screen;
    // Knopf erst nach der Animation – sonst tippt man ihn im Eifer gleich mit weg
    setTimeout(() => {
      if (g.phase === 'over') s.setContinue(showEnd, '<b class="emoji">🏆</b> Ergebnis');
      else s.setContinue(() => { s.setContinue(null); nextTurn(); }, '<b class="emoji">🙈</b> Weiter');
    }, e.result === 'found' ? 1400 : 800);
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
