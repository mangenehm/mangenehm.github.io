/* Ablaufsteuerung der Berechnung: Ähnlichkeiten, k-means, PCA, Layout. */
import { Pool } from './pool.js';
import { mulberry32 } from './util.js';

export function defaultK(n) {
  return Math.max(2, Math.min(200, Math.round(Math.sqrt(n / 2))));
}

export async function analyze(ds, opts, report) {
  const { n, d, X } = ds;
  const W = Math.max(1, Math.min(8, navigator.hardwareConcurrency || 4));
  const pool = new Pool(W);
  const onAbort = () => pool.terminate();
  opts.signal.addEventListener('abort', onAbort);
  const t0 = performance.now();
  try {
    const sim = await similarity(pool, ds, opts, (f) => report('Ähnlichkeiten berechnen', f * 0.72));
    check(opts.signal);
    await loadPartitions(pool, ds);
    const k = Math.min(opts.k || defaultK(n), n);
    const km = await kmeans(pool, ds, k, (f) => report('Themencluster bilden', 0.72 + f * 0.12), opts.signal);
    check(opts.signal);
    report('Karte berechnen (PCA)', 0.85);
    const pcaXY = await pca(pool, ds);
    check(opts.signal);
    const nbXY = await layout(pool, n, sim.top, opts.K, pcaXY, (f) => report('Karte berechnen (Nachbarschaft)', 0.87 + f * 0.13));
    return { ...sim, ...km, k, pcaXY, nbXY, seconds: (performance.now() - t0) / 1000, workers: W };
  } finally {
    opts.signal.removeEventListener('abort', onAbort);
    pool.terminate();
  }
}

function check(signal) {
  if (signal.aborted) throw new Error('abgebrochen');
}

/* ---------- Ähnlichkeiten: Kacheln über die obere Dreiecksmatrix ---------- */
async function similarity(pool, ds, opts, progress) {
  const { n, d, X } = ds;
  const K = Math.min(opts.K, n - 1);
  const BS = Math.max(256, Math.min(2048, Math.round(Math.sqrt(1.5e9 / d) / 64) * 64));
  const nb = Math.ceil(n / BS);
  const tasks = [];
  for (let bi = 0; bi < nb; bi++) for (let bj = bi; bj < nb; bj++) tasks.push([bi, bj]);
  // Größte Kacheln zuerst, damit am Ende keine lange Kachel allein läuft.
  const size = (b) => Math.min(BS, n - b * BS);
  const weight = ([bi, bj]) => (bi === bj ? (size(bi) * size(bi)) / 2 : size(bi) * size(bj));
  tasks.sort((x, y) => weight(y) - weight(x));
  const total = tasks.reduce((s, t) => s + weight(t), 0);

  const top = { idx: new Int32Array(n * K).fill(-1), sc: new Float32Array(n * K).fill(-Infinity), min: new Float32Array(n).fill(-Infinity), K };
  let thr = opts.thr;
  const maxPairs = opts.maxPairs;
  let chunks = [], count = 0, truncated = false;
  let done = 0;
  const partial = new Map();

  const consolidate = () => {
    const all = concatPairs(chunks);
    const order = sortedOrder(all.s);
    const keep = Math.min(maxPairs, order.length);
    const out = { a: new Int32Array(keep), b: new Int32Array(keep), s: new Float32Array(keep) };
    for (let i = 0; i < keep; i++) { const o = order[i]; out.a[i] = all.a[o]; out.b[i] = all.b[o]; out.s[i] = all.s[o]; }
    if (order.length > maxPairs) { truncated = true; thr = Math.max(thr, out.s[keep - 1]); }
    chunks = [out]; count = keep;
    return out;
  };

  const slice = (b) => X.slice(b * BS * d, Math.min(n, (b + 1) * BS) * d);
  const merge = (t, start, cnt) => {
    for (let r = 0; r < cnt; r++) {
      const g = start + r;
      for (let q = 0; q < t.K; q++) {
        const s = t.sc[r * t.K + q];
        if (!(s > top.min[g])) break;
        insertTop(top, g, t.idx[r * t.K + q], s);
      }
    }
  };

  await pool.queue(
    tasks.length,
    (ti) => {
      const [bi, bj] = tasks[ti];
      const A = slice(bi);
      const msg = { type: 'tile', A, aStart: bi * BS, d, K, thr, maxPairs };
      const tr = [A.buffer];
      if (bi !== bj) { const B = slice(bj); msg.B = B; msg.bStart = bj * BS; tr.push(B.buffer); }
      return [msg, tr];
    },
    (res, ti) => {
      const [bi, bj] = tasks[ti];
      merge({ idx: res.a.idx, sc: res.a.sc, K }, bi * BS, size(bi));
      if (res.b) merge({ idx: res.b.idx, sc: res.b.sc, K }, bj * BS, size(bj));
      if (res.pairs.s.length) {
        chunks.push(res.pairs); count += res.pairs.s.length;
        if (res.thr > opts.thr && res.pairs.s.length >= maxPairs) truncated = true;
        if (count > 2 * maxPairs) consolidate();
      }
      partial.delete(ti);
      done += weight(tasks[ti]);
      progress(done / total);
    },
    (ti, p) => {
      partial.set(ti, p * weight(tasks[ti]));
      let s = done;
      for (const v of partial.values()) s += v;
      progress(s / total);
    }
  );
  const pairs = consolidate();
  if (pairs.s.length >= maxPairs) truncated = true;
  return { top: { idx: top.idx, sc: top.sc, K }, pairs, pairThr: truncated ? pairs.s[pairs.s.length - 1] : opts.thr, pairsTruncated: truncated };
}

