/* Alle sichtbaren Texte an einem Ort – spaeter leicht um weitere Sprachen erweiterbar. */

export const S = {
  title: 'Schnitt-Ninja',

  // Modi
  numbers: 'Zahlen',
  shapes: 'Formen',
  free: 'Freies Spiel',
  daily: 'Tagesrunde',

  // HUD
  cutOnly: (what) => `Schneide nur ${what}`,
  cutOnlyPrefix: 'Schneide nur…',
  cutEverything: 'Schneide alle Früchte – nicht die Bomben!',
  cutEverythingNoBombs: 'Schneide alle Früchte!',
  lives: 'Leben',
  points: 'Punkte',
  time: 'Zeit',
  combo: (n) => `Combo ×${n}`,

  // Regelwechsel / Wellen
  ruleSoon: 'Neue Regel gleich…',
  ruleNew: 'Neue Regel!',
  wave: 'WELLE!',
  frenzy: 'Sternfrucht-Rausch!',
  doublePoints: 'Doppelte Punkte!',
  golden: 'Goldene Frucht!',
  missed: 'Verpasst',

  // Lernmoment
  isEven: (n) => `${n} ist gerade`,
  isOdd: (n) => `${n} ist ungerade`,
  isLess: (n, x) => `${n} ist kleiner als ${x}`,
  isGreater: (n, x) => `${n} ist größer als ${x}`,
  isNotLess: (n, x) => `${n} ist nicht kleiner als ${x}`,
  isNotGreater: (n, x) => `${n} ist nicht größer als ${x}`,
  thatIsA: (shape) => `Das ist ein ${shape}`,
  thatIsABomb: 'Das ist eine Bombe',

  // Screens
  pause: 'Pause',
  resume: 'Weiter',
  restart: 'Neustart',
  toMenu: 'Zum Menü',
  playAgain: 'Nochmal spielen',
  newRecord: 'Neuer Rekord!',
  enterName: 'Name eingeben',
  highscores: 'Highscores',
  settings: 'Einstellungen',
  reset: 'Zurücksetzen',
  reallyDelete: 'Wirklich löschen?',
  roundOver: 'Runde vorbei',
  timeUp: 'Zeit abgelaufen!',
  noLives: 'Keine Leben mehr!',

  // Tutorial
  tut1: 'Wische durch die Frucht!',
  tut2: 'Nicht diese! Bomben einfach fliegen lassen.',
  tut2ok: 'Richtig, einfach fliegen lassen!',
  tut2bad: 'Autsch – das kostet ein Leben.',
  tut3: 'Lies immer die Regel oben!',
  tutDone: 'Los geht’s!',

  // Statistik
  statsLine: (ok, bad, streak) => `${ok} richtig · ${bad} falsch · längste Serie ${streak}`,
  best: (n) => `Bestwert: ${n}`,
  noScores: 'Noch keine Einträge.',
  storageFail: 'Achtung: Der Browser speichert nichts (privater Modus?). Punkte gehen verloren.',
};

/** Formennamen im Singular und Plural (Akkusativ-tauglich fuer den Banner). */
export const SHAPE_LABEL = {
  circle: { one: 'Kreis', many: 'Kreise', icon: '⬤' },
  square: { one: 'Quadrat', many: 'Quadrate', icon: '⬛' },
  triangle: { one: 'Dreieck', many: 'Dreiecke', icon: '▲' },
  star: { one: 'Stern', many: 'Sterne', icon: '★' },
  hexagon: { one: 'Sechseck', many: 'Sechsecke', icon: '⬢' },
};
