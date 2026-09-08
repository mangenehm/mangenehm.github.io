/* localStorage-Wrapper mit Schema-Version und Migration.
   Faellt still auf einen In-Memory-Zustand zurueck, wenn der Browser nichts speichern darf. */

const KEY = 'schnittninja.v1';
const MAX_ENTRIES = 10;

export let storageOk = true;

function defaultState() {
  return {
    version: 2,
    settings: { sound: true, haptics: true, tutorialDone: false },
    scores: {
      numbers: [],
      shapes: [],
      free: [],
      daily: { date: '', entries: [] },
    },
  };
}

/** v1 -> v2: tutorialDone, seconds pro Eintrag, daily-Liste ergaenzen. */
function migrate(data) {
  if (!data || typeof data !== 'object') return defaultState();
  const base = defaultState();
  const out = {
    version: 2,
    settings: Object.assign(base.settings, data.settings || {}),
    scores: Object.assign(base.scores, data.scores || {}),
  };
  for (const mode of ['numbers', 'shapes', 'free']) {
    if (!Array.isArray(out.scores[mode])) out.scores[mode] = [];
    out.scores[mode] = out.scores[mode].filter((e) => e && typeof e.score === 'number');
    if (mode !== 'free') {
      for (const e of out.scores[mode]) if (typeof e.seconds !== 'number') e.seconds = 90;
    }
  }
  if (!out.scores.daily || typeof out.scores.daily !== 'object') out.scores.daily = { date: '', entries: [] };
  if (!Array.isArray(out.scores.daily.entries)) out.scores.daily.entries = [];
  if (typeof out.settings.tutorialDone !== 'boolean') out.settings.tutorialDone = false;
  return out;
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    return migrate(JSON.parse(raw));
  } catch (err) {
    storageOk = false;
    return defaultState();
  }
}

export const state = load();

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    storageOk = false;
    return false;
  }
}

export function todayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function getSettings() {
  return state.settings;
}

export function setSetting(key, value) {
  state.settings[key] = value;
  save();
}

/** Verwirft die Tagesrunden-Liste, sobald ein neuer Tag beginnt. */
function freshDaily() {
  const today = todayKey();
  if (state.scores.daily.date !== today) {
    state.scores.daily = { date: today, entries: [] };
    save();
  }
  return state.scores.daily;
}

export function getScores(mode) {
  if (mode === 'daily') return freshDaily().entries;
  return state.scores[mode] || [];
}

export function bestScore(mode) {
  const list = getScores(mode);
  return list.length ? list[0].score : 0;
}

/** Wuerde dieser Punktestand in die Top 10 kommen? */
export function qualifies(mode, score) {
  if (score <= 0) return false;
  const list = getScores(mode);
  if (list.length < MAX_ENTRIES) return true;
  return score > list[list.length - 1].score;
}

/** Traegt einen Eintrag ein und liefert den gespeicherten Datensatz zurueck –
    so laesst sich der Name nachtraeglich aendern, ohne neu einzutragen.
    Faellt der Eintrag sofort aus den Top 10, ist der Rueckgabewert `null`. */
export function addScore(mode, entry) {
  const list = mode === 'daily' ? freshDaily().entries : (state.scores[mode] = state.scores[mode] || []);
  const record = Object.assign({ date: todayKey() }, entry);
  list.push(record);
  list.sort((a, b) => b.score - a.score || String(a.date).localeCompare(String(b.date)));
  if (list.length > MAX_ENTRIES) list.length = MAX_ENTRIES;
  save();
  return list.includes(record) ? record : null;
}

export function resetScores() {
  state.scores = defaultState().scores;
  save();
}

export function wipeAll() {
  try {
    localStorage.removeItem(KEY);
  } catch (err) {
    /* egal – dann bleibt nur der Speicher im RAM */
  }
  const fresh = defaultState();
  state.version = fresh.version;
  state.settings = fresh.settings;
  state.scores = fresh.scores;
  save();
}

/** Merkt sich den zuletzt genutzten Namen fuer die Highscore-Eingabe. */
export function lastName() {
  for (const mode of ['numbers', 'shapes', 'free']) {
    const list = state.scores[mode];
    if (list && list.length && list[0].name) return list[0].name;
  }
  return '';
}
