/* Tiere und Geländeklassen. Ein Tier belegt `size` zusammenhängende Orte. */

export const TERRAINS = ['house', 'green', 'forest', 'plaza', 'water'];

export const TERRAIN_INFO = {
  house:  { label: 'Häuser',      short: 'H', plural: 'Häuser' },
  green:  { label: 'Wiese/Park',  short: 'W', plural: 'Wiese' },
  forest: { label: 'Wald',        short: 'B', plural: 'Wald' },
  plaza:  { label: 'Platz/Hof',   short: 'P', plural: 'Platz' },
  water:  { label: 'Wasser',      short: 'S', plural: 'Wasser' },
};

// Reihenfolge = Reihenfolge in Listen, Legende und Hash-Kodierung
export const ANIMALS = {
  snake: {
    id: 'snake', name: 'Schlange', emoji: '🐍', color: '#7bbf4a', size: 3,
    favorite: ['forest'], favoriteLabel: 'Wald',
  },
  horse: {
    id: 'horse', name: 'Pferd', emoji: '🐴', color: '#b77a4a', size: 4,
    favorite: ['green'], favoriteLabel: 'Wiese, Park',
  },
  dog: {
    id: 'dog', name: 'Hund', emoji: '🐶', color: '#e0a940', size: 3,
    favorite: ['plaza'], favoriteLabel: 'Platz, Hof',
  },
  cat: {
    id: 'cat', name: 'Katze', emoji: '🐱', color: '#e9785a', size: 2,
    favorite: ['house'], favoriteLabel: 'Häuser',
  },
  mouse: {
    id: 'mouse', name: 'Maus', emoji: '🐭', color: '#9aa3ad', size: 1,
    favorite: ['house'], favoriteLabel: 'Häuser',
  },
};

export const ANIMAL_IDS = Object.keys(ANIMALS);
export const TOTAL_REGIONS = ANIMAL_IDS.reduce((n, id) => n + ANIMALS[id].size, 0);
