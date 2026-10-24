/*
 * Online-Spiel: eine Spieler-Engine plus Trystero-Transport.
 * Spielstand, Kanalzustand und Entwurf der Aufstellung liegen in
 * sessionStorage – nach einem Reload tritt die Seite dem Raum erneut bei.
 */

import { PlayerGame } from '../engine/game.js';
import { TrysteroTransport, randomRoomId } from '../net/trystero.js';
import { lobbyScreen, waitScreen } from '../ui/lobby.js';
import { hideScreen } from '../ui/hide.js';
import { playScreen } from '../ui/play.js';
import { endScreen } from '../ui/end.js';
import { toast, vibrate } from '../ui/dom.js';

const KEY = 'tierversteck:online';

export function loadSession(roomId) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    return saved?.session?.roomId === roomId ? saved : null;
  } catch { return null; }
}

export function clearSession() {
  try { sessionStorage.removeItem(KEY); } catch { /* egal */ }
}

export function newHostSession(name) {
  return { roomId: randomRoomId(), role: 'host', name, playerId: randomRoomId(16) };
}

export function newGuestSession(roomId, name) {
  return { roomId, role: 'guest', name, playerId: randomRoomId(16) };
}

/**
 * @param {object} ui
 * @param {object} o
 * @param {object} o.session   { roomId, role, name, playerId }
 * @param {object} [o.board]   nur beim Erstellen
 * @param {object} [o.saved]   gespeicherter Stand zum Fortsetzen
 * @param {()=>void} o.onExit
 */
export async function runOnline(ui, { session, board = null, saved = null, onExit }) {
  // ?net=bc: zwei Tabs im selben Browser statt WebRTC (zum Testen)
  const joinRoom = new URLSearchParams(location.search).get('net') === 'bc'
    ? (await import('../net/bc-room.js')).joinRoom
    : null;
  const transport = new TrysteroTransport({ roomId: session.roomId, playerId: session.playerId, saved: saved?.channel, joinRoom });
  let draft = saved?.draft || [];
  let screen = null, screenKey = null, saveQueued = false;
  let conn = 'connecting', connDetail = '';

  const game = new PlayerGame({
    role: session.role, name: session.name, board,
    send: m => { transport.send(m); scheduleSave(); },
    onEvent,
  }, saved?.game);

  transport.onMessage(m => { game.receive(m); scheduleSave(); });
  transport.onStatus((st, detail) => {
    conn = st; connDetail = detail || '';
    ui.setConn(st, detail);
    screen?.setStatus?.(st, detail);
  });

  history.replaceState(null, '', location.pathname + location.search + '#room=' + session.roomId);
  ui.setInGame(true, leave);
  game.start();
  save();
  transport.connect();
  render();

  function scheduleSave() {
    if (saveQueued) return;
    saveQueued = true;
    queueMicrotask(() => { saveQueued = false; save(); });
  }

  function save() {
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ session, game: game.toJSON(), channel: transport.state(), draft }));
    } catch { /* Speicher voll – Fortsetzen nach Reload geht dann nicht */ }
  }

  function leave() {
    transport.close();
    clearSession();
    history.replaceState(null, '', location.pathname + location.search);
    ui.setInGame(false);
    ui.setConn(null);
    onExit();
  }

  function onEvent(e) {
    if (e.type === 'error') {
      console.warn('Tierversteck:', e.reason);
      if (/Version/.test(e.reason)) toast(e.reason, 5000);
    }
    if ((e.type === 'incoming' || e.type === 'play') && game.myTurn) {
      vibrate([30, 60, 30]);
      document.title = '● Du bist dran – Tierversteck';
    } else if (e.type === 'shot-sent') document.title = 'Tierversteck';
    scheduleSave();
    render(e);
  }

  function render(e) {
    const s = game.s;
    const key = s.phase + (s.phase === 'hiding' ? (s.myCommit ? ':wait' : ':hide') : '');
    if (key === screenKey) { screen?.update?.(e); return; }
    screenKey = key;
    const opp = s.oppName || 'Gegner';

    if (s.phase === 'lobby') {
      screen = s.role === 'host'
        ? ui.show(lobbyScreen, { roomId: session.roomId, status: conn, onCancel: leave })
        : ui.show(waitScreen, { title: 'Verbinde …', text: 'Suche den Raum über öffentliche Relays. Das kann ein paar Sekunden dauern.', onCancel: leave });
      if (conn === 'error') screen.setStatus?.(conn, connDetail);
    } else if (key === 'hiding:hide') {
      screen = ui.show(hideScreen, {
        board: s.board,
        title: `Verstecke deine Tiere vor ${opp}`,
        draft,
        onDraft: d => { draft = d; scheduleSave(); },
        onDone: placements => game.commit(placements).catch(err => toast(err.message)),
      });
    } else if (key === 'hiding:wait') {
      screen = ui.show(waitScreen, {
        title: `Warte auf ${opp} …`,
        text: `Deine Tiere sind versteckt. ${s.role === 'host' ? 'Du beginnst' : `${opp} beginnt`}, sobald beide fertig sind.`,
        onCancel: leave,
      });
    } else if (s.phase === 'playing') {
      screen = ui.show(playScreen, { game, onShoot: r => game.shoot(r) });
    } else if (s.phase === 'over') {
      document.title = 'Tierversteck';
      screen = ui.show(endScreen, { game, mode: 'online', onNew: leave });
    }
  }
}
