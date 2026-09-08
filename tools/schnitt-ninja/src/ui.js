/* Alle DOM-Overlays: Menues, Setup, HUD, Pause, Game Over, Highscores, Einstellungen. */

import { S, SHAPE_LABEL } from './i18n.js';
import * as Rules from './rules.js';
import * as store from './storage.js';
import { sfx } from './audio.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const SCREENS = [
  'menu', 'setup-numbers', 'setup-shapes', 'setup-free', 'setup-daily',
  'pause', 'over', 'highscores', 'help', 'settings', 'confirm',
];

/** Jede Runde dauert gleich lang. Eine Wahl weniger vor dem Start, und die
    Bestenlisten vergleichen endlich Gleiches mit Gleichem. */
const ROUND_SECONDS = 60;

/** Highscore-Namen kommen aus einem Eingabefeld: `<B>` ist ein gueltiger
    Drei-Zeichen-Name und wuerde die Liste sonst zerlegen. */
function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function ruleLabel(choice, threshold) {
  switch (choice) {
    case 'even': return 'gerade';
    case 'odd': return 'ungerade';
    case 'less': return `< ${threshold}`;
    case 'greater': return `> ${threshold}`;
    default: return 'Wechsel';
  }
}

export class UI {
  constructor(hooks) {
    this.hooks = hooks;
    this.current = 'menu';
    this.centerTimer = null;
    this.pendingScore = null;

    this.el = {
      hud: $('#hud'),
      score: $('#hudScore'),
      mult: $('#hudMult'),
      hearts: $('#hudHearts'),
      banner: $('#hudBanner'),
      timerWrap: $('#hudTimerWrap'),
      timer: $('#hudTimer'),
      boosts: $('#hudBoosts'),
      center: $('#centerMsg'),
      dim: $('#centerDim'),
      tutorialBox: $('#tutorialBox'),
      tutorialText: $('#tutorialText'),
    };

    this.damage = document.createElement('div');
    Object.assign(this.damage.style, {
      position: 'absolute', inset: '0', pointerEvents: 'none', opacity: '0',
      background: 'radial-gradient(circle at 50% 50%, rgba(239,71,111,0) 45%, rgba(239,71,111,0.75) 100%)',
      transition: 'opacity .35s ease-out', zIndex: '4',
    });
    $('#stage').appendChild(this.damage);

    this._wireNav();
    this._wireNumbers();
    this._wireShapes();
    this._wireFree();
    this._wireGame();
    this._wireHighscores();
    this._wireSettings();
  }

  /* ---------------- Navigation ---------------- */

  show(name) {
    for (const s of SCREENS) {
      const el = document.getElementById(`screen-${s}`);
      if (el) el.classList.toggle('hidden', s !== name);
    }
    this.current = name;
    if (name === 'highscores') this.renderScores();
    if (name === 'setup-daily') this.renderDaily();
  }

  hideAll() {
    for (const s of SCREENS) {
      const el = document.getElementById(`screen-${s}`);
      if (el) el.classList.add('hidden');
    }
    this.current = null;
  }

  _wireNav() {
    $$('[data-goto]').forEach((btn) => {
      btn.addEventListener('click', () => this.show(btn.dataset.goto));
    });
  }

  /* ---------------- Setup: Zahlen ---------------- */

