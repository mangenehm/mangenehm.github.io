/*
 * Rückmeldungen auch für Kinder, die noch nicht lesen können:
 * Geräusche (WebAudio, ohne Dateien), kurze Ansagen (Sprachausgabe)
 * und große Animationen direkt auf dem Brett.
 */

import { ANIMALS } from '../engine/shapes.js';
import { asset } from './sprites.js';
import { store } from './dom.js';

let on = store('sound') ?? true;
let actx = null;

export const soundOn = () => on;

export function setSound(value) {
  on = !!value;
  store('sound', on);
  if (!on) try { speechSynthesis.cancel(); } catch { /* keine Sprachausgabe */ }
}

function audio() {
  try {
    actx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    return actx;
  } catch { return null; }
}

// Töne: [Frequenz Hz, Start s, Dauer s, Wellenform, Lautstärke]
const TUNES = {
  tap:     [[700, 0, .05, 'sine', .12]],
  hit:     [[523, 0, .12, 'triangle', .3], [784, .1, .22, 'triangle', .3]],
  found:   [[523, 0, .1, 'triangle', .3], [659, .1, .1, 'triangle', .3], [784, .2, .1, 'triangle', .3], [1047, .3, .4, 'triangle', .35]],
  tracks:  [[880, 0, .05, 'sine', .25], [740, .16, .05, 'sine', .25], [880, .32, .05, 'sine', .25]],
  ouch:    [[440, 0, .14, 'sawtooth', .12], [330, .13, .28, 'sawtooth', .12]],
  turn:    [[784, 0, .14, 'sine', .25], [1047, .14, .3, 'sine', .25]],
  place:   [[600, 0, .06, 'sine', .2], [900, .05, .1, 'sine', .2]],
  sparkle: [[1319, 0, .08, 'sine', .12], [1568, .07, .08, 'sine', .12], [2093, .14, .2, 'sine', .1]],
  nope:    [[220, 0, .1, 'square', .07], [185, .11, .16, 'square', .07]],
  win:     [[523, 0, .15, 'triangle', .3], [523, .16, .1, 'triangle', .3], [659, .28, .15, 'triangle', .3], [784, .44, .15, 'triangle', .3], [1047, .6, .6, 'triangle', .35]],
};

/** Kurzes Geräusch abspielen. */
export function sound(kind) {
  if (!on) return;
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + 0.01;
  if (kind === 'miss') { whoosh(ac, t0); return; }
  for (const [f, start, dur, type, vol] of TUNES[kind] || []) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(0, t0 + start);
    g.gain.linearRampToValueAtTime(vol, t0 + start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + start + dur);
    o.connect(g).connect(ac.destination);
    o.start(t0 + start);
    o.stop(t0 + start + dur + 0.05);
  }
}

/** Daneben: gefiltertes Rauschen, das nach unten wegrutscht – „pfff“. */
function whoosh(ac, t0) {
  const len = 0.45;
  const buf = ac.createBuffer(1, Math.ceil(ac.sampleRate * len), ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  src.buffer = buf;
  f.type = 'bandpass';
  f.Q.value = 1.2;
  f.frequency.setValueAtTime(1400, t0);
  f.frequency.exponentialRampToValueAtTime(250, t0 + len);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(0.5, t0 + 0.04);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + len);
  src.connect(f).connect(g).connect(ac.destination);
  src.start(t0);
}

let voice;
function germanVoice() {
  if (voice !== undefined) return voice;
  const list = speechSynthesis.getVoices();
  if (!list.length) return null;   // Stimmen laden noch – beim nächsten Mal
  voice = list.find(v => v.lang === 'de-DE' && v.localService) || list.find(v => v.lang?.startsWith('de')) || null;
  return voice;
}

/** Kurze Ansage. `interrupt` bricht laufende Ansagen ab. */
export function say(text, { interrupt = false } = {}) {
  if (!on || !text) return;
  try {
    if (interrupt) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'de-DE';
    const v = germanVoice();
    if (v) u.voice = v;
    u.rate = 1;
    u.pitch = 1.1;
    speechSynthesis.speak(u);
  } catch { /* keine Sprachausgabe */ }
}

