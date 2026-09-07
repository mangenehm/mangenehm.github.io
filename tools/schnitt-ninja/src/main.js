/* Bootstrapping, Bildschirm-Zustandsautomat, Canvas-Skalierung, Hauptschleife. */

import { W, H } from './entities.js';
import { Input } from './input.js';
import { Game } from './game.js';
import { Tutorial } from './tutorial.js';
import { UI } from './ui.js';
import * as audio from './audio.js';
import * as store from './storage.js';
import * as R from './render.js';

const canvas = document.getElementById('game');
const stage = document.getElementById('stage');
const ctx = canvas.getContext('2d', { alpha: false });

let state = 'menu';          // menu | playing | paused | tutorial | over
let lastCfg = null;
let pendingCfg = null;
let wakeLock = null;

/* ---------------- Skalierung ---------------- */

function viewport() {
  const vv = window.visualViewport;
  return {
    w: Math.round(vv ? vv.width : window.innerWidth),
    h: Math.round(vv ? vv.height : window.innerHeight),
  };
}

function resize() {
  const { w: vw, h: vh } = viewport();
  const scale = Math.min(vw / W, vh / H);
  const w = Math.max(1, Math.round(W * scale));
  const h = Math.max(1, Math.round(H * scale));
  stage.style.width = `${w}px`;
  stage.style.height = `${h}px`;
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  // Ein einziger, gleichmaessiger Maßstab: sichtbare Klinge, Trefferpruefung
  // und Schnittkante liegen dadurch auf jedem Bildschirm exakt uebereinander.
  ctx.setTransform((w * dpr) / W, 0, 0, (h * dpr) / H, 0, 0);
  checkOrientation();
}

const landscapeQuery = window.matchMedia('(orientation: landscape) and (pointer: coarse)');

function checkOrientation() {
  const bad = landscapeQuery.matches;
  document.getElementById('rotate').classList.toggle('hidden', !bad);
  if (bad && state === 'playing') pause();
}

/* ---------------- Wake Lock ---------------- */

async function acquireWakeLock() {
  if (!('wakeLock' in navigator) || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch (err) {
    wakeLock = null;
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    try { wakeLock.release(); } catch (err) { /* egal */ }
    wakeLock = null;
  }
}

/* ---------------- Zustandswechsel ---------------- */

function startGame(cfg) {
  lastCfg = cfg;
  ui.hideAll();
  ui.showHud(true);
  ui.hideTutorial();
  state = 'playing';
  game.start(cfg);
  acquireWakeLock();
}

function pause() {
  if (state !== 'playing') return;
  state = 'paused';
  input.reset();
  ui.show('pause');
  releaseWakeLock();
}

function resume() {
  if (state !== 'paused') return;
  ui.hideAll();
  ui.showHud(true);
  state = 'playing';
  last = performance.now();
  acquireWakeLock();
}

function toMenu() {
  state = 'menu';
  ui.showHud(false);
  ui.hideCenter();
  ui.hideTutorial();
  ui.setBanner('', false);
  releaseWakeLock();
  ui.show('menu');
}

function runTutorial(afterCfg) {
  pendingCfg = afterCfg || null;
  ui.hideAll();
  state = 'tutorial';
  tutorial.start();
}

function tutorialDone() {
  store.setSetting('tutorialDone', true);
  if (pendingCfg) {
    const cfg = pendingCfg;
    pendingCfg = null;
    startGame(cfg);
  } else {
    toMenu();
  }
}

/* ---------------- UI-Verdrahtung ---------------- */

const ui = new UI({
  onStart(cfg) {
    if (!store.getSettings().tutorialDone) runTutorial(cfg);
    else startGame(cfg);
  },
  onPause: pause,
  onResume: resume,
  onRestart() {
    if (lastCfg) startGame(lastCfg);
    else toMenu();
  },
  onQuit() {
    // "Runde beenden": der Punktestand zaehlt – wichtig fuer das endlose
    // freie Spiel ohne Bomben, das sonst kein Ende haette.
    if (!game.over) game.finish('quit');
    else toMenu();
  },
  onMenu: toMenu,
  onTutorial() { runTutorial(null); },
  onSkipTutorial() { tutorial.finish(); },
  onSound(on) { audio.setEnabled(on); },
});

const input = new Input(canvas);
input.onFirstTouch = () => audio.unlock();

const game = new Game(ctx, input, {
  setBanner: (t, p) => ui.setBanner(t, p),
  setHud: (h) => ui.setHud(h),
  showCenter: (t, s, o) => ui.showCenter(t, s, o),
  hideCenter: () => ui.hideCenter(),
  bumpMultiplier: () => ui.bumpMultiplier(),
  flashDamage: () => ui.flashDamage(),
  gameOver: (result) => {
    state = 'over';
    releaseWakeLock();
    ui.gameOver(result);
  },
});

const tutorial = new Tutorial(ctx, input, ui, tutorialDone);

/* ---------------- Hauptschleife ---------------- */

let last = performance.now();

function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  const segments = input.consume();

  if (state === 'playing') {
    game.processSegments(segments);
    game.update(dt, now);
    game.draw(now);
  } else if (state === 'tutorial') {
    tutorial.processSegments(segments);
    tutorial.update(dt, now);
    tutorial.draw(now);
  } else if (state === 'paused' || state === 'over') {
    game.draw(now);
  } else {
    R.drawBackground(ctx);
  }
  requestAnimationFrame(frame);
}

/* ---------------- Start ---------------- */

audio.setEnabled(store.getSettings().sound);

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 150));
if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
landscapeQuery.addEventListener('change', checkOrientation);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) pause();
  else if (state === 'playing') acquireWakeLock();
});

// Doppeltipp-Zoom und Pull-to-Refresh unterbinden
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => {
  if (e.target === canvas) e.preventDefault();
}, { passive: false });

// Kleiner Haken fuer manuelle Tests in der Konsole (z. B. Spielstand pruefen).
window.__sn = { game, tutorial, ui, input, startGame, toMenu, get state() { return state; } };

resize();
ui.show('menu');
requestAnimationFrame(frame);
