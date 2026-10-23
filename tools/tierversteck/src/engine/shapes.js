/* Tierformen, Drehen und Spiegeln. Zellen sind [x, y], y wächst nach unten. */

export const TERRAINS = ['water', 'building', 'forest', 'green', 'road', 'other'];

export const TERRAIN_INFO = {
  water:    { label: 'Wasser',       short: 'W' },
  building: { label: 'Gebäude',      short: 'G' },
  forest:   { label: 'Wald/Gebüsch', short: 'B' },
  green:    { label: 'Grün',         short: 'R' },
  road:     { label: 'Straße/Weg',   short: 'S' },
  other:    { label: 'Sonstiges',    short: 'O' },
};

// Reihenfolge = Reihenfolge in Listen, Legende und Hash-Kodierung
export const ANIMALS = {
  snake: {
    id: 'snake', name: 'Schlange', emoji: '🐍', color: '#7bbf4a',
    cells: [[0, 0], [1, 0], [1, 1], [1, 2], [2, 2]],      // Zickzack (S-Form)
    favorite: ['forest'], favoriteLabel: 'Wald, Gebüsch',
  },
  horse: {
    id: 'horse', name: 'Pferd', emoji: '🐴', color: '#b77a4a',
    cells: [[0, 0], [0, 1], [0, 2], [1, 2]],              // L wie der Springer
    favorite: ['green'], favoriteLabel: 'Wiese, Feld, Park',
  },
  dog: {
    id: 'dog', name: 'Hund', emoji: '🐶', color: '#e0a940',
    cells: [[0, 0], [1, 0], [2, 0]],                      // gerade
    favorite: ['road'], favoriteLabel: 'Straße, Weg',
  },
  cat: {
    id: 'cat', name: 'Katze', emoji: '🐱', color: '#e9785a',
    cells: [[0, 0], [1, 0], [0, 1]],                      // Ecke
    favorite: ['building'], favoriteLabel: 'Gebäude',
  },
  mouse: {
    id: 'mouse', name: 'Maus', emoji: '🐭', color: '#9aa3ad',
    cells: [[0, 0]],                                      // Einzelfeld
    favorite: ['building'], favoriteLabel: 'Gebäude',
  },
};

export const ANIMAL_IDS = Object.keys(ANIMALS);
export const TOTAL_CELLS = ANIMAL_IDS.reduce((n, id) => n + ANIMALS[id].cells.length, 0);

/**
 * Lineare Abbildung einer Orientierung: erst spiegeln (x → -x), dann
 * rot-mal um 90° im Uhrzeigersinn drehen ((x, y) → (-y, x)).
 * Liefert [a, b, c, d] mit (x, y) → (a·x + c·y, b·x + d·y) – dieselbe
 * Reihenfolge wie CanvasRenderingContext2D.setTransform.
 */
export function orientationMatrix(rot = 0, flip = false) {
  let m = flip ? [-1, 0, 0, 1] : [1, 0, 0, 1];
  for (let i = 0; i < (((rot % 4) + 4) % 4); i++) {
    const [a, b, c, d] = m;
    m = [-b, a, -d, c];
  }
  return m.map(v => v + 0);   // -0 vermeiden
}

/** Zellen einer Grundform in gegebener Orientierung, auf (0,0) normalisiert und sortiert. */
export function orient(cells, rot = 0, flip = false) {
  const [a, b, c, d] = orientationMatrix(rot, flip);
  // Zellmittelpunkte abbilden, damit die Zellen ganzzahlig bleiben
  const pts = cells.map(([x, y]) => [a * (x + 0.5) + c * (y + 0.5), b * (x + 0.5) + d * (y + 0.5)]);
  const minX = Math.min(...pts.map(p => p[0]));
  const minY = Math.min(...pts.map(p => p[1]));
  return pts
    .map(([x, y]) => [Math.round(x - minX), Math.round(y - minY)])
    .sort((p, q) => p[1] - q[1] || p[0] - q[0]);
}

/** Alle unterscheidbaren Orientierungen einer Form als [{rot, flip, cells}]. */
export function orientations(animalId) {
  const seen = new Set();
  const out = [];
  for (const flip of [false, true]) {
    for (let rot = 0; rot < 4; rot++) {
      const cells = orient(ANIMALS[animalId].cells, rot, flip);
      const key = JSON.stringify(cells);
      if (!seen.has(key)) { seen.add(key); out.push({ rot, flip, cells }); }
    }
  }
  return out;
}

/** Größe der umschließenden Box einer Form in einer Orientierung. */
export function shapeSize(animalId, rot = 0, flip = false) {
  const cells = orient(ANIMALS[animalId].cells, rot, flip);
  return {
    w: Math.max(...cells.map(c => c[0])) + 1,
    h: Math.max(...cells.map(c => c[1])) + 1,
  };
}

/** Absolute Brettzellen einer Platzierung {animal, x, y, rot, flip}. */
export function placementCells(p) {
  return orient(ANIMALS[p.animal].cells, p.rot, p.flip).map(([cx, cy]) => [cx + p.x, cy + p.y]);
}

/** Platzierung zu einer bekannten Zellmenge finden (für aufgedeckte Tiere des Gegners). */
export function placementFromCells(animalId, cells) {
  const minX = Math.min(...cells.map(c => c[0])), minY = Math.min(...cells.map(c => c[1]));
  const key = JSON.stringify(cells.map(([x, y]) => [x - minX, y - minY]).sort((p, q) => p[1] - q[1] || p[0] - q[0]));
  for (const o of orientations(animalId)) {
    if (JSON.stringify(o.cells) === key) return { animal: animalId, x: minX, y: minY, rot: o.rot, flip: o.flip };
  }
  return null;
}
