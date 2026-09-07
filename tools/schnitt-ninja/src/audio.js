/* Komplett synthetisierter Sound ueber WebAudio – keine Dateien, kein Nachladen.
   Der Kontext wird beim ersten Touch entsperrt (iOS-Anforderung). */

let ctx = null;
let master = null;
let enabled = true;
let noiseBuf = null;

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  } catch (err) {
    ctx = null;
  }
  return ctx;
}

function noise() {
  if (noiseBuf) return noiseBuf;
  const len = Math.floor(ctx.sampleRate * 0.5);
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

function ok() {
  return enabled && ensure() && ctx.state !== 'suspended';
}

/** Beim ersten Pointer-Event aufrufen. */
export function unlock() {
  const c = ensure();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => {});
  // stummer Ton, damit iOS den Kontext wirklich freigibt
  try {
    const o = c.createOscillator();
    const g = c.createGain();
    g.gain.value = 0.0001;
    o.connect(g).connect(master);
    o.start();
    o.stop(c.currentTime + 0.02);
  } catch (err) {
    /* ignorieren */
  }
}

export function setEnabled(on) {
  enabled = !!on;
  if (master) master.gain.value = enabled ? 0.5 : 0;
}

export function isEnabled() {
  return enabled;
}

function tone({ freq = 440, to = null, type = 'sine', dur = 0.15, gain = 0.25, delay = 0, attack = 0.005 }) {
  if (!ok()) return;
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noiseBurst({ dur = 0.2, gain = 0.3, delay = 0, type = 'bandpass', freq = 1200, q = 1, sweepTo = null }) {
  if (!ok()) return;
  const t0 = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noise();
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t0);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(60, sweepTo), t0 + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

/* ---------- Effekte ---------- */

export const sfx = {
  /** kurzes Wischen der Klinge */
  swish() {
    noiseBurst({ dur: 0.13, gain: 0.16, freq: 3000, sweepTo: 700, q: 0.8 });
  },
  /** Treffer auf ein richtiges Item; step hebt die Tonhoehe im Combo */
  pop(step = 0) {
    const base = 520 * Math.pow(1.09, Math.min(step, 8));
    tone({ freq: base, to: base * 1.9, type: 'triangle', dur: 0.12, gain: 0.3 });
    noiseBurst({ dur: 0.08, gain: 0.1, freq: 2200, q: 0.7 });
  },
  /** falscher Schnitt: tiefes, trockenes Bums */
  wrong() {
    tone({ freq: 180, to: 60, type: 'sawtooth', dur: 0.32, gain: 0.28 });
    noiseBurst({ dur: 0.2, gain: 0.18, type: 'lowpass', freq: 500 });
  },
  explosion() {
    noiseBurst({ dur: 0.55, gain: 0.42, type: 'lowpass', freq: 1400, sweepTo: 120 });
    tone({ freq: 90, to: 35, type: 'square', dur: 0.4, gain: 0.25 });
  },
  /** Multiplikator steigt: zwei aufsteigende Toene */
  multUp() {
    tone({ freq: 660, type: 'sine', dur: 0.12, gain: 0.22 });
    tone({ freq: 990, type: 'sine', dur: 0.16, gain: 0.22, delay: 0.1 });
  },
  multDown() {
    tone({ freq: 420, to: 220, type: 'sine', dur: 0.22, gain: 0.16 });
  },
  waveWarn() {
    tone({ freq: 220, to: 880, type: 'sawtooth', dur: 0.8, gain: 0.16 });
  },
  goldenCut() {
    [880, 1320, 1760].forEach((f, i) => tone({ freq: f, type: 'sine', dur: 0.25, gain: 0.2, delay: i * 0.07 }));
    noiseBurst({ dur: 0.4, gain: 0.08, freq: 6000, q: 2 });
  },
  frenzyStart() {
    [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, type: 'triangle', dur: 0.2, gain: 0.2, delay: i * 0.06 }));
  },
  sparkle() {
    const f = 1400 + Math.random() * 1600;
    tone({ freq: f, to: f * 1.6, type: 'sine', dur: 0.08, gain: 0.07 });
  },
  /** leiser Tick in den letzten Sekunden */
  tick(last = false) {
    tone({ freq: last ? 1200 : 900, type: 'square', dur: 0.05, gain: last ? 0.18 : 0.1 });
  },
  countdown(step) {
    if (step > 0) tone({ freq: 440, type: 'square', dur: 0.12, gain: 0.2 });
    else tone({ freq: 880, to: 1320, type: 'square', dur: 0.3, gain: 0.24 });
  },
  loseLife() {
    tone({ freq: 300, to: 120, type: 'triangle', dur: 0.45, gain: 0.25 });
  },
  record() {
    [523, 659, 784, 1047, 1319].forEach((f, i) =>
      tone({ freq: f, type: 'triangle', dur: 0.3, gain: 0.22, delay: i * 0.11 }));
  },
  gameOver() {
    [440, 370, 294, 220].forEach((f, i) => tone({ freq: f, type: 'sine', dur: 0.35, gain: 0.2, delay: i * 0.14 }));
  },
};
