/* Spielschleife: Spawning, Physik, Schnitt-Erkennung, Punkte, Regelwechsel, Wellen. */

import {
  W, H, GRAVITY, Item, Piece, Particle, Pool,
  circlePoly, shapePoly, clipHalf, chordPoints, polyArea, polyCentroid, segCircleHit, rotate,
} from './entities.js';
import * as R from './render.js';
import { sfx } from './audio.js';
import { S } from './i18n.js';
import * as Rules from './rules.js';
import { getSettings } from './storage.js';

const MIN_CUT_SPEED = 280;      // darunter zaehlt es als Tippen, nicht als Wischen
const FREEZE_TIME = 0.85;       // Lernmoment beim falschen Schnitt
const MAX_RECUTS = 2;

export const reducedMotion = window.matchMedia
  ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
  : false;

/* ---------------- Hilfsfunktionen ---------------- */

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rnd() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function lighten(hex, amount) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return 'rgba(255,255,255,0.8)';
  const mix = (c) => Math.round(parseInt(c, 16) + (255 - parseInt(c, 16)) * amount);
  return `rgb(${mix(m[1])},${mix(m[2])},${mix(m[3])})`;
}

function darken(hex, amount) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return 'rgba(0,0,0,0.5)';
  const mix = (c) => Math.round(parseInt(c, 16) * (1 - amount));
  return `rgb(${mix(m[1])},${mix(m[2])},${mix(m[3])})`;
}

function vibrate(ms) {
  if (!getSettings().haptics) return;
  if (navigator.vibrate) {
    try { navigator.vibrate(ms); } catch (err) { /* egal */ }
  }
}

/** Teilt ein Item exakt entlang der Wischlinie in zwei Polygone.
    `world` liefert Pools und Zufall – so nutzen Spiel und Tutorial denselben Code. */
export function sliceInto(world, item, seg) {
  const toLocal = (p) => rotate({ x: p.x - item.x, y: p.y - item.y }, -item.angle);
  let a = toLocal(seg.a);
  let b = toLocal(seg.b);
  let side1 = clipHalf(item.poly, a, b, 1);
  let side2 = clipHalf(item.poly, a, b, -1);

  // Beruehrt die Gerade das Polygon nicht (z. B. Sternzacke), durch die Mitte schneiden
  if (side1.length < 3 || side2.length < 3) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    a = { x: -dx, y: -dy };
    b = { x: dx, y: dy };
    side1 = clipHalf(item.poly, a, b, 1);
    side2 = clipHalf(item.poly, a, b, -1);
    if (side1.length < 3 || side2.length < 3) return;
  }

  const chord = chordPoints(item.poly, a, b);
  const dir = { x: b.x - a.x, y: b.y - a.y };
  const len = Math.hypot(dir.x, dir.y) || 1;
  const nLocal = { x: -dir.y / len, y: dir.x / len };
  const nWorld = rotate(nLocal, item.angle);

  const area1 = polyArea(side1);
  const area2 = polyArea(side2);
  const total = area1 + area2 || 1;

  // Schwung des Fingers teilweise uebernehmen (Schnitt-Traegheit)
  const swipe = {
    x: (seg.b.x - seg.a.x) / (Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y) || 1),
    y: (seg.b.y - seg.a.y) / (Math.hypot(seg.b.x - seg.a.x, seg.b.y - seg.a.y) || 1),
  };
  const swipePush = Math.min(seg.speed, 2600) * 0.06;

  const build = (poly, sign, area) => {
    const c = polyCentroid(poly);
    const rel = poly.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
    const smallness = 1 - area / total;                  // kleines Stueck fliegt schneller
    const push = 60 + 90 * smallness;
    const piece = world.pieces.obtain();
    piece.init(
      rel,
      c,
      item,
      item.vx + nWorld.x * push * sign + swipe.x * swipePush,
      item.vy + nWorld.y * push * sign + swipe.y * swipePush,
      item.va + (2 + world.rnd() * 2) * sign,
    );
  };
  build(side1, 1, area1);
  build(side2, -1, area2);

  // Saft entlang der Schnittkante
  if (chord.length >= 2) {
    const p1 = rotate(chord[0], item.angle);
    const p2 = rotate(chord[1], item.angle);
    const count = reducedMotion ? 5 : 12 + Math.floor(world.rnd() * 8);
    for (let i = 0; i < count; i++) {
      const t = world.rnd();
      const px = item.x + p1.x + (p2.x - p1.x) * t;
      const py = item.y + p1.y + (p2.y - p1.y) * t;
      const s = world.rnd() < 0.5 ? 1 : -1;
      const sp = 90 + world.rnd() * 220;
      world.particles.obtain().init(
        px, py,
        nWorld.x * sp * s + swipe.x * swipePush * 1.4 + (world.rnd() - 0.5) * 60,
        nWorld.y * sp * s + swipe.y * swipePush * 1.4 + (world.rnd() - 0.5) * 60,
        item.flesh || item.color,
        3 + world.rnd() * 4,
        0.35 + world.rnd() * 0.3,
      );
    }
  }
  if (!reducedMotion) {
    world.splats.push({
      x: item.x, y: item.y, r: 26 + world.rnd() * 22, rot: world.rnd() * Math.PI,
      color: item.color, life: 1.5, maxLife: 1.5,
    });
    if (world.splats.length > 24) world.splats.shift();
  }

}

