/* Synthetischer Beispieldatensatz: eine Website mit Themenbereichen, Unterthemen und Beinahe-Duplikaten. */
import { mulberry32 } from './util.js';

const TOPICS = [
  ['garten', ['rasen', 'hochbeet', 'obstbaeume', 'kompost']],
  ['werkzeug', ['akkuschrauber', 'kreissaege', 'schleifer']],
  ['kochen', ['pasta', 'brot-backen', 'suppen', 'grillen']],
  ['reisen', ['italien', 'skandinavien', 'staedtetrip']],
  ['finanzen', ['tagesgeld', 'etf', 'steuern']],
  ['fahrrad', ['ebike', 'reparatur', 'touren']],
  ['wohnen', ['streichen', 'boden', 'beleuchtung']],
  ['gesundheit', ['schlaf', 'laufen', 'ernaehrung']],
  ['technik', ['smartphone', 'router', 'smart-home']],
  ['haustiere', ['hund', 'katze', 'aquarium']],
];
const WORDS = ['tipps', 'ratgeber', 'anleitung', 'test', 'vergleich', 'fehler', 'checkliste', 'kosten', 'ideen', 'fragen', 'anfaenger', 'profi'];

export function makeSample(n = 3000, d = 256) {
  const rnd = mulberry32(2026);
  const gauss = () => { const u = Math.max(rnd(), 1e-12), v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const vec = (scale) => { const v = new Float32Array(d); for (let k = 0; k < d; k++) v[k] = gauss() * scale; return v; };
  const topicV = TOPICS.map(() => vec(1));
  const subV = TOPICS.map(([, subs]) => subs.map(() => vec(0.75)));
  const X = new Float32Array(n * d);
  const urls = [], titles = [];
  const used = new Set();
  let i = 0;
  const put = (v, url, title) => {
    let norm = 0;
    for (let k = 0; k < d; k++) norm += v[k] * v[k];
    norm = 1 / Math.sqrt(norm);
    for (let k = 0; k < d; k++) X[i * d + k] = v[k] * norm;
    urls.push(url); titles.push(title); i++;
  };
  while (i < n) {
    const t = (rnd() * TOPICS.length) | 0;
    const [topic, subs] = TOPICS[t];
    const s = (rnd() * subs.length) | 0;
    const w1 = WORDS[(rnd() * WORDS.length) | 0], w2 = WORDS[(rnd() * WORDS.length) | 0];
    let slug = `${subs[s]}-${w1}${w1 !== w2 ? '-' + w2 : ''}`;
    let u = `https://www.beispiel-ratgeber.de/${topic}/${slug}/`;
    let c = 2;
    while (used.has(u)) u = `https://www.beispiel-ratgeber.de/${topic}/${slug}-${c++}/`;
    used.add(u);
    const noise = vec(0.9);
    const v = new Float32Array(d);
    for (let k = 0; k < d; k++) v[k] = topicV[t][k] + subV[t][s][k] + noise[k];
    const nice = (x) => x.replace(/-/g, ' ').replace(/ae/g, 'ä').replace(/oe/g, 'ö').replace(/ue/g, 'ü');
    const title = `${nice(subs[s])}: ${nice(w1)}${w1 !== w2 ? ' & ' + nice(w2) : ''}`.replace(/^./, (m) => m.toUpperCase());
    put(v, u, title);
    // Beinahe-Duplikate: Druckversion oder Parameter-URL
    if (i < n && rnd() < 0.03) {
      const dv = new Float32Array(d);
      for (let k = 0; k < d; k++) dv[k] = v[k] + gauss() * 0.08;
      put(dv, rnd() < 0.5 ? u + 'druckversion/' : u + '?ref=newsletter', title);
    }
  }
  return { n, d, X, urls, titles, origDim: d, skipped: { noVector: 0, wrongDim: 0, zero: 0, noUrl: 0 }, name: 'Beispieldaten' };
}

export function sampleCsv(ds, rows = 200) {
  const lines = ['Address,Title 1,Embeddings'];
  for (let i = 0; i < Math.min(rows, ds.n); i++) {
    const v = Array.from(ds.X.subarray(i * ds.d, i * ds.d + ds.d), (x) => x.toFixed(5));
    lines.push(`${ds.urls[i]},"${ds.titles[i].replace(/"/g, '""')}","[${v.join(',')}]"`);
  }
  return lines.join('\n');
}
