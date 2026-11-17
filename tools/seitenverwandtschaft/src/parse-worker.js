/* CSV-Import im Worker: streamt die Datei, erkennt Spalten, normiert Vektoren. */
'use strict';

self.onmessage = async (e) => {
  const m = e.data;
  if (m.type !== 'parse') return;
  try {
    await parseFile(m);
  } catch (err) {
    self.postMessage({ type: 'error', message: String((err && err.message) || err) });
  }
};

const URL_HEAD = /^(url|urls|address|adresse|seite|page|page[ _-]?url|loc|link|landing[ _-]?page)$/i;
const VEC_HEAD = /embed|vector|vektor/i;
const TITLE_HEAD = /^(title|titel|title ?1|seitentitel|page ?title|h1|h1-1|name)$/i;
const SPLIT = /[\s,;\[\]]+/;

function detectDelimiter(text) {
  const nl = text.search(/\r?\n/);
  const line = nl === -1 ? text : text.slice(0, nl);
  const counts = { ',': 0, ';': 0, '\t': 0, '|': 0 };
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') q = !q;
    else if (!q && ch in counts) counts[ch]++;
  }
  let best = ',', bc = -1;
  for (const k in counts) if (counts[k] > bc) { bc = counts[k]; best = k; }
  return best;
}

/* Zerlegt s in Zeilen; gibt den Index des ersten nicht verarbeiteten Zeichens zurück. */
function parseBuffer(s, final, D, emit) {
  const n = s.length;
  let i = 0;
  const row = [];
  outer: while (i < n) {
    row.length = 0;
    const rowStart = i;
    for (;;) {
      if (i < n && s.charCodeAt(i) === 34) { // Feld in Anführungszeichen
        let j = i + 1, seg = j, val = '';
        for (;;) {
          const k = s.indexOf('"', j);
          if (k === -1) {
            if (!final) return rowStart;
            val += s.slice(seg); i = n; break;
          }
          if (k + 1 >= n && !final) return rowStart;
          if (s.charCodeAt(k + 1) === 34) { val += s.slice(seg, k + 1); j = k + 2; seg = j; continue; }
          val += s.slice(seg, k); i = k + 1; break;
        }
        row.push(val);
        while (i < n) { const c = s.charCodeAt(i); if (c === D || c === 10 || c === 13) break; i++; }
      } else {
        let j = i;
        if (j < n && s.charCodeAt(j) === 91) { // [ ... ] ohne Anführungszeichen
          const k = s.indexOf(']', j);
          if (k === -1) { if (!final) return rowStart; j = n; } else j = k + 1;
        }
        while (j < n) { const c = s.charCodeAt(j); if (c === D || c === 10 || c === 13) break; j++; }
        if (j >= n && !final) return rowStart;
        row.push(s.slice(i, j));
        i = j;
      }
      if (i >= n) { emit(row); return n; }
      const c = s.charCodeAt(i);
      if (c === D) {
        i++;
        if (i >= n) { if (!final) return rowStart; row.push(''); emit(row); return n; }
        continue;
      }
      if (c === 13) {
        i++;
        if (i < n && s.charCodeAt(i) === 10) i++;
        else if (i >= n && !final) return rowStart;
      } else i++;
      emit(row);
      continue outer;
    }
  }
  return n;
}

function countNums(str) {
  if (!str) return 0;
  const parts = str.split(SPLIT);
  let c = 0;
  for (const p of parts) {
    if (p === '') continue;
    if (!Number.isFinite(Number(p))) return 0;
    c++;
  }
  return c;
}