/* ---------------- Spiel ---------------- */

export class Game {
  constructor(ctx, input, ui) {
    this.ctx = ctx;
    this.input = input;
    this.ui = ui;
    this.pieces = new Pool(Piece, 40);
    this.particles = new Pool(Particle, 220);
    this.items = [];
    this.splats = [];
    this.floats = [];
    this.pending = [];
    this.running = false;
    this.over = true;
  }

  /* ---------- Start ---------- */

  start(cfg) {
    this.cfg = cfg;
    this.rnd = cfg.seed != null ? mulberry32(hashString(String(cfg.seed))) : Math.random;

    this.items.length = 0;
    this.splats.length = 0;
    this.floats.length = 0;
    this.pending.length = 0;
    this.pieces.clear();
    this.particles.clear();
    this.input.reset();

    this.score = 0;
    this.lives = 3;
    this.streak = 0;
    this.mult = 1;
    this.correct = 0;
    this.wrong = 0;
    this.bestStreak = 0;
    this.elapsed = 0;
    this.timed = cfg.mode !== 'free';
    this.timeLeft = this.timed ? cfg.seconds : Infinity;
    this.spawnTimer = 0.6;
    this.spawnPause = 0;
    this.waveCount = 0;
    this.lastValue = null;
    this.trapSwap = false;
    this.frenzy = 0;
    this.x2 = 0;
    this.lastFrenzy = -60;
    this.volleyIndex = 0;
    this.comboSwipe = -1;
    this.comboCount = 0;
    this.hitFlash = 0;
    this.shake = 0;
    this.reasonItem = null;
    this.sparkleT = 0;
    this.lastTickSecond = -1;
    this.pendingEnd = null;
    this.ruleCardUp = false;
    this.over = false;
    this.running = true;
    this.countdown = 3.4;

    // Regel aufsetzen
    this.rule = null;
    this.switchTimes = [];
    if (cfg.mode === 'numbers') {
      this.rule = cfg.ruleChoice === 'random'
        ? Rules.randomNumberRule(cfg.min, cfg.max, null)
        : Rules.makeNumberRule(cfg.ruleChoice, cfg.min, cfg.max,
            cfg.threshold != null ? cfg.threshold : Rules.pickThreshold(cfg.min, cfg.max));
      this.factor = Rules.numbersFactor(cfg.min, cfg.max, cfg.ruleChoice);
      if (cfg.ruleChoice === 'random') this.switchTimes = this._switchSchedule();
    } else if (cfg.mode === 'shapes') {
      this.rule = cfg.shapeChoice === 'random'
        ? Rules.randomShapeRule(cfg.shapeCount, null)
        : Rules.makeShapeRule(cfg.shapeTargets);
      this.factor = Rules.shapesFactor(cfg.shapeCount);
      if (cfg.shapeChoice === 'random') this.switchTimes = this._switchSchedule();
    } else {
      this.factor = 1;
    }
    this.warned = new Set();

    // Wellen (Briefing §5): angekuendigte Bursts statt Zufallsspitzen
    if (cfg.mode === 'free') {
      this.waveTimes = [45, 90, 150, 195, 240, 285, 330, 375];
    } else {
      const k = cfg.seconds / 90;
      this.waveTimes = [Math.round(40 * k), Math.round(70 * k)];
    }
    this.waveWarned = new Set();
    this.waveDone = new Set();

    this.ui.setBanner(this._bannerHtml(), false);
    this.ui.setHud(this._hud());
    this.ui.showCenter('3', this._bannerText(), { big: true });
  }

  _switchSchedule() {
    const times = [];
    for (let t = 30; t < this.cfg.seconds - 5; t += 30) times.push(t);
    return times;
  }

  _bannerText() {
    if (this.rule) return this.rule.banner;
    return this.cfg.bombs ? S.cutEverything : S.cutEverythingNoBombs;
  }