function insertTop(t, r, g, s) {
  const K = t.K, base = r * K;
  let p = K - 1;
  while (p > 0 && t.sc[base + p - 1] < s) {
    t.sc[base + p] = t.sc[base + p - 1];
    t.idx[base + p] = t.idx[base + p - 1];
    p--;
  }
  t.sc[base + p] = s; t.idx[base + p] = g;
  t.min[r] = t.sc[base + K - 1];
}

function concatPairs(chunks) {
  let total = 0;
  for (const c of chunks) total += c.s.length;
  const out = { a: new Int32Array(total), b: new Int32Array(total), s: new Float32Array(total) };
  let o = 0;
  for (const c of chunks) { out.a.set(c.a, o); out.b.set(c.b, o); out.s.set(c.s, o); o += c.s.length; }
  return out;
}

function sortedOrder(s) {
  const order = new Uint32Array(s.length);
  for (let i = 0; i < order.length; i++) order[i] = i;
  return order.sort((x, y) => s[y] - s[x]);
}

/* ---------- Partitionen: jede Worker-Instanz hält einen Zeilenbereich ---------- */
async function loadPartitions(pool, ds) {
  const { n, d, X } = ds;
  const W = pool.size;
  const per = Math.ceil(n / W);
  pool.parts = [];
  await pool.broadcast((w) => {
    const start = Math.min(n, w * per), end = Math.min(n, start + per);
    pool.parts.push([start, end]);
    const part = X.slice(start * d, end * d);
    return [{ type: 'load', X: part, n: end - start, d }, [part.buffer]];
  });
}