function detectMapping(header, rows) {
  const nc = header.length;
  let vec = -1, vecScore = 0;
  for (let c = 0; c < nc; c++) {
    let ok = 0;
    for (const r of rows) if (countNums(r[c]) >= 8) ok++;
    const score = ok / rows.length + (VEC_HEAD.test(header[c]) ? 0.5 : 0);
    if (ok > 0 && score > vecScore) { vecScore = score; vec = c; }
  }
  let url = -1;
  for (let c = 0; c < nc; c++) if (c !== vec && URL_HEAD.test(header[c])) { url = c; break; }
  if (url === -1) {
    let best = 0;
    for (let c = 0; c < nc; c++) {
      if (c === vec) continue;
      let ok = 0;
      for (const r of rows) if (/^https?:\/\//i.test((r[c] || '').trim())) ok++;
      if (ok > best) { best = ok; url = c; }
    }
  }
  let vecCols = null;
  if (vec === -1) {
    // Vektor über viele Zahlenspalten verteilt?
    const numeric = [];
    for (let c = 0; c < nc; c++) {
      if (c === url) continue;
      let ok = true, any = false;
      for (const r of rows) {
        const v = (r[c] || '').trim();
        if (v === '') continue;
        any = true;
        if (!Number.isFinite(Number(v))) { ok = false; break; }
      }
      if (ok && any) numeric.push(c);
    }
    if (numeric.length >= 8) vecCols = numeric;
  }
  if (url === -1) url = vec === 0 ? (nc > 1 ? 1 : -1) : 0;
  let title = -1;
  for (let c = 0; c < nc; c++) if (c !== url && c !== vec && TITLE_HEAD.test(header[c])) { title = c; break; }
  return { url, title, vec, vecCols };
}

async function parseFile(m) {
  const file = m.file;
  let header = null, mapping = m.mapping || null, D = 44;
  const pending = [];
  let ready = false;
  let dim = 0, n = 0, cap = 0, X = null;
  const urls = [], titles = [];
  const skipped = { noVector: 0, wrongDim: 0, zero: 0, noUrl: 0 };
  let tmp = null;

  function grow() {
    const ncap = Math.max(1024, cap * 2);
    const nx = new Float32Array(ncap * dim);
    if (X) nx.set(X);
    X = nx; cap = ncap;
  }

  function store(row) {
    const u = mapping.url >= 0 ? (row[mapping.url] || '').trim() : '';
    if (!u) { skipped.noUrl++; return; }
    let vals;
    if (mapping.vecCols) {
      vals = mapping.vecCols.map((c) => Number(row[c]));
      if (vals.some((v) => !Number.isFinite(v))) { skipped.noVector++; return; }
    } else {
      const raw = row[mapping.vec];
      if (!raw) { skipped.noVector++; return; }
      const parts = raw.split(SPLIT);
      vals = [];
      for (const p of parts) {
        if (p === '') continue;
        const v = Number(p);
        if (!Number.isFinite(v)) { skipped.noVector++; return; }
        vals.push(v);
      }
      if (vals.length < 2) { skipped.noVector++; return; }
    }
    if (!dim) { dim = vals.length; tmp = new Float64Array(dim); }
    if (vals.length !== dim) { skipped.wrongDim++; return; }
    let norm = 0;
    for (let k = 0; k < dim; k++) { tmp[k] = vals[k]; norm += vals[k] * vals[k]; }
    if (!(norm > 0)) { skipped.zero++; return; }
    norm = 1 / Math.sqrt(norm);
    if (n === cap) grow();
    const o = n * dim;
    for (let k = 0; k < dim; k++) X[o + k] = tmp[k] * norm;
    urls.push(u);
    titles.push(mapping.title >= 0 ? (row[mapping.title] || '').trim() : '');
    n++;
  }

  function flushPending() {
    if (!mapping) mapping = detectMapping(header, pending);
    self.postMessage({ type: 'header', header, mapping, delimiter: String.fromCharCode(D) });
    if (!mapping.vecCols && mapping.vec < 0) throw new Error('Keine Spalte mit Embedding-Vektoren gefunden.');
    for (const r of pending) store(r);
    pending.length = 0;
  }

  function onRow(row) {
    if (!header) { header = row.map((h, i) => (i === 0 ? h.replace(/^﻿/, '') : h).trim()); return; }
    if (row.length === 1 && row[0].trim() === '') return;
    if (!ready) {
      pending.push(row.slice());
      if (pending.length >= 25) { flushPending(); ready = true; }
      return;
    }
    store(row);
  }

  const reader = file.stream().getReader();
  const dec = new TextDecoder('utf-8');
  let carry = '', read = 0, first = true, lastPost = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    read += value.byteLength;
    let text = carry + dec.decode(value, { stream: true });
    if (first) { D = detectDelimiter(text).charCodeAt(0); first = false; }
    const used = parseBuffer(text, false, D, onRow);
    carry = text.slice(used);
    const now = Date.now();
    if (now - lastPost > 200) { lastPost = now; self.postMessage({ type: 'progress', phase: 'read', value: read / file.size, rows: n }); }
  }
  const rest = carry + dec.decode();
  if (first) D = detectDelimiter(rest).charCodeAt(0);
  if (rest) parseBuffer(rest, true, D, onRow);
  if (!header) throw new Error('Die Datei ist leer.');
  if (!ready) flushPending();
  if (n < 2) throw new Error('Zu wenige gültige Zeilen mit Vektoren gefunden (' + n + ').');

  X = X.slice(0, n * dim);
  self.postMessage(
    { type: 'done', n, dim, X, urls, titles: titles.some(Boolean) ? titles : null, skipped, mapping, header },
    [X.buffer]
  );
}