  /** Wie _bannerText, aber der operative Teil der Regel ist hervorgehoben. */
  _bannerHtml() {
    if (this.rule) return `${S.cutOnlyPrefix.replace('…', '')} <b>${this.rule.short}</b>`;
    return this._bannerText();
  }

  _hud() {
    return {
      score: this.score,
      mult: this.mult,
      lives: this.lives,
      timed: this.timed,
      timeLeft: this.timeLeft,
      seconds: this.cfg.seconds,
      frenzy: this.frenzy,
      x2: this.x2,
    };
  }

  /* ---------- Hauptschleife ---------- */

  update(dt, now) {
    if (this.over) return;

    if (this.countdown > 0) {
      const before = Math.ceil(this.countdown - 0.4);
      this.countdown -= dt;
      const after = Math.ceil(this.countdown - 0.4);
      if (after !== before) {
        if (after > 0) {
          this.ui.showCenter(String(after), this._bannerText(), { big: true });
          sfx.countdown(after);
        } else if (after === 0) {
          this.ui.showCenter('Los!', '', { big: false });
          sfx.countdown(0);
        }
      }
      if (this.countdown <= 0) this.ui.hideCenter();
      this._updateVisuals(dt, now);
      return;
    }

    // Nach dem letzten Leben laeuft das Spiel kurz weiter, damit der
    // Lernmoment (rote Begruendung) noch gelesen werden kann.
    if (this.pendingEnd != null) {
      this.pendingEnd -= dt;
      this._updateItems(dt);
      this._updateVisuals(dt, now);
      if (this.pendingEnd <= 0) this.finish('lives');
      return;
    }

    this.elapsed += dt;
    if (this.timed) {
      this.timeLeft = Math.max(0, this.timeLeft - dt);
      const sec = Math.ceil(this.timeLeft);
      if (sec <= 5 && sec !== this.lastTickSecond) {
        this.lastTickSecond = sec;
        if (sec > 0) sfx.tick(sec <= 3);
      }
      if (this.timeLeft <= 0) {
        this.finish('time');
        return;
      }
    }

    this._handleRuleSwitch();
    this._handleWaves();

    if (this.frenzy > 0) {
      this.frenzy = Math.max(0, this.frenzy - dt);
      this.sparkleT -= dt;
      if (this.sparkleT <= 0) {
        this.sparkleT = 0.22;
        sfx.sparkle();
      }
    }
    if (this.x2 > 0) this.x2 = Math.max(0, this.x2 - dt);

    // verzoegerte Einzel-Spawns einer Welle
    for (let i = this.pending.length - 1; i >= 0; i--) {
      this.pending[i].t -= dt;
      if (this.pending[i].t <= 0) {
        this.pending[i].fn();
        this.pending.splice(i, 1);
      }
    }

    if (this.spawnPause > 0) {
      this.spawnPause -= dt;
      if (this.spawnPause <= 0 && this.ruleCardUp) {
        this.ruleCardUp = false;
        this.ui.hideCenter();
      }
    } else {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnWave();
        this.spawnTimer = this._spawnInterval();
      }
    }