/* ---------- Sphärisches k-means mit k-means++-Start auf einer Stichprobe ---------- */
async function kmeans(pool, ds, k, progress, signal) {
  const { n, d, X } = ds;
  const rnd = mulberry32(42);
  const sampleN = Math.min(n, Math.max(3000, k * 30));
  const sample = new Int32Array(sampleN);
  if (sampleN === n) for (let i = 0; i < n; i++) sample[i] = i;
  else {
    const seen = new Set();
    let c = 0;
    while (c < sampleN) { const i = (rnd() * n) | 0; if (!seen.has(i)) { seen.add(i); sample[c++] = i; } }
  }
  const C = new Float32Array(k * d);
  const bestSim = new Float32Array(sampleN).fill(-Infinity);
  let pick = sample[(rnd() * sampleN) | 0];
  for (let c = 0; c < k; c++) {
    C.set(X.subarray(pick * d, pick * d + d), c * d);
    let total = 0;
    const dist = new Float64Array(sampleN);
    for (let s = 0; s < sampleN; s++) {
      const o = sample[s] * d, co = c * d;
      let v = 0;
      for (let q = 0; q < d; q++) v += X[o + q] * C[co + q];
      if (v > bestSim[s]) bestSim[s] = v;
      const dd = Math.max(0, 1 - bestSim[s]);
      dist[s] = dd * dd; total += dist[s];
    }
    let r = rnd() * total;
    pick = sample[sampleN - 1];
    for (let s = 0; s < sampleN; s++) { r -= dist[s]; if (r <= 0) { pick = sample[s]; break; } }
    if (c % 10 === 0) { progress(0.15 * (c / k)); await new Promise((r2) => setTimeout(r2)); }
  }

  const asg = new Int32Array(n).fill(-1), best = new Float32Array(n);
  let sums = null, counts = null;
  const maxIter = 25;
  for (let it = 0; it < maxIter; it++) {
    check(signal);
    const res = await pool.broadcast(() => {
      const c = C.slice();
      return [{ type: 'assign', C: c, k }, [c.buffer]];
    });
    sums = new Float64Array(k * d); counts = new Int32Array(k);
    let changed = 0;
    res.forEach((r, w) => {
      const [start] = pool.parts[w];
      for (let i = 0; i < r.asg.length; i++) {
        const g = start + i;
        if (asg[g] !== r.asg[i]) changed++;
        asg[g] = r.asg[i]; best[g] = r.best[i];
      }
      for (let q = 0; q < sums.length; q++) sums[q] += r.sums[q];
      for (let c = 0; c < k; c++) counts[c] += r.counts[c];
    });
    // Neue Zentren; leere Cluster mit der schlechtest passenden Seite neu besetzen.
    const empties = [];
    for (let c = 0; c < k; c++) {
      if (counts[c] === 0) { empties.push(c); continue; }
      let norm = 0;
      for (let q = 0; q < d; q++) norm += sums[c * d + q] * sums[c * d + q];
      norm = 1 / Math.sqrt(norm || 1);
      for (let q = 0; q < d; q++) C[c * d + q] = sums[c * d + q] * norm;
    }
    if (empties.length) {
      const order = Array.from(best.keys()).sort((a, b) => best[a] - best[b]);
      empties.forEach((c, e) => { const p = order[e]; C.set(X.subarray(p * d, p * d + d), c * d); });
    }
    progress(0.15 + 0.85 * ((it + 1) / maxIter));
    if (!empties.length && it > 0 && changed <= n * 0.002) break;
  }
  progress(1);
  return { asg, centerSim: best, csums: sums, ccounts: counts };
}

/* ---------- PCA (2 Komponenten) per Potenziteration ---------- */
async function pca(pool, ds) {
  const { n, d } = ds;
  const sums = await pool.broadcast(() => [{ type: 'sum' }, []]);
  const mean = new Float64Array(d);
  for (const r of sums) for (let q = 0; q < d; q++) mean[q] += r.sum[q];
  for (let q = 0; q < d; q++) mean[q] /= n;
  const rnd = mulberry32(7);
  let V = new Float64Array(2 * d);
  for (let q = 0; q < V.length; q++) V[q] = rnd() - 0.5;
  orthonormalize(V, d);
  for (let it = 0; it < 15; it++) {
    const res = await pool.broadcast(() => [{ type: 'pca', mean, V }, []]);
    const Wm = new Float64Array(2 * d);
    for (const r of res) for (let q = 0; q < Wm.length; q++) Wm[q] += r.W[q];
    orthonormalize(Wm, d);
    V = Wm;
  }
  const res = await pool.broadcast(() => [{ type: 'pca', mean, V, project: true }, []]);
  const XY = new Float32Array(n * 2);
  res.forEach((r, w) => XY.set(r.proj, pool.parts[w][0] * 2));
  return XY;
}

