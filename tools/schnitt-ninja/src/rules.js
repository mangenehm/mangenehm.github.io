/* Regelgeneratoren fuer Zahlen- und Formen-Modus inklusive Regelwechsel. */

import { S, SHAPE_LABEL } from './i18n.js';

export const SHAPES = ['circle', 'square', 'triangle', 'star', 'hexagon'];

export const NUMBER_RULE_TYPES = ['even', 'odd', 'less', 'greater'];

/* ---------------- Zahlen ---------------- */

export function makeNumberRule(type, min, max, threshold) {
  const x = threshold;
  const rule = {
    kind: 'number',
    type,
    threshold: x,
    min,
    max,
    id: `${type}:${x || ''}`,
  };
  switch (type) {
    case 'even':
      rule.short = 'GERADE Zahlen';
      rule.test = (v) => v % 2 === 0;
      rule.reason = (v) => S.isOdd(v);
      break;
    case 'odd':
      rule.short = 'UNGERADE Zahlen';
      rule.test = (v) => v % 2 !== 0;
      rule.reason = (v) => S.isEven(v);
      break;
    case 'less':
      rule.short = `Zahlen KLEINER als ${x}`;
      rule.test = (v) => v < x;
      rule.reason = (v) => (v === x ? S.isNotLess(v, x) : S.isGreater(v, x));
      break;
    case 'greater':
      rule.short = `Zahlen GRÖSSER als ${x}`;
      rule.test = (v) => v > x;
      rule.reason = (v) => (v === x ? S.isNotGreater(v, x) : S.isLess(v, x));
      break;
    default:
      throw new Error(`unbekannte Regel: ${type}`);
  }
  rule.banner = S.cutOnly(rule.short);
  return rule;
}

/** Schwelle so waehlen, dass Ziel- und Nichtziel-Menge beide gross genug sind (25–75 % der Spanne). */
export function pickThreshold(min, max) {
  const span = max - min;
  const lo = min + Math.max(1, Math.round(span * 0.25));
  const hi = min + Math.max(1, Math.round(span * 0.75));
  if (hi <= lo) return Math.min(max, lo);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

/** Welche Regeltypen sind in diesem Zahlenraum sinnvoll? */
export function availableNumberRules(min, max) {
  const types = [];
  let evens = 0;
  let odds = 0;
  for (let v = min; v <= max; v++) (v % 2 === 0 ? evens++ : odds++);
  if (evens && odds) types.push('even', 'odd');
  if (max - min >= 3) types.push('less', 'greater');
  return types.length ? types : ['even', 'odd'];
}

export function randomNumberRule(min, max, previous) {
  const types = availableNumberRules(min, max);
  for (let attempt = 0; attempt < 40; attempt++) {
    const type = types[Math.floor(Math.random() * types.length)];
    const threshold = type === 'less' || type === 'greater' ? pickThreshold(min, max) : null;
    const rule = makeNumberRule(type, min, max, threshold);
    if (!previous || rule.id !== previous.id) return rule;
  }
  return makeNumberRule(types[0], min, max, pickThreshold(min, max));
}

/* ---------------- Formen ---------------- */

export function makeShapeRule(targets) {
  const list = targets.slice();
  const names = list.map((s) => SHAPE_LABEL[s].many);
  const icons = list.map((s) => SHAPE_LABEL[s].icon).join(' ');
  const short = `${icons} ${names.join(' und ')}`;
  return {
    kind: 'shape',
    targets: list,
    id: `shape:${list.slice().sort().join(',')}`,
    short,
    banner: S.cutOnly(short),
    test: (shape) => list.includes(shape),
    reason: (shape) => S.thatIsA(SHAPE_LABEL[shape].one),
  };
}

export function randomShapeRule(count, previous) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const pool = SHAPES.slice();
    const targets = [];
    while (targets.length < count && pool.length) {
      targets.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    const rule = makeShapeRule(targets);
    if (!previous || rule.id !== previous.id) return rule;
  }
  return makeShapeRule([SHAPES[0]]);
}

/* ---------------- Schwierigkeitsfaktor (Briefing §5) ---------------- */

export function numbersFactor(min, max, ruleChoice) {
  const span = max - min + 1;
  let f;
  if (span <= 10) f = 1.0;
  else if (span <= 20) f = 1.2;
  else if (span <= 50) f = 1.5;
  else f = 2.0;
  if (ruleChoice === 'less' || ruleChoice === 'greater') f += 0.3;
  // "Zufaellig" mischt leichte (gerade/ungerade) und schwere Regeln – halber Aufschlag.
  else if (ruleChoice === 'random') f += 0.15;
  return Math.round(f * 100) / 100;
}

export function shapesFactor(count) {
  return count >= 2 ? 1.5 : 1.0;
}

export function formatFactor(f) {
  return `×${f.toFixed(f % 1 === 0 ? 1 : (Math.round(f * 100) % 10 === 0 ? 1 : 2))}`;
}