    this._updateItems(dt);
    this._updateVisuals(dt, now);
    this.ui.setHud(this._hud());
  }

  _updateItems(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.update(dt);
      if (it.check > 0) it.check -= dt;
      if (it.dead) {
        // verpasstes Ziel: kein Leben, aber der Multiplikator faellt zurueck
        if (!it.cut && it.isTarget && this.cfg.mode !== 'free'
            && this.spawnPause <= 0 && this.frenzy <= 0) {
          this._resetMultiplier(true);
          this._float(it.x, H - 60, S.missed, '#9aa6c7', 20);
        }
        if (this.reasonItem === it) this.reasonItem = null;
        this.items.splice(i, 1);
      }
    }
  }

  _updateVisuals(dt, now) {
    this.pieces.forEachActive((p) => p.update(dt));
    this.particles.forEachActive((p) => p.update(dt));
    for (let i = this.splats.length - 1; i >= 0; i--) {
      this.splats[i].life -= dt;
      if (this.splats[i].life <= 0) this.splats.splice(i, 1);
    }
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.y += f.vy * dt;
      f.life -= dt;
      if (f.life <= 0) this.floats.splice(i, 1);
    }
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 3);
    this.input.prune(now);
  }

  /* ---------- Regelwechsel ---------- */

  _handleRuleSwitch() {
    for (const t of this.switchTimes) {
      const warnKey = `w${t}`;
      if (!this.warned.has(warnKey) && this.elapsed >= t - 3) {
        this.warned.add(warnKey);
        this.ui.setBanner(this._bannerHtml(), true);
        this.ui.showCenter(S.ruleSoon, null, { warn: true, small: true, high: true, sticky: true });
      }
      const doneKey = `d${t}`;
      if (!this.warned.has(doneKey) && this.elapsed >= t) {
        this.warned.add(doneKey);
        this._switchRule();
      }
    }
  }

  _switchRule() {
    // Alles in der Luft verschwindet folgenlos – niemand wird nach einer
    // Regel bewertet, die er noch nicht gesehen hat.
    this.items.length = 0;
    this.pending.length = 0;
    this.spawnPause = 2.4;
    this.spawnTimer = 0;
    this.rule = this.cfg.mode === 'numbers'
      ? Rules.randomNumberRule(this.cfg.min, this.cfg.max, this.rule)
      : Rules.randomShapeRule(this.cfg.shapeCount, this.rule);
    this.ui.setBanner(this._bannerHtml(), false);
    this.ruleCardUp = true;
    this.ui.showCenter(this.rule.short, S.cutOnlyPrefix, {
      kicker: S.ruleNew, card: true, dim: true, sticky: true,
    });
    sfx.multUp();
  }

  /* ---------- Wellen ---------- */

  _handleWaves() {
    for (const t of this.waveTimes) {
      if (!this.waveWarned.has(t) && this.elapsed >= t - 1) {
        this.waveWarned.add(t);
        this.ui.showCenter(S.wave, '', { duration: 1.2, warn: true });
        sfx.waveWarn();
      }
      if (!this.waveDone.has(t) && this.elapsed >= t) {
        this.waveDone.add(t);
        // Als Fächer statt als Zufallsklumpen: bleibt intensiv, ist aber lesbar
        // und damit schneidbar. Ziel-/Nichtziel-Mischung bleibt – die Welle ist
        // ein Regeltest, kein Geschenk.
        if (this.spawnPause <= 0) {
          this._spawnVolley(6 + Math.floor(this.rnd() * 2), { formation: 'fan', burst: true });
        }
      }
    }
  }

  /* ---------- Spawning ---------- */

  _progress() {
    const span = this.cfg.mode === 'free' ? 80 : 110;
    return Math.min(1, this.elapsed / span);
  }

  _spawnInterval() {
    // Im Rausch kommen Salven statt eines Dauerregens – seltener, dafür
    // gleichzeitig und auf einer Linie, damit ein Wisch alle mitnimmt.
    if (this.frenzy > 0) return 0.85;
    const p = this._progress();
    return 1.6 - 0.9 * p;
  }

  _waveSize() {
    const p = this._progress();
    const min = 1 + Math.round(p * 2);
    const max = 2 + Math.round(p * 3);
    return min + Math.floor(this.rnd() * (max - min + 1));
  }

  spawnWave(sizeOverride, opts = {}) {
    if (this.frenzy > 0) {
      // abwechselnd waagerechte Reihe und Fächer – ein Wisch, eine dicke Combo
      const formation = this.volleyIndex++ % 2 ? 'fan' : 'row';
      this._spawnVolley(4, { formation, frenzy: true });
      return;
    }
    const n = sizeOverride || this._waveSize();
    this.waveCount++;
    const trap = this.cfg.mode === 'shapes' && this.elapsed > 30 && this.waveCount % 4 === 0;
    if (trap) this.trapSwap = !this.trapSwap;
    const trapColors = trap ? this._trapColors() : null;

    // Ziel-/Nichtziel-Mischung: anfangs leicht zugunsten der Ziele
    const targetRatio = this.frenzy > 0 ? 1 : (this.elapsed < 20 ? 0.65 : 0.5);
    const flags = [];
    for (let i = 0; i < n; i++) flags.push(this.rnd() < targetRatio);
    if (this.cfg.mode !== 'free' && !flags.includes(true)) flags[Math.floor(this.rnd() * n)] = true;

    let bombUsed = false;
    for (let i = 0; i < n; i++) {
      const isTarget = flags[i];
      const delay = opts.burst ? this.rnd() * 0.35 : this.rnd() * 0.28;
      this.pending.push({
        t: delay,
        fn: () => {
          // Erst hier entscheiden, nicht beim Einplanen: zwischen Planung und
          // Ausführung liegen bis zu 0,35 s – in denen der Rausch starten kann.
          const item = this._makeItem(this.frenzy > 0 ? true : isTarget, {
            trapColors,
            allowBomb: !opts.burst && !bombUsed && this.frenzy <= 0,
          });
          if (!item) return;
          if (item.kind === 'bomb') bombUsed = true;
          this.items.push(item);
        },
      });
    }
  }

  /** Salve: alle Items entstehen im selben Frame, gleichmäßig über die Breite
      verteilt und auf einer gemeinsamen Linie – dadurch nimmt ein einziger
      Wisch sie mit, statt dass der Zufall über jede Combo entscheidet.
      `row` = gleicher Scheitelpunkt (waagerechte Reihe),
      `fan` = gestaffelter Scheitelpunkt (diagonale Linie). */
  _spawnVolley(n, opts = {}) {
    this.waveCount++;
    const trap = this.cfg.mode === 'shapes' && this.elapsed > 30 && this.waveCount % 4 === 0;
    if (trap) this.trapSwap = !this.trapSwap;
    const trapColors = trap ? this._trapColors() : null;

    const allTargets = opts.frenzy || this.frenzy > 0;
    const targetRatio = allTargets ? 1 : (this.elapsed < 20 ? 0.65 : 0.5);
    const flags = [];
    for (let i = 0; i < n; i++) flags.push(this.rnd() < targetRatio);
    if (this.cfg.mode !== 'free' && !flags.includes(true)) flags[Math.floor(this.rnd() * n)] = true;

    // Vier Items fuellen die Breite fast aus – der Versatz bleibt klein,
    // damit sich Nachbarn nicht ueberlappen.
    const margin = 38;
    const lane = (W - 2 * margin) / n;
    const leftToRight = this.rnd() < 0.5;
    for (let i = 0; i < n; i++) {
      const slot = leftToRight ? i : n - 1 - i;
      const x = margin + (slot + 0.5) * lane + (this.rnd() - 0.5) * 10;
      const apex = opts.formation === 'fan'
        ? 180 + (i / Math.max(1, n - 1)) * 140
        : 230;
      const item = this._makeItem(flags[i], {
        trapColors,
        allowBomb: false,                 // in Salven nie Bomben
        launch: { x, apex, vx: (this.rnd() - 0.5) * 80 },
      });
      if (item) this.items.push(item);
    }
  }

  _trapColors() {
    const a = R.PALETTE[Math.floor(this.rnd() * R.PALETTE.length)];
    let b = a;
    while (b === a) b = R.PALETTE[Math.floor(this.rnd() * R.PALETTE.length)];
    return this.trapSwap ? { target: a, other: b } : { target: b, other: a };
  }

  /** `over` erlaubt Salven, Startpunkt, Scheitelhöhe und Drift vorzugeben,
      damit Reihe und Fächer denselben Startpfad benutzen. */
  _launch(r, over) {
    const p = this._progress();
    const x = over && over.x != null ? over.x : 40 + this.rnd() * (W - 80);
    const apex = over && over.apex != null ? over.apex : 150 + this.rnd() * 250;
    let vy = -Math.sqrt(2 * GRAVITY * Math.max(120, H - apex));
    if (!over) vy *= 1 + 0.1 * p;         // Salven bleiben bewusst gleichmäßig
    const tUp = -vy / GRAVITY;
    let vx;
    if (over && over.vx != null) {
      vx = over.vx;
    } else {
      const targetX = 60 + this.rnd() * (W - 120);
      vx = ((targetX - x) / tUp) * (1 + 0.25 * p);
    }
    return {
      x,
      y: H + r + 10,
      vx: Math.max(-260, Math.min(260, vx)),
      vy,
      angle: this.rnd() * Math.PI * 2,
      va: (this.rnd() - 0.5) * 5,
    };
  }

  _makeItem(isTarget, opts) {
    const mode = this.cfg.mode;
    const over = opts.launch || null;
    const special = this._maybeSpecial(isTarget, mode, over);
    if (special) return special;

    if (mode === 'numbers') {
      const value = this._pickNumber(isTarget);
      if (value == null) return null;
      const r = 40;
      const color = R.PALETTE[Math.floor(this.rnd() * R.PALETTE.length)];
      return new Item(Object.assign({
        kind: 'number', value, r, poly: circlePoly(r, 32),
        color, edge: darken(color, 0.35), flesh: lighten(color, 0.6),
        isTarget,
      }, this._launch(r, over)));
    }

    if (mode === 'shapes') {
      const shape = this._pickShape(isTarget);
      const r = 40;
      let color;
      if (opts.trapColors) color = isTarget ? opts.trapColors.target : opts.trapColors.other;
      else color = R.PALETTE[Math.floor(this.rnd() * R.PALETTE.length)];
      const item = new Item(Object.assign({
        kind: 'shape', shape, r, poly: shapePoly(shape, r),
        color, edge: darken(color, 0.35), flesh: lighten(color, 0.6),
        isTarget,
      }, this._launch(r, over)));
      return item;
    }

    // Freies Spiel
    const bombChance = this.cfg.bombs && opts.allowBomb
      ? Math.min(0.17, 0.05 + this.elapsed / 900)
      : 0;
    if (this.rnd() < bombChance) {
      const r = 36;
      return new Item(Object.assign({
        kind: 'bomb', emoji: '💣', r, poly: circlePoly(r, 24),
        color: '#333333', flesh: '#555', isTarget: false,
      }, this._launch(r, over)));
    }
    const fruit = R.FRUITS[Math.floor(this.rnd() * R.FRUITS.length)];
    const r = 38;
    return new Item(Object.assign({
      kind: 'fruit', emoji: fruit.emoji, r, poly: circlePoly(r, 28),
      color: fruit.color, flesh: lighten(fruit.color, 0.55), isTarget: true,
    }, this._launch(r, over)));
  }

  /** Goldene Frucht, Sternfrucht-Rausch und ×2 (in den Regelmodi nur der Rausch). */
  _maybeSpecial(isTarget, mode, over) {
    if (this.frenzy > 0) return null;
    const canFrenzy = this.elapsed - this.lastFrenzy > 45;
    if (canFrenzy && this.rnd() < (mode === 'free' ? 0.025 : 0.02)) {
      this.lastFrenzy = this.elapsed;
      const r = 36;
      // Im Formen-Modus waere ein Stern-Emoji mit der Zielform "Stern" verwechselbar.
      const emoji = mode === 'shapes' ? '⚡' : '⭐';
      return new Item(Object.assign({
        kind: 'frenzy', emoji, r, poly: circlePoly(r, 24),
        color: '#ffd166', flesh: '#fff3c4', isTarget: true, glow: 1,
      }, this._launch(r, over)));
    }
    if (mode !== 'free') return null;
    if (this.rnd() < 0.04) {
      const r = 34;
      const l = this._launch(r, over);
      l.vy *= 0.86;              // fliegt flacher und schneller
      l.vx *= 1.5;
      return new Item(Object.assign({
        kind: 'golden', emoji: '🍋', r, poly: circlePoly(r, 24),
        color: '#ffe066', flesh: '#fff8d6', isTarget: true, glow: 1,
      }, l));
    }
    if (this.rnd() < 0.02) {
      const r = 34;
      return new Item(Object.assign({
        kind: 'x2', r, poly: circlePoly(r, 28),
        color: '#7b2cbf', flesh: '#e0aaff', isTarget: true, glow: 0,
      }, this._launch(r, over)));
    }
    return null;
  }

  _pickNumber(isTarget) {
    const { min, max } = this.cfg;
    const cands = [];
    for (let v = min; v <= max; v++) {
      if (this.rule.test(v) === isTarget && v !== this.lastValue) cands.push(v);
    }
    if (!cands.length) {
      for (let v = min; v <= max; v++) if (this.rule.test(v) === isTarget) cands.push(v);
    }
    if (!cands.length) return null;
    const v = cands[Math.floor(this.rnd() * cands.length)];
    this.lastValue = v;
    return v;
  }

  _pickShape(isTarget) {
    const pool = Rules.SHAPES.filter((s) => this.rule.test(s) === isTarget);
    if (!pool.length) return Rules.SHAPES[0];
    return pool[Math.floor(this.rnd() * pool.length)];
  }

  /* ---------- Schnitt ---------- */

  processSegments(segments) {
    if (this.over || this.countdown > 0) return;
    for (const seg of segments) {
      if (seg.speed < MIN_CUT_SPEED) continue;
      let hitSomething = false;
      for (let i = this.items.length - 1; i >= 0; i--) {
        const it = this.items[i];
        if (it.cut || it.frozen > 0) continue;
        if (segCircleHit(seg.a, seg.b, it.x, it.y, it.r * 0.95)) {
          this._sliceItem(it, seg);
          hitSomething = true;
        }
      }
      this.pieces.forEachActive((p) => {
        // frisch entstandene Stuecke ueberspringen: sonst zerlegt ein einziger
        // Wischer das Item im selben Frame in viele Splitter
        if (p.cuts >= MAX_RECUTS || p.life < 0.3 || p.life > 1.45) return;
        if (segCircleHit(seg.a, seg.b, p.x, p.y, 26)) {
          this._slicePiece(p, seg);
          hitSomething = true;
        }
      });
      if (hitSomething) this.hitFlash = 0.1;
    }
  }

  _sliceItem(item, seg) {
    item.cut = true;
    const wrong = this.cfg.mode === 'free'
      ? item.kind === 'bomb'
      : !item.isTarget;

    if (wrong) {
      if (this.frenzy > 0) {
        // Im Rausch gibt es keine Strafen. Sollte doch ein Nachzuegler getroffen
        // werden, zerteilt er sich harmlos – ohne Punkte, aber sichtbar. Vorher
        // passierte gar nichts, was sich wie ein haengender Treffer anfuehlte.
        this._split(item, seg);
        item.dead = true;
        sfx.swish();
        return;
      }
      this._wrongCut(item);
      return;
    }

    this._split(item, seg);
    item.dead = true;
    sfx.swish();
    vibrate(15);

    // Combo: alle Treffer eines durchgehenden Wischers zaehlen zusammen
    if (seg.swipeId !== this.comboSwipe) {
      this.comboSwipe = seg.swipeId;
      this.comboCount = 0;
    }
    this.comboCount++;

    this.correct++;
    this.streak++;
    if (this.streak > this.bestStreak) this.bestStreak = this.streak;
    this._updateMultiplier();

    let base = 10 * this.factor;
    if (item.kind === 'golden') base = 50 * this.factor;
    const comboBonus = this.comboCount > 1 ? 5 * this.factor : 0;
    const pts = Math.round((base + comboBonus) * this.mult * (this.x2 > 0 ? 2 : 1));
    this.score += pts;

    this._float(item.x, item.y, `+${pts}`, item.kind === 'golden' ? '#ffd166' : '#ffffff', 24);
    if (this.comboCount >= 2) {
      this._float(item.x, item.y - 34, S.combo(this.comboCount), '#4cc9f0', 20);
    }
    sfx.pop(this.comboCount - 1);

    if (item.kind === 'golden') {
      sfx.goldenCut();
      this._float(item.x, item.y - 60, S.golden, '#ffd166', 20);
    } else if (item.kind === 'frenzy') {
      this._startFrenzy();
    } else if (item.kind === 'x2') {
      this.x2 = 10;
      this.ui.showCenter(S.doublePoints, '', { duration: 1.2, warn: true });
      sfx.multUp();
    }
    if (this.cfg.mode !== 'free') item.check = 0.4;
  }

  /** Der Rausch soll ein reiner Punkte-Ausbruch sein: ab hier ist garantiert
      nichts Verbotenes mehr auf dem Feld – weder in der Luft noch eingeplant. */
  _startFrenzy() {
    this.frenzy = 5;
    this.lastFrenzy = this.elapsed;
    this.volleyIndex = 0;

    // bereits eingeplante Mischwellen verwerfen
    this.pending.length = 0;

    // und den Luftraum folgenlos raeumen
    for (const it of this.items) {
      const forbidden = this.cfg.mode === 'free' ? it.kind === 'bomb' : !it.isTarget;
      if (forbidden && !it.cut) {
        it.dead = true;
        this._burst(it.x, it.y, it.color, 8);
      }
    }
    this.items = this.items.filter((it) => !it.dead);

    this.spawnTimer = 0.15;               // erste Salve kommt sofort
    sfx.frenzyStart();
    this.ui.showCenter(S.frenzy, '', { duration: 1.2, warn: true });
  }

  _wrongCut(item) {
    if (this.frenzy > 0) return;      // im Rausch gibt es keine Strafen
    this.wrong++;
    this.lives--;
    item.frozen = FREEZE_TIME;
    item.vx = 0;
    item.vy = 0;
    item.va = 0;

    // immer nur die zuletzt gecuttete Begruendung zeigen
    if (this.reasonItem && this.reasonItem !== item) this.reasonItem.reason = null;
    if (item.kind === 'bomb') item.reason = S.thatIsABomb;
    else if (this.cfg.mode === 'numbers') item.reason = this.rule.reason(item.value);
    else if (this.cfg.mode === 'shapes') item.reason = this.rule.reason(item.shape);
    this.reasonItem = item;

    if (this.timed) this.timeLeft = Math.max(0, this.timeLeft - 5);
    this._resetMultiplier(false);

    if (item.kind === 'bomb') {
      sfx.explosion();
      this._burst(item.x, item.y, '#ff9f1c', 24);
    } else {
      sfx.wrong();
    }
    sfx.loseLife();
    vibrate([40, 60, 60]);
    if (!reducedMotion) this.shake = 1;
    this.ui.flashDamage();

    // kurz stehen lassen, damit die Begruendung noch lesbar ist
    if (this.lives <= 0) this.pendingEnd = 0.9;
  }

  _updateMultiplier() {
    const next = this.streak >= 30 ? 4 : this.streak >= 20 ? 3 : this.streak >= 10 ? 2 : 1;
    if (next !== this.mult) {
      this.mult = next;
      sfx.multUp();
      this.ui.bumpMultiplier();
    }
  }

  _resetMultiplier(missedOnly) {
    if (missedOnly && this.cfg.mode === 'free') return;   // im freien Spiel kostet Verpassen nichts
    this.streak = 0;
    if (this.mult !== 1) {
      this.mult = 1;
      sfx.multDown();
    }
  }

  /** Teilt das Item exakt entlang der Wischlinie in zwei Polygone. */
  _split(item, seg) {
    sliceInto(this, item, seg);
  }

  _slicePiece(piece, seg) {
    const toLocal = (p) => rotate({ x: p.x - piece.x, y: p.y - piece.y }, -piece.angle);
    const a = toLocal(seg.a);
    const b = toLocal(seg.b);
    const s1 = clipHalf(piece.poly, a, b, 1);
    const s2 = clipHalf(piece.poly, a, b, -1);
    if (s1.length < 3 || s2.length < 3) return;
    const dir = { x: b.x - a.x, y: b.y - a.y };
    const len = Math.hypot(dir.x, dir.y) || 1;
    const nWorld = rotate({ x: -dir.y / len, y: dir.x / len }, piece.angle);
    const parent = piece;
    piece.active = false;
    const mk = (poly, sign) => {
      const c = polyCentroid(poly);
      const rel = poly.map((p) => ({ x: p.x - c.x, y: p.y - c.y }));
      const np = this.pieces.obtain();
      np.poly = rel;
      np.off = { x: parent.off.x + c.x, y: parent.off.y + c.y };
      np.visual = parent.visual;
      const w = rotate(c, parent.angle);
      np.x = parent.x + w.x;
      np.y = parent.y + w.y;
      np.vx = parent.vx + nWorld.x * 70 * sign;
      np.vy = parent.vy + nWorld.y * 70 * sign;
      np.angle = parent.angle;
      np.va = parent.va + 2 * sign;
      np.life = Math.min(parent.life, 1.1);
      np.cuts = parent.cuts + 1;
      np.active = true;
    };
    mk(s1, 1);
    mk(s2, -1);
    sfx.swish();
  }

  _burst(x, y, color, n) {
    const count = reducedMotion ? Math.round(n / 3) : n;
    for (let i = 0; i < count; i++) {
      const a = this.rnd() * Math.PI * 2;
      const sp = 120 + this.rnd() * 320;
      this.particles.obtain().init(
        x, y, Math.cos(a) * sp, Math.sin(a) * sp, color, 3 + this.rnd() * 5, 0.4 + this.rnd() * 0.4,
      );
    }
  }

  _float(x, y, text, color, size) {
    this.floats.push({ x, y, text, color, size, vy: -60, life: 0.9, maxLife: 0.9 });
    if (this.floats.length > 14) this.floats.shift();
  }

  /* ---------- Ende ---------- */

  finish(reason) {
    if (this.over) return;
    this.over = true;
    this.running = false;
    if (reason !== 'quit') sfx.gameOver();
    this.ui.hideCenter();
    this.ui.gameOver({
      mode: this.cfg.mode,
      daily: !!this.cfg.daily,
      score: this.score,
      correct: this.correct,
      wrong: this.wrong,
      bestStreak: this.bestStreak,
      reason,
      cfg: this.cfg,
    });
  }

  /* ---------- Zeichnen ---------- */

  draw(now) {
    const ctx = this.ctx;
    ctx.save();
    if (this.shake > 0) {
      const s = this.shake * 8;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }
    R.drawBackground(ctx);
    R.drawSplats(ctx, this.splats);

    if (this.frenzy > 0) {
      ctx.save();
      ctx.globalAlpha = 0.12 + 0.05 * Math.sin(now / 90);
      ctx.fillStyle = '#ffd166';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    this.pieces.forEachActive((p) => R.drawPiece(ctx, p));
    for (const it of this.items) {
      R.drawItem(ctx, it);
      if (it.check > 0) R.drawCheck(ctx, it.x, it.y, it.check);
    }
    R.drawParticles(ctx, this.particles);
    for (const it of this.items) R.drawReason(ctx, it);
    R.drawFloats(ctx, this.floats);
    R.drawTrail(ctx, this.input.trail, now, this.hitFlash);
    ctx.restore();
  }
}