function orthonormalize(V, d) {
  let n0 = 0;
  for (let q = 0; q < d; q++) n0 += V[q] * V[q];
  n0 = Math.sqrt(n0) || 1;
  for (let q = 0; q < d; q++) V[q] /= n0;
  let dot = 0;
  for (let q = 0; q < d; q++) dot += V[q] * V[d + q];
  for (let q = 0; q < d; q++) V[d + q] -= dot * V[q];
  let n1 = 0;
  for (let q = 0; q < d; q++) n1 += V[d + q] * V[d + q];
  n1 = Math.sqrt(n1) || 1;
  for (let q = 0; q < d; q++) V[d + q] /= n1;
}

/* ---------- Nachbarschafts-Layout: unscharfer k-NN-Graph wie bei UMAP ---------- */
async function layout(pool, n, top, Kwant, init, progress) {
  const K = top.K, Kl = Math.min(K, 15, n - 1);
  const target = Math.log2(Kl + 1);
  const map = new Map();
  const dist = new Float64Array(Kl);
  for (let i = 0; i < n; i++) {
    let rho = Infinity, cnt = 0;
    for (let q = 0; q < Kl; q++) {
      const j = top.idx[i * K + q];
      if (j < 0) break;
      dist[q] = Math.max(0, 1 - top.sc[i * K + q]);
      if (dist[q] < rho) rho = dist[q];
      cnt++;
    }
    if (!cnt) continue;
    let lo = 0, hi = Infinity, sigma = 1;
    for (let it = 0; it < 64; it++) {
      let s = 0;
      for (let q = 0; q < cnt; q++) s += Math.exp(-Math.max(0, dist[q] - rho) / sigma);
      if (Math.abs(s - target) < 1e-5) break;
      if (s > target) { hi = sigma; sigma = (lo + hi) / 2; }
      else { lo = sigma; sigma = hi === Infinity ? sigma * 2 : (lo + hi) / 2; }
    }
    sigma = Math.max(sigma, 1e-3 * 0.05);
    for (let q = 0; q < cnt; q++) {
      const j = top.idx[i * K + q];
      const w = Math.exp(-Math.max(0, dist[q] - rho) / sigma);
      const a = Math.min(i, j), b = Math.max(i, j);
      const key = a * n + b;
      const prev = map.get(key);
      map.set(key, prev === undefined ? w : prev + w - prev * w);
    }
  }
  const ne = map.size;
  const head = new Int32Array(ne), tail = new Int32Array(ne), w = new Float32Array(ne);
  let e = 0, maxw = 0;
  for (const [key, v] of map) {
    head[e] = Math.floor(key / n); tail[e] = key - head[e] * n; w[e] = v;
    if (v > maxw) maxw = v;
    e++;
  }
  for (let q = 0; q < ne; q++) w[q] /= maxw || 1;

  // Start: PCA-Koordinaten auf etwa ±10 skaliert.
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += init[2 * i]; my += init[2 * i + 1]; }
  mx /= n; my /= n;
  let ext = 0;
  for (let i = 0; i < n; i++) ext = Math.max(ext, Math.abs(init[2 * i] - mx), Math.abs(init[2 * i + 1] - my));
  const sc = 10 / (ext || 1);
  const rnd = mulberry32(3);
  const Y = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    Y[2 * i] = (init[2 * i] - mx) * sc + (rnd() - 0.5) * 0.01;
    Y[2 * i + 1] = (init[2 * i + 1] - my) * sc + (rnd() - 0.5) * 0.01;
  }
  const epochs = n < 5000 ? 300 : n < 20000 ? 200 : 140;
  const res = await pool.call(0, { type: 'layout', n, Y, head, tail, w, epochs, seed: 11 }, [Y.buffer, head.buffer, tail.buffer, w.buffer], progress);
  progress(1);
  return res.Y;
}
