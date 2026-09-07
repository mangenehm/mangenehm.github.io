/* Geometrie, Objekte und Pools.
   Logisches Spielfeld: 390 x 844 (Design-Aufloesung, wird beim Rendern skaliert). */

export const W = 390;
export const H = 844;
export const GRAVITY = 1500;

/* ---------------- Polygon-Werkzeug ---------------- */

export function circlePoly(r, n = 32) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  return pts;
}

export function shapePoly(kind, r) {
  switch (kind) {
    case 'square': {
      const s = r * 0.82;
      return [{ x: -s, y: -s }, { x: s, y: -s }, { x: s, y: s }, { x: -s, y: s }];
    }
    case 'triangle': {
      const pts = [];
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (i / 3) * Math.PI * 2;
        pts.push({ x: Math.cos(a) * r * 1.1, y: Math.sin(a) * r * 1.1 });
      }
      return pts;
    }
    case 'hexagon': {
      const pts = [];
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i / 6) * Math.PI * 2;
        pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
      }
      return pts;
    }
    case 'star': {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
        const rr = i % 2 === 0 ? r * 1.08 : r * 0.46;
        pts.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr });
      }
      return pts;
    }
    case 'circle':
    default:
      return circlePoly(r, 32);
  }
}

export function polyArea(poly) {
  let a = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % n];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

export function polyCentroid(poly) {
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (let i = 0, n = poly.length; i < n; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % n];
    const f = p.x * q.y - q.x * p.y;
    a += f;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  if (Math.abs(a) < 1e-6) {
    // entartet: einfacher Mittelwert
    let mx = 0;
    let my = 0;
    for (const p of poly) { mx += p.x; my += p.y; }
    return { x: mx / poly.length, y: my / poly.length };
  }
  a *= 0.5;
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

function side(a, b, p) {
  return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
}

/** Sutherland-Hodgman gegen eine Halbebene: behaelt alles auf der Seite `sgn`. */
export function clipHalf(poly, a, b, sgn) {
  const out = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const cur = poly[i];
    const nxt = poly[(i + 1) % n];
    const dc = side(a, b, cur) * sgn;
    const dn = side(a, b, nxt) * sgn;
    if (dc >= 0) out.push(cur);
    if ((dc > 0 && dn < 0) || (dc < 0 && dn > 0)) {
      const t = dc / (dc - dn);
      out.push({ x: cur.x + (nxt.x - cur.x) * t, y: cur.y + (nxt.y - cur.y) * t });
    }
  }
  return out;
}

/** Schnittpunkte der (unendlichen) Linie a-b mit dem Polygonrand. */
export function chordPoints(poly, a, b) {
  const hits = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const cur = poly[i];
    const nxt = poly[(i + 1) % n];
    const dc = side(a, b, cur);
    const dn = side(a, b, nxt);
    if ((dc > 0 && dn < 0) || (dc < 0 && dn > 0)) {
      const t = dc / (dc - dn);
      hits.push({ x: cur.x + (nxt.x - cur.x) * t, y: cur.y + (nxt.y - cur.y) * t });
    }
  }
  return hits;
}

/** Trifft die Strecke p1-p2 den Kreis um c mit Radius r? */
export function segCircleHit(p1, p2, cx, cy, r) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((cx - p1.x) * dx + (cy - p1.y) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const px = p1.x + dx * t - cx;
  const py = p1.y + dy * t - cy;
  return px * px + py * py <= r * r;
}

export function rotate(p, ang) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

/* ---------------- Item ---------------- */

let nextId = 1;

export class Item {
  constructor(opts) {
    this.id = nextId++;
    this.kind = opts.kind;               // fruit | bomb | number | shape | golden | frenzy | x2
    this.value = opts.value ?? null;     // Zahl im Zahlen-Modus
    this.shape = opts.shape ?? null;     // Form im Formen-Modus
    this.emoji = opts.emoji ?? null;
    this.color = opts.color ?? '#ffffff';
    this.edge = opts.edge ?? '#ffffff';
    this.flesh = opts.flesh ?? 'rgba(255,255,255,0.8)';
    this.r = opts.r ?? 40;
    this.poly = opts.poly || circlePoly(this.r, 32);
    this.isTarget = !!opts.isTarget;
    this.x = opts.x;
    this.y = opts.y;
    this.vx = opts.vx;
    this.vy = opts.vy;
    this.angle = opts.angle ?? 0;
    this.va = opts.va ?? 0;
    this.dead = false;
    this.cut = false;
    this.frozen = 0;      // Restzeit des "Lernmoment"-Stopps
    this.flash = 0;       // weisser Blitz nach dem Treffer
    this.reason = null;   // Text beim falschen Schnitt
    this.check = 0;       // gruenes Haekchen nach richtigem Schnitt
    this.glow = opts.glow || 0;
    this.spawnT = 0;
  }

  update(dt) {
    this.spawnT += dt;
    if (this.frozen > 0) {
      this.frozen -= dt;
      if (this.frozen <= 0) {
        this.vy = 120;
        this.vx *= 0.2;
        this.va *= 0.3;
      }
      return;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vy += GRAVITY * dt;
    this.angle += this.va * dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.y > H + this.r * 2 + 40) this.dead = true;
    if (this.x < -160 || this.x > W + 160) this.dead = true;
  }
}

/* ---------------- Stuecke (Haelften) ---------------- */

export class Piece {
  constructor() {
    this.active = false;
  }

  init(poly, offset, item, vx, vy, va) {
    this.poly = poly;
    this.off = offset;          // Schwerpunkt im lokalen Item-Raum
    this.visual = item;         // fuer die Darstellung (Farbe, Zahl, Emoji …)
    this.x = item.x + rotate(offset, item.angle).x;
    this.y = item.y + rotate(offset, item.angle).y;
    this.vx = vx;
    this.vy = vy;
    this.angle = item.angle;
    this.va = va;
    this.life = 1.6;
    this.cuts = 0;
    this.active = true;
    return this;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vy += GRAVITY * dt;
    this.angle += this.va * dt;
    this.life -= dt;
    if (this.life <= 0 || this.y > H + 160) this.active = false;
  }
}

/* ---------------- Partikel & Flecken ---------------- */

export class Particle {
  constructor() {
    this.active = false;
  }

  init(x, y, vx, vy, color, size, life) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.color = color;
    this.size = size;
    this.life = life;
    this.maxLife = life;
    this.active = true;
    return this;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vy += GRAVITY * 0.6 * dt;
    this.life -= dt;
    if (this.life <= 0) this.active = false;
  }
}

export class Pool {
  constructor(Klass, size) {
    this.items = [];
    for (let i = 0; i < size; i++) this.items.push(new Klass());
  }

  obtain() {
    for (const it of this.items) if (!it.active) return it;
    const fresh = new this.items[0].constructor();
    this.items.push(fresh);
    return fresh;
  }

  forEachActive(fn) {
    for (const it of this.items) if (it.active) fn(it);
  }

  clear() {
    for (const it of this.items) it.active = false;
  }
}
