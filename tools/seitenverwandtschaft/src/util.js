export function mulberry32(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const nf = new Intl.NumberFormat('de-DE');
export const fmtInt = (v) => nf.format(v);
export const fmtSim = (v) => (Number.isFinite(v) ? v.toFixed(3).replace('.', ',') : '–');

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/* Kurze Darstellung einer URL: nur der Pfad, wenn alle Seiten dieselbe Domain haben. */
export function makeShortener(urls) {
  let host = null, same = true;
  const step = Math.max(1, Math.floor(urls.length / 500));
  for (let i = 0; i < urls.length && same; i += step) {
    const m = urls[i].match(/^https?:\/\/([^/?#]+)/i);
    const h = m ? m[1].toLowerCase() : '';
    if (host === null) host = h; else if (h !== host) same = false;
  }
  return (u) => {
    if (!same) return u.replace(/^https?:\/\//i, '');
    const m = u.match(/^https?:\/\/[^/]+(.*)$/i);
    return m ? (m[1] || '/') : u;
  };
}

export function download(name, text) {
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export function csvCell(v) {
  const s = String(v);
  return /[",;\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