// Akkusativ für Ansagen: „Du hast den Hund gefunden!“
const ACC = { snake: 'die Schlange', horse: 'das Pferd', dog: 'den Hund', cat: 'die Katze', mouse: 'die Maus' };
const ACC_YOUR = { snake: 'deine Schlange', horse: 'dein Pferd', dog: 'deinen Hund', cat: 'deine Katze', mouse: 'deine Maus' };

/** Ansage zu einem Suchergebnis. */
export function phrase(e, oppName, mineId = null) {
  if (e.type === 'outgoing') {
    if (e.result === 'miss') return e.tracks ? 'Spuren! Ein Tier ist ganz nah.' : 'Daneben.';
    if (e.result === 'hit') return 'Treffer!';
    return `Du hast ${ACC[e.animal]} gefunden!`;
  }
  if (e.result === 'miss') return null;
  if (e.result === 'hit') return `${oppName} hat ${ACC_YOUR[mineId] || 'dein Tier'} erwischt.`;
  return `${oppName} hat ${ACC_YOUR[e.animal]} gefunden.`;
}

/** Bild oder Emoji als HTML für die Effekt-Ebene. */
function pic(key, emoji) {
  const img = asset(key);
  return img ? `<img src="${img.src}" alt="">` : `<span class="emoji">${emoji}</span>`;
}

/**
 * Große Animation über dem Brett.
 * @param {HTMLElement} frame  positionierter Container des Bretts
 * @param {number} x, y        Mitte in CSS-Pixeln relativ zum Container
 * @param {'miss'|'tracks'|'hit'|'found'|'ouch'|'place'|'aim'} kind   aim: pulsierender Ring
 * @param {number} size        Grundgröße in CSS-Pixeln
 */
export function burst(frame, x, y, kind, { animal = null, size = 60 } = {}) {
  const fx = document.createElement('div');
  fx.className = `fx fx-${kind}`;
  fx.setAttribute('aria-hidden', 'true');
  fx.style.left = x + 'px';
  fx.style.top = y + 'px';
  fx.style.setProperty('--s', Math.round(size) + 'px');
  if (kind === 'miss') fx.innerHTML = pic('miss', '💨');
  else if (kind === 'tracks') fx.innerHTML = `${pic('miss', '💨')}<b class="fx-steps"><i>👣</i><i>👣</i><i>👣</i></b>`;
  else if (kind === 'hit' || kind === 'ouch') fx.innerHTML = pic('hit', '🐾');
  else if (kind === 'place') fx.innerHTML = '<span class="emoji">✨</span>';
  else if (kind === 'found') {
    fx.innerHTML = `<span class="fx-star">${pic(animal, ANIMALS[animal].emoji)}</span>` +
      Array.from({ length: 14 }, (_, i) => `<i class="confetti" style="--a:${i * 360 / 14}deg;--c:${['#ef6f53', '#e9b949', '#4f9a5a', '#1f7a7a', '#b77a4a'][i % 5]}"></i>`).join('');
  }
  frame.appendChild(fx);
  setTimeout(() => fx.remove(), kind === 'found' ? 2200 : 1500);
  return fx;
}

/** Konfetti über einem beliebigen Element (Endbildschirm). */
export function confetti(host, n = 24) {
  const box = document.createElement('div');
  box.className = 'confetti-rain';
  box.setAttribute('aria-hidden', 'true');
  box.innerHTML = Array.from({ length: n }, (_, i) =>
    `<i style="left:${(i * 97) % 100}%;--d:${(i % 7) * 0.12}s;--c:${['#ef6f53', '#e9b949', '#4f9a5a', '#1f7a7a', '#b77a4a'][i % 5]}"></i>`).join('');
  host.appendChild(box);
  setTimeout(() => box.remove(), 3500);
}
