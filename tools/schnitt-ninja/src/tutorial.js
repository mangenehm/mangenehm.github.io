/* Kurzes Tutorial beim ersten Start (ca. 15 s, jederzeit überspringbar).
   Laeuft auf demselben Canvas wie das Spiel und nutzt dieselbe Schnitt-Logik. */

import { W, H, Item, Piece, Particle, Pool, circlePoly, segCircleHit } from './entities.js';
import * as R from './render.js';
import { sliceInto } from './game.js';
import { sfx } from './audio.js';
import { S } from './i18n.js';

const MIN_CUT_SPEED = 300;

export class Tutorial {
  constructor(ctx, input, ui, onDone) {
    this.ctx = ctx;
    this.input = input;
    this.ui = ui;
    this.onDone = onDone;
    this.pieces = new Pool(Piece, 12);
    this.particles = new Pool(Particle, 90);
    this.splats = [];
    this.floats = [];
    this.rnd = Math.random;
    this.fx = Math.random;     // `sliceInto` zieht die Optik aus diesem Strom
    this.item = null;
  }

  start() {
    this.step = 0;
    this.timer = 0;
    this.next = null;
    this.item = null;
    this.done = false;
    this.pieces.clear();
    this.particles.clear();
    this.splats.length = 0;
    this.input.reset();
    this.ui.showHud(false);
    this.ui.setBanner('', false);
    this.ui.showTutorial(S.tut1);
    this._spawnFruit();
  }

  finish() {
    if (this.done) return;
    this.done = true;
    this.ui.hideTutorial();
    this.ui.setBanner('', false);
    this.onDone();
  }

  _launch(r) {
    return {
      x: 90 + Math.random() * (W - 180),
      y: H + r + 10,
      vx: (Math.random() - 0.5) * 90,
      vy: -1230,
      angle: 0,
      va: (Math.random() - 0.5) * 2.2,
    };
  }

  _spawnFruit() {
    const r = 42;
    this.item = new Item(Object.assign({
      kind: 'fruit', emoji: '🍉', r, poly: circlePoly(r, 28),
      color: '#ef476f', flesh: '#ff9db3', isTarget: true,
    }, this._launch(r)));
  }

  _spawnBomb() {
    const r = 38;
    this.item = new Item(Object.assign({
      kind: 'bomb', emoji: '💣', r, poly: circlePoly(r, 24),
      color: '#333333', flesh: '#666666', isTarget: false,
    }, this._launch(r)));
  }

  processSegments(segments) {
    if (this.done || !this.item || this.item.cut || this.item.frozen > 0) return;
    for (const seg of segments) {
      if (seg.speed < MIN_CUT_SPEED) continue;
      if (!segCircleHit(seg.a, seg.b, this.item.x, this.item.y, this.item.r)) continue;
      const it = this.item;
      it.cut = true;
      if (this.step === 0) {
        sliceInto(this, it, seg);
        it.dead = true;
        this.item = null;
        sfx.swish();
        sfx.pop(0);
        this.floats.push({ x: it.x, y: it.y, text: 'Super!', color: '#2ec27e', size: 26, vy: -60, life: 1, maxLife: 1 });
        this.next = { t: 0.9, go: 1 };
      } else if (this.step === 1) {
        // Bombe erwischt: derselbe rote Stopp wie im Spiel
        it.frozen = 1.2;
        it.vx = 0;
        it.vy = 0;
        it.va = 0;
        it.reason = S.thatIsABomb;
        sfx.explosion();
        this.ui.showTutorial(S.tut2bad);
        this.ui.flashDamage();
        this.next = { t: 1.6, go: 2 };
      }
      return;
    }
  }

  update(dt, now) {
    if (this.done) return;
    this.timer += dt;

    if (this.item) {
      this.item.update(dt);
      if (this.item.dead) {
        const wasBomb = this.item.kind === 'bomb';
        const wasCut = this.item.cut;
        this.item = null;
        if (this.step === 0) {
          this._spawnFruit();                 // Frucht verpasst – neuer Versuch
        } else if (this.step === 1 && wasBomb && !wasCut && !this.next) {
          this.ui.showTutorial(S.tut2ok);
          sfx.pop(2);
          this.next = { t: 1.4, go: 2 };
        }
      }
    }

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
    this.input.prune(now);

    if (this.next) {
      this.next.t -= dt;
      if (this.next.t <= 0) {
        const go = this.next.go;
        this.next = null;
        this._enter(go);
      }
    }
  }

  _enter(step) {
    this.step = step;
    if (step === 1) {
      this.ui.showTutorial(S.tut2);
      this._spawnBomb();
    } else if (step === 2) {
      this.item = null;
      this.ui.showHud(true);
      this.ui.setHud({ score: 0, mult: 1, lives: 3, timed: false, timeLeft: 0, seconds: 60, frenzy: 0, x2: 0 });
      this.ui.setBanner(S.cutOnly('GERADE Zahlen'), true);
      this.ui.showTutorial(S.tut3);
      this.next = { t: 3, go: 3 };
    } else if (step === 3) {
      this.ui.showTutorial(S.tutDone);
      this.next = { t: 0.8, go: 4 };
    } else {
      this.finish();
    }
  }

  draw(now) {
    const ctx = this.ctx;
    R.drawBackground(ctx);
    R.drawSplats(ctx, this.splats);
    this.pieces.forEachActive((p) => R.drawPiece(ctx, p));
    if (this.item) {
      R.drawItem(ctx, this.item);
      R.drawReason(ctx, this.item);
    }
    R.drawParticles(ctx, this.particles);
    R.drawFloats(ctx, this.floats);
    R.drawTrail(ctx, this.input.trail, now, 0);
  }
}
