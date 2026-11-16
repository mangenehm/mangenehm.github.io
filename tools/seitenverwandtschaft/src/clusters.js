/* Cluster-Kennzahlen, Beschriftung und Ähnlichkeit zwischen Clustern. */
import { tokens } from './util.js';

export function buildClusters(ds, res) {
  const { n, d, urls, titles } = ds;
  const { asg, centerSim, csums, ccounts, k } = res;
  const members = Array.from({ length: k }, () => []);
  for (let i = 0; i < n; i++) members[asg[i]].push(i);

  // Begriffe je Seite → Dokumentfrequenz
  const toks = new Array(n);
  const df = new Map();
  for (let i = 0; i < n; i++) {
    toks[i] = tokens(urls[i], titles ? titles[i] : '');
    for (const t of toks[i]) df.set(t, (df.get(t) || 0) + 1);
  }

  const norms = new Float64Array(k);
  for (let c = 0; c < k; c++) {
    let s = 0;
    for (let q = 0; q < d; q++) s += csums[c * d + q] * csums[c * d + q];
    norms[c] = s;
  }

  const list = [];
  for (let c = 0; c < k; c++) {
    const m = members[c];
    if (!m.length) continue;
    m.sort((a, b) => centerSim[b] - centerSim[a]);
    const tf = new Map();
    for (const i of m) for (const t of toks[i]) tf.set(t, (tf.get(t) || 0) + 1);
    const scored = [];
    for (const [t, f] of tf) {
      if (f < Math.max(2, m.length * 0.15) && m.length > 3) continue;
      scored.push([t, (f / m.length) * Math.log(n / df.get(t))]);
    }
    scored.sort((a, b) => b[1] - a[1]);
    const words = scored.slice(0, 3).map((x) => x[0]);
    const cnt = m.length;
    const cohesion = cnt > 1 ? (norms[c] - cnt) / (cnt * (cnt - 1)) : 1;
    list.push({ id: c, size: cnt, members: m, label: words.length ? words.join(' · ') : `Cluster ${c + 1}`, cohesion });
  }
  list.sort((a, b) => b.size - a.size);
  list.forEach((c, i) => { c.rank = i; c.name = `C${i + 1}`; });
  const byId = new Map(list.map((c) => [c.id, c]));

  // Mittlere Ähnlichkeit zwischen Clustern exakt aus den Zentrumssummen:
  // mean_{i∈A, j∈B} x_i·x_j = (S_A · S_B) / (|A| |B|)
  const m = list.length;
  const between = new Float32Array(m * m);
  for (let a = 0; a < m; a++) {
    const A = list[a];
    for (let b = a; b < m; b++) {
      const B = list[b];
      let v;
      if (a === b) v = A.cohesion;
      else {
        let s = 0;
        const ao = A.id * d, bo = B.id * d;
        for (let q = 0; q < d; q++) s += csums[ao + q] * csums[bo + q];
        v = s / (A.size * B.size);
      }
      between[a * m + b] = v; between[b * m + a] = v;
    }
  }
  return { list, byId, between, pageCluster: (i) => byId.get(asg[i]) };
}

/* Reihenfolge, in der ähnliche Elemente nebeneinander liegen (gierige Nachbarkette). */
export function chainOrder(m, simAt) {
  if (m <= 2) return Array.from({ length: m }, (_, i) => i);
  const used = new Uint8Array(m);
  const order = [0];
  used[0] = 1;
  for (let s = 1; s < m; s++) {
    const last = order[order.length - 1];
    let best = -1, bv = -Infinity;
    for (let j = 0; j < m; j++) if (!used[j]) { const v = simAt(last, j); if (v > bv) { bv = v; best = j; } }
    used[best] = 1; order.push(best);
  }
  return order;
}
