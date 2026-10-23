/* Einstieg: Bildschirme wechseln, Kopfzeile, Routing über #room=… */

import { loadAssets } from './ui/sprites.js';
import { startScreen } from './ui/start.js';
import { createScreen } from './ui/create.js';
import { joinScreen } from './ui/lobby.js';
import { runHotseat } from './app/hotseat.js';
import { runOnline, loadSession, newHostSession, newGuestSession } from './app/online.js';
import { store } from './ui/dom.js';

const root = document.getElementById('app');
const connEl = document.getElementById('conn');
const leaveBtn = document.getElementById('leave');
let current = null;
let leaveHandler = null;

const ui = {
  show(factory, props) {
    current?.destroy?.();
    root.innerHTML = '';
    window.scrollTo(0, 0);
    current = factory(root, props) || {};
    return current;
  },
  setInGame(on, onLeave = null) {
    document.body.classList.toggle('in-game', !!on);
    leaveHandler = on ? onLeave : null;
    leaveBtn.hidden = !on;
  },
  setConn(status, detail = '') {
    connEl.hidden = !status;
    if (!status) return;
    connEl.className = 'conn ' + ({ connected: 'ok', connecting: 'wait', lost: 'wait', error: 'bad' }[status] || '');
    connEl.querySelector('span').textContent = {
      connected: 'Verbunden', connecting: 'Verbinde …', lost: 'Verbindung weg – warte …', error: 'Keine Verbindung',
    }[status] || status;
    connEl.title = detail || '';
  },
};

leaveBtn.onclick = () => {
  if (!confirm('Spiel wirklich beenden?')) return;
  if (leaveHandler) leaveHandler();
  else { ui.setInGame(false); home(); }
};

function home() {
  ui.setConn(null);
  ui.show(startScreen, {
    onHotseat: () => ui.show(createScreen, {
      mode: 'hotseat',
      onBack: home,
      onDone: ({ names, board }) => runHotseat(ui, { names, board, onExit: home }),
    }),
    onOnline: () => ui.show(createScreen, {
      mode: 'online',
      onBack: home,
      onDone: ({ names, board }) => runOnline(ui, { session: newHostSession(names[0]), board, onExit: home }),
    }),
    onJoin: roomId => { location.hash = 'room=' + roomId; },
  });
}

function route() {
  const m = location.hash.match(/room=([a-z0-9]+)/i);
  if (!m) { home(); return; }
  const roomId = m[1].toLowerCase();
  const saved = loadSession(roomId);
  if (saved) {
    runOnline(ui, { session: saved.session, saved, onExit: home });
    return;
  }
  ui.show(joinScreen, {
    roomId,
    name: store('create')?.name1 || '',
    onCancel: () => { history.replaceState(null, '', location.pathname + location.search); home(); },
    onJoin: name => {
      store('create', { ...store('create'), name1: name });
      runOnline(ui, { session: newGuestSession(roomId, name), onExit: home });
    },
  });
}

window.addEventListener('hashchange', () => {
  // Nur reagieren, wenn nicht gerade ein Spiel läuft (z. B. Raum-Code auf der Startseite)
  if (!document.body.classList.contains('in-game')) route();
});

// Grafiken kurz abwarten, aber nie länger als nötig
Promise.race([loadAssets(), new Promise(r => setTimeout(r, 800))]).then(route);