  _wireNumbers() {
    this.num = { min: 1, max: 20, rule: 'random', threshold: null };

    const sync = () => {
      $('#numMin').value = this.num.min;
      $('#numMax').value = this.num.max;
      $$('#numRangePresets .chip').forEach((c) => {
        c.classList.toggle('active', +c.dataset.min === this.num.min && +c.dataset.max === this.num.max);
      });
      const needsX = this.num.rule === 'less' || this.num.rule === 'greater';
      $('#numThresholdRow').classList.toggle('hidden', !needsX);
      $('#numFactor').textContent = Rules.formatFactor(
        Rules.numbersFactor(this.num.min, this.num.max, this.num.rule));
    };
    this._syncNumbers = sync;

    $$('#numRangePresets .chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        this.num.min = +chip.dataset.min;
        this.num.max = +chip.dataset.max;
        sync();
      });
    });
    const clampInputs = () => {
      let min = parseInt($('#numMin').value, 10);
      let max = parseInt($('#numMax').value, 10);
      if (!Number.isFinite(min)) min = 1;
      if (!Number.isFinite(max)) max = 20;
      min = Math.max(0, Math.min(98, min));
      max = Math.max(min + 1, Math.min(99, max));
      this.num.min = min;
      this.num.max = max;
      sync();
    };
    $('#numMin').addEventListener('change', clampInputs);
    $('#numMax').addEventListener('change', clampInputs);

    $$('#numRules .chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        $$('#numRules .chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        this.num.rule = chip.dataset.rule;
        sync();
      });
    });
    $('#numThreshold').addEventListener('change', () => {
      const v = parseInt($('#numThreshold').value, 10);
      this.num.threshold = Number.isFinite(v) ? v : null;
    });
    $('#startNumbers').addEventListener('click', () => {
      clampInputs();
      const types = Rules.availableNumberRules(this.num.min, this.num.max);
      let rule = this.num.rule;
      if (rule !== 'random' && !types.includes(rule)) rule = 'random';
      let threshold = this.num.threshold;
      if (rule === 'less' || rule === 'greater') {
        if (threshold == null || threshold <= this.num.min || threshold > this.num.max) {
          threshold = Rules.pickThreshold(this.num.min, this.num.max);
        }
      } else {
        threshold = null;
      }
      this.hooks.onStart({
        mode: 'numbers',
        min: this.num.min,
        max: this.num.max,
        ruleChoice: rule,
        threshold,
        seconds: ROUND_SECONDS,
      });
    });
    sync();
  }

  /* ---------------- Setup: Formen ---------------- */

  /** Nur noch die Anzahl der Zielformen. Die Formen selbst würfelt das Spiel und
      wechselt sie alle 30 s – das ist der Kern des Modus. Die frühere Handauswahl
      war zudem irreführend: die zweite Form verdrängte stillschweigend die erste,
      solange „1 Form“ eingestellt war. */
  _wireShapes() {
    this.shp = { count: 1 };

    const sync = () => {
      $$('#shapeCount .chip').forEach((c) => c.classList.toggle('active', +c.dataset.count === this.shp.count));
      $('#shapeFactor').textContent = Rules.formatFactor(Rules.shapesFactor(this.shp.count));
    };

    $$('#shapeCount .chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        this.shp.count = +chip.dataset.count;
        sync();
      });
    });

    $('#startShapes').addEventListener('click', () => {
      this.hooks.onStart({
        mode: 'shapes',
        shapeCount: this.shp.count,
        shapeChoice: 'random',
        shapeTargets: [],
        seconds: ROUND_SECONDS,
      });
    });
    sync();
  }

  /* ---------------- Setup: Freies Spiel ---------------- */

  _wireFree() {
    // Bomben gehoeren zum freien Spiel – ohne sie gibt es keinen Fehler und
    // damit keinen Einsatz. Deshalb keine Wahl mehr, sondern immer an.
    $('#startFree').addEventListener('click', () => {
      this.hooks.onStart({ mode: 'free', bombs: true, seconds: ROUND_SECONDS });
    });
    $('#startDaily').addEventListener('click', () => {
      this.hooks.onStart({
        mode: 'free',
        bombs: true,
        seconds: ROUND_SECONDS,
        daily: true,
        seed: store.todayKey(),
      });
    });
  }

  /** Datum und eigener Tagesbestwert auf dem Tagesrunden-Screen. */
  renderDaily() {
    const heute = new Date();
    $('#dailyDate').textContent = heute.toLocaleDateString('de-DE',
      { weekday: 'long', day: 'numeric', month: 'long' });
    const eintraege = store.getScores('daily');
    const best = eintraege.length ? eintraege[0].score : 0;
    $('#dailyBest').textContent = best
      ? S.dailyPlayed(eintraege.length, best)
      : S.dailyFresh;
  }

  /* ---------------- Spiel-Buttons ---------------- */

  _wireGame() {
    $('#btnPause').addEventListener('click', () => this.hooks.onPause());
    $('#btnResume').addEventListener('click', () => this.hooks.onResume());
    $('#btnRestart').addEventListener('click', () => this.hooks.onRestart());
    $('#btnQuit').addEventListener('click', () => this.hooks.onQuit());
    $('#btnAgain').addEventListener('click', () => {
      this._commitScore();
      this.hooks.onRestart();
    });
    $('#btnOverMenu').addEventListener('click', () => {
      this._commitScore();
      this.hooks.onMenu();
    });
    $('#btnTutorialSkip').addEventListener('click', () => this.hooks.onSkipTutorial());
    // Der Eintrag steht schon in der Liste (siehe gameOver); Tippen benennt ihn um.
    $('#overName').addEventListener('input', () => this._renameScore());
  }

  /* ---------------- HUD ---------------- */

  showHud(on) {
    this.el.hud.classList.toggle('hidden', !on);
  }

  setBanner(html, pulse) {
    // nur interne Konstanten – keine Nutzereingabe
    this.el.banner.innerHTML = html;
    this.el.banner.classList.toggle('pulse', !!pulse);
  }

  setHud(h) {
    this.el.score.textContent = h.score;
    this.el.mult.textContent = `×${h.mult}`;
    this.el.mult.style.visibility = h.mult > 1 ? 'visible' : 'hidden';
    let hearts = '';
    for (let i = 0; i < 3; i++) hearts += i < h.lives ? '<span>❤️</span>' : '<span class="lost">❤️</span>';
    if (this.el.hearts.dataset.lives !== String(h.lives)) {
      this.el.hearts.innerHTML = hearts;
      this.el.hearts.dataset.lives = String(h.lives);
    }
    this.el.timerWrap.classList.toggle('hidden', !h.timed);
    if (h.timed) {
      const pct = Math.max(0, Math.min(1, h.timeLeft / h.seconds)) * 100;
      this.el.timer.style.width = `${pct}%`;
      this.el.timer.classList.toggle('low', h.timeLeft <= 10);
    }
    const boosts = [];
    if (h.frenzy > 0) boosts.push(`⭐ ${h.frenzy.toFixed(1)}s`);
    if (h.x2 > 0) boosts.push(`×2 ${h.x2.toFixed(1)}s`);
    const txt = boosts.map((b) => `<span class="boost">${b}</span>`).join('');
    if (this.el.boosts.innerHTML !== txt) this.el.boosts.innerHTML = txt;
  }

  bumpMultiplier() {
    const el = this.el.mult;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
    setTimeout(() => el.classList.remove('bump'), 220);
  }

  flashDamage() {
    this.damage.style.transition = 'none';
    this.damage.style.opacity = '1';
    clearTimeout(this._damageTimer);
    this._damageTimer = setTimeout(() => {
      this.damage.style.transition = 'opacity .45s ease-out';
      this.damage.style.opacity = '0';
    }, 30);
  }

  /** Zentrale Einblendung aus drei Ebenen: kleiner Kicker, große Hauptzeile, leiser Zusatz.
      Die Hauptzeile trägt immer die wichtigste Information – beim Regelwechsel also die Regel. */
  showCenter(main, note, opts = {}) {
    const el = this.el.center;
    const mods = ['big', 'warn', 'card', 'small', 'high']
      .filter((m) => opts[m])
      .map((m) => ` ${m}`)
      .join('');
    el.className = `center-msg${mods} pop`;
    el.innerHTML = [
      opts.kicker ? `<span class="kicker">${opts.kicker}</span>` : '',
      `<span class="main">${main || ''}</span>`,
      note ? `<span class="note">${note}</span>` : '',
    ].join('');
    el.classList.remove('hidden');
    this.el.dim.classList.toggle('hidden', !opts.dim);
    clearTimeout(this.centerTimer);
    if (opts.duration) {
      this.centerTimer = setTimeout(() => this.hideCenter(), opts.duration * 1000);
    } else if (!opts.sticky && !opts.big) {
      this.centerTimer = setTimeout(() => this.hideCenter(), 1200);
    }
  }

  hideCenter() {
    clearTimeout(this.centerTimer);
    this.el.center.classList.add('hidden');
    this.el.dim.classList.add('hidden');
  }

  showTutorial(text) {
    this.el.tutorialText.textContent = text;
    this.el.tutorialBox.classList.remove('hidden');
  }

  hideTutorial() {
    this.el.tutorialBox.classList.add('hidden');
  }

  /* ---------------- Game Over ---------------- */

  gameOver(result) {
    this.showHud(false);
    this.hideCenter();
    const list = result.daily ? 'daily' : result.mode;
    const best = store.bestScore(list);
    $('#overTitle').textContent =
      result.reason === 'time' ? S.timeUp : result.reason === 'lives' ? S.noLives : S.roundOver;
    $('#overScore').textContent = result.score;
    $('#overBest').textContent = S.best(Math.max(best, result.score));
    $('#overStats').textContent = S.statsLine(result.correct, result.wrong, result.bestStreak);

    const qualifies = store.qualifies(list, result.score);
    const isRecord = qualifies && result.score > best;
    if (isRecord) sfx.record();
    $('#overRecord').classList.toggle('hidden', !isRecord);
    $('#nameRow').classList.toggle('hidden', !qualifies);
    if (qualifies) {
      $('#overName').value = store.lastName();
      // Sofort eintragen statt erst beim Knopfdruck: sonst ist der Lauf weg,
      // wenn der Screen anders verlassen wird – Neuladen, Zuruecktaste,
      // Tab schliessen. Der Name wird danach im Eintrag selbst gepflegt.
      this.pendingScore = store.addScore(list, this._entryFor(result));
      this._renameScore();
    } else {
      this.pendingScore = null;
    }
    this.show('over');
    return isRecord;
  }

  /** Baut den Highscore-Eintrag aus dem Rundenergebnis. */
  _entryFor(result) {
    const entry = { name: store.lastName() || '???', score: result.score };
    if (result.mode === 'free') {
      entry.seconds = result.cfg.seconds;
    } else if (result.mode === 'numbers' && !result.daily) {
      entry.range = `${result.cfg.min}-${result.cfg.max}`;
      entry.rule = result.cfg.ruleChoice;
      entry.threshold = result.cfg.threshold;
      entry.seconds = result.cfg.seconds;
    } else if (result.mode === 'shapes') {
      entry.targets = result.cfg.shapeChoice === 'random' ? ['random'] : result.cfg.shapeTargets;
      entry.count = result.cfg.shapeCount;
      entry.seconds = result.cfg.seconds;
    }
    return entry;
  }

  /** Uebernimmt das Namensfeld in den bereits gespeicherten Eintrag. */
  _renameScore() {
    if (!this.pendingScore) return;
    const raw = ($('#overName').value || '')
      .toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
    this.pendingScore.name = raw || '???';
    store.save();
  }

  _commitScore() {
    this._renameScore();
    this.pendingScore = null;
  }

  /* ---------------- Highscores ---------------- */

  _wireHighscores() {
    this.hsTab = 'numbers';
    $$('#hsTabs .tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        $$('#hsTabs .tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        this.hsTab = tab.dataset.tab;
        this.renderScores();
      });
    });
    $('#btnResetScores').addEventListener('click', () => {
      this.confirm(S.reallyDelete, () => {
        store.resetScores();
        this.renderScores();
        this.show('highscores');
      });
    });
  }

  renderScores() {
    const list = store.getScores(this.hsTab);
    const ol = $('#hsList');
    if (!list.length) {
      ol.innerHTML = `<li class="hs-empty">${S.noScores}</li>`;
      return;
    }
    ol.innerHTML = list.map((e, i) => {
      let meta = '';
      // Alle Runden dauern gleich lang; die Laenge steht nur noch an aelteren
      // Eintraegen, damit die nicht faelschlich vergleichbar aussehen.
      const laenge = e.seconds != null && e.seconds !== ROUND_SECONDS
        ? ` · ${e.seconds > 0 ? `${e.seconds} s` : 'ohne Limit'}`
        : '';
      if (this.hsTab === 'numbers') {
        meta = `${e.range || ''} · ${ruleLabel(e.rule, e.threshold)}${laenge}`;
      } else if (this.hsTab === 'shapes') {
        meta = `${e.count === 2 ? '2 Formen' : '1 Form'}${laenge}`;
      } else if (this.hsTab === 'free') {
        meta = laenge.replace(' · ', '');
      }
      const date = e.date ? e.date.split('-').reverse().join('.') : '';
      return `<li>
        <span class="rank">${i + 1}.</span>
        <span class="who">${esc(e.name || '???')}</span>
        <span class="pts">${esc(e.score)}</span>
        <span class="meta">${esc(meta)}${meta && date ? ' · ' : ''}${esc(date)}</span>
      </li>`;
    }).join('');
  }

  /* ---------------- Einstellungen ---------------- */

  _wireSettings() {
    const s = store.getSettings();
    $('#setSound').checked = s.sound;
    $('#setHaptics').checked = s.haptics;
    if (!store.storageOk) $('#storageNote').textContent = S.storageFail;

    $('#setSound').addEventListener('change', (e) => {
      store.setSetting('sound', e.target.checked);
      this.hooks.onSound(e.target.checked);
    });
    $('#setHaptics').addEventListener('change', (e) => store.setSetting('haptics', e.target.checked));
    $('#btnShowTutorial').addEventListener('click', () => this.hooks.onTutorial());
    $('#btnWipe').addEventListener('click', () => {
      this.confirm('Wirklich alle Daten löschen?', () => {
        store.wipeAll();
        $('#setSound').checked = true;
        $('#setHaptics').checked = true;
        this.show('settings');
      });
    });
  }

  /* ---------------- Bestätigung ---------------- */

  confirm(title, onYes) {
    const back = this.current;
    $('#confirmTitle').textContent = title;
    const yes = $('#confirmYes');
    const no = $('#confirmNo');
    const cleanup = () => {
      yes.removeEventListener('click', okHandler);
      no.removeEventListener('click', noHandler);
    };
    const okHandler = () => { cleanup(); onYes(); };
    const noHandler = () => { cleanup(); this.show(back); };
    yes.addEventListener('click', okHandler);
    no.addEventListener('click', noHandler);
    this.show('confirm');
  }
}
