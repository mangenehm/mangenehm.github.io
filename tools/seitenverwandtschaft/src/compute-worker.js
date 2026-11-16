/* Rechen-Worker: Ähnlichkeits-Kacheln, k-means-Zuordnung, PCA und Kartenlayout.
   Alle Vektoren sind L2-normiert, Kosinus-Ähnlichkeit = Skalarprodukt. */
'use strict';

let part = null;   // Float32Array der eigenen Zeilen (für assign/pca)
let partN = 0;
let D = 0;

self.onmessage = (e) => {
  const m = e.data;
  try {
    switch (m.type) {
      case 'tile': return tile(m);
      case 'load':
        part = m.X; partN = m.n; D = m.d;
        return self.postMessage({ id: m.id });
      case 'sum': return sum(m);
      case 'assign': return assign(m);
      case 'pca': return pca(m);
      case 'layout': return layout(m);
      default: throw new Error('Unbekannter Auftrag ' + m.type);
    }
  } catch (err) {
    self.postMessage({ id: m.id, error: String((err && err.message) || err) });
  }
};

/* ---------- Top-K je Zeile (absteigend sortiert) ---------- */
function makeTop(n, K) {
  const idx = new Int32Array(n * K).fill(-1);
  const sc = new Float32Array(n * K).fill(-Infinity);
  const min = new Float32Array(n).fill(-Infinity);
  return { idx, sc, min, K };
}
function topInsert(t, r, g, s) {
  const K = t.K, base = r * K, sc = t.sc, idx = t.idx;
  let p = K - 1;
  while (p > 0 && sc[base + p - 1] < s) {
    sc[base + p] = sc[base + p - 1];
    idx[base + p] = idx[base + p - 1];
    p--;
  }
  sc[base + p] = s;
  idx[base + p] = g;
  t.min[r] = sc[base + K - 1];
}

/* ---------- Kachel: Block A gegen Block B (oder A gegen sich selbst) ---------- */
function tile(m) {
  const d = m.d, K = m.K, A = m.A, aStart = m.aStart;
  const diag = !m.B;
  const B = diag ? A : m.B, bStart = diag ? aStart : m.bStart;
  const na = A.length / d, nb = B.length / d;
  const tA = makeTop(na, K);
  const tB = diag ? tA : makeTop(nb, K);
  const maxPairs = m.maxPairs;
  let thr = m.thr;
  let pa = new Int32Array(1024), pb = new Int32Array(1024), ps = new Float32Array(1024), np = 0;

  const minA = tA.min, minB = tB.min;
  function hit(i, j, s) {
    if (s > minA[i]) topInsert(tA, i, bStart + j, s);
    if (s > minB[j]) topInsert(tB, j, aStart + i, s);
    if (s >= thr) {
      if (np === pa.length) {
        if (np >= 2 * maxPairs) { trim(); if (s < thr) return; }
        else {
          const n2 = np * 2;
          const qa = new Int32Array(n2); qa.set(pa); pa = qa;
          const qb = new Int32Array(n2); qb.set(pb); pb = qb;
          const qs = new Float32Array(n2); qs.set(ps); ps = qs;
        }
      }
      pa[np] = aStart + i; pb[np] = bStart + j; ps[np] = s; np++;
    }
  }
  // Behalte nur die besten maxPairs Paare und hebe die Schwelle an.
  function trim() {
    const order = Array.from({ length: np }, (_, k) => k).sort((x, y) => ps[y] - ps[x]);
    const keep = Math.min(maxPairs, np);
    const qa = new Int32Array(pa.length), qb = new Int32Array(pb.length), qs = new Float32Array(ps.length);
    for (let k = 0; k < keep; k++) { const o = order[k]; qa[k] = pa[o]; qb[k] = pb[o]; qs[k] = ps[o]; }
    pa = qa; pb = qb; ps = qs; np = keep;
    thr = Math.max(thr, ps[keep - 1] + 1e-7);
  }

  let lastPost = Date.now();
  for (let i = 0; i < na; i++) {
    const ao = i * d;
    let j = diag ? i + 1 : 0;
    for (; j + 3 < nb; j += 4) {
      const b0 = j * d, b1 = b0 + d, b2 = b1 + d, b3 = b2 + d;
      let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
      for (let k = 0; k < d; k++) {
        const a = A[ao + k];
        s0 += a * B[b0 + k];
        s1 += a * B[b1 + k];
        s2 += a * B[b2 + k];
        s3 += a * B[b3 + k];
      }
      hit(i, j, s0); hit(i, j + 1, s1); hit(i, j + 2, s2); hit(i, j + 3, s3);
    }
    for (; j < nb; j++) {
      const bo = j * d;
      let s = 0;
      for (let k = 0; k < d; k++) s += A[ao + k] * B[bo + k];
      hit(i, j, s);
    }
    if ((i & 31) === 31) {
      const now = Date.now();
      if (now - lastPost > 250) { lastPost = now; self.postMessage({ id: m.id, progress: (i + 1) / na }); }
    }
  }
  if (np > maxPairs) trim();
  const out = {
    id: m.id,
    a: { idx: tA.idx, sc: tA.sc },
    b: diag ? null : { idx: tB.idx, sc: tB.sc },
    pairs: { a: pa.slice(0, np), b: pb.slice(0, np), s: ps.slice(0, np) },
    thr,
  };
  const tr = [tA.idx.buffer, tA.sc.buffer, out.pairs.a.buffer, out.pairs.b.buffer, out.pairs.s.buffer];
  if (!diag) tr.push(tB.idx.buffer, tB.sc.buffer);
  self.postMessage(out, tr);
}

/* ---------- Spaltensumme der eigenen Zeilen ---------- */
function sum(m) {
  const s = new Float64Array(D);
  for (let i = 0; i < partN; i++) {
    const o = i * D;
    for (let k = 0; k < D; k++) s[k] += part[o + k];
  }
  self.postMessage({ id: m.id, sum: s }, [s.buffer]);
}

/* ---------- k-means: nächstes Zentrum je Zeile + Teilsummen ---------- */
function assign(m) {
  const C = m.C, k = m.k, d = D;
  const asg = new Int32Array(partN), best = new Float32Array(partN);
  const sums = new Float64Array(k * d), counts = new Int32Array(k);
  for (let i = 0; i < partN; i++) {
    const o = i * d;
    let bi = 0, bs = -Infinity, c = 0;
    for (; c + 1 < k; c += 2) {
      const c0 = c * d, c1 = c0 + d;
      let s0 = 0, s1 = 0;
      for (let q = 0; q < d; q++) { const x = part[o + q]; s0 += x * C[c0 + q]; s1 += x * C[c1 + q]; }
      if (s0 > bs) { bs = s0; bi = c; }
      if (s1 > bs) { bs = s1; bi = c + 1; }
    }
    for (; c < k; c++) {
      const c0 = c * d; let s = 0;
      for (let q = 0; q < d; q++) s += part[o + q] * C[c0 + q];
      if (s > bs) { bs = s; bi = c; }
    }
    asg[i] = bi; best[i] = bs; counts[bi]++;
    const so = bi * d;
    for (let q = 0; q < d; q++) sums[so + q] += part[o + q];
  }
  self.postMessage({ id: m.id, asg, best, sums, counts }, [asg.buffer, best.buffer, sums.buffer, counts.buffer]);
}

/* ---------- PCA: W = Xcᵀ (Xc V) für 2 Komponenten, optional Projektion ---------- */
function pca(m) {
  const d = D, mean = m.mean, V = m.V; // V: 2*d, Komponente c bei c*d
  const W = new Float64Array(2 * d);
  const proj = m.project ? new Float32Array(partN * 2) : null;
  for (let i = 0; i < partN; i++) {
    const o = i * d;
    let p0 = 0, p1 = 0;
    for (let k = 0; k < d; k++) { const x = part[o + k] - mean[k]; p0 += x * V[k]; p1 += x * V[d + k]; }
    if (proj) { proj[2 * i] = p0; proj[2 * i + 1] = p1; }
    else {
      for (let k = 0; k < d; k++) { const x = part[o + k] - mean[k]; W[k] += x * p0; W[d + k] += x * p1; }
    }
  }
  if (proj) self.postMessage({ id: m.id, proj }, [proj.buffer]);
  else self.postMessage({ id: m.id, W }, [W.buffer]);
}

/* ---------- Nachbarschafts-Layout (UMAP-artige Optimierung auf dem k-NN-Graphen) ---------- */
function layout(m) {
  const n = m.n, Y = m.Y, head = m.head, tail = m.tail, w = m.w, E = m.epochs;
  const ne = head.length;
  const a = 1.577, b = 0.895, negRate = 5;
  let seed = m.seed >>> 0 || 1;
  const rand = () => {
    seed = (seed + 0x6D2B79F5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const clip = (v) => (v > 4 ? 4 : v < -4 ? -4 : v);
  let lastPost = Date.now();
  for (let ep = 0; ep < E; ep++) {
    const alpha = 1 - ep / E;
    for (let e = 0; e < ne; e++) {
      if (rand() > w[e]) continue;
      const i = head[e], j = tail[e];
      const i2 = 2 * i, j2 = 2 * j;
      let dx = Y[i2] - Y[j2], dy = Y[i2 + 1] - Y[j2 + 1];
      let d2 = dx * dx + dy * dy;
      if (d2 > 0) {
        const g = (-2 * a * b * Math.pow(d2, b - 1)) / (a * Math.pow(d2, b) + 1);
        const gx = clip(g * dx) * alpha, gy = clip(g * dy) * alpha;
        Y[i2] += gx; Y[i2 + 1] += gy; Y[j2] -= gx; Y[j2 + 1] -= gy;
      }
      for (let q = 0; q < negRate; q++) {
        const k = (rand() * n) | 0;
        if (k === i) continue;
        const k2 = 2 * k;
        dx = Y[i2] - Y[k2]; dy = Y[i2 + 1] - Y[k2 + 1];
        d2 = dx * dx + dy * dy;
        if (d2 > 0) {
          const g = (2 * b) / ((0.001 + d2) * (a * Math.pow(d2, b) + 1));
          Y[i2] += clip(g * dx) * alpha; Y[i2 + 1] += clip(g * dy) * alpha;
        }
      }
    }
    const now = Date.now();
    if (now - lastPost > 250) { lastPost = now; self.postMessage({ id: m.id, progress: (ep + 1) / E }); }
  }
  self.postMessage({ id: m.id, Y }, [Y.buffer]);
}
