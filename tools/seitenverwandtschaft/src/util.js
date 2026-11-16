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
export const fmtSec = (s) => (s < 60 ? `${s.toFixed(1).replace('.', ',')} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`);

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/* Kurze Darstellung einer URL: Pfad ohne Protokoll/Domain, falls alle dieselbe Domain haben. */
export function makeShortener(urls) {
  let host = null, same = true;
  for (let i = 0; i < urls.length && same; i += Math.max(1, Math.floor(urls.length / 500))) {
    const h = hostOf(urls[i]);
    if (host === null) host = h; else if (h !== host) same = false;
  }
  return (u) => {
    if (!same) return u.replace(/^https?:\/\//i, '');
    const m = u.match(/^https?:\/\/[^/]+(.*)$/i);
    return m ? (m[1] || '/') : u;
  };
}
function hostOf(u) {
  const m = u.match(/^https?:\/\/([^/?#]+)/i);
  return m ? m[1].toLowerCase() : '';
}

const STOP = new Set(('www html htm php aspx asp index de en com net org http https amp utm ref page seite ' +
  'und der die das den dem des ein eine einer eines mit von für fur auf aus bei im in ist zu zum zur am an als auch oder wie was wer ' +
  'the and for with from your you our are how what why new neu').split(' '));

export function tokens(url, title) {
  const out = new Set();
  const path = url.replace(/^https?:\/\/[^/]+/i, '').replace(/[?#].*$/, '');
  for (const t of path.toLowerCase().split(/[^a-zäöüß0-9]+/)) if (t.length > 2 && !STOP.has(t) && !/^\d+$/.test(t)) out.add(t);
  if (title) for (const t of title.toLowerCase().split(/[^a-zäöüß0-9]+/)) if (t.length > 2 && !STOP.has(t) && !/^\d+$/.test(t)) out.add(t);
  return out;
}

export function download(name, text, type = 'text/csv;charset=utf-8') {
  const blob = new Blob(['﻿' + text], { type });
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

/* Sequenzielle Farbskala (eine Farbe, hell → dunkel). */
const RAMP_LIGHT = ['#f4f8fd', '#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];
const RAMP_DARK = ['#1f2329', '#132c4d', '#104281', '#184f95', '#256abf', '#3987e5', '#6da7ec', '#b7d3f6'];
function hexToRgb(h) { const v = parseInt(h.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
let rampCache = null, rampDark = null;
export function isDark() {
  const t = document.documentElement.dataset.theme;
  if (t === 'dark') return true;
  if (t === 'light') return false;
  return matchMedia('(prefers-color-scheme: dark)').matches;
}
export function rampColor(t) {
  const dark = isDark();
  if (!rampCache || rampDark !== dark) { rampCache = (dark ? RAMP_DARK : RAMP_LIGHT).map(hexToRgb); rampDark = dark; }
  const x = Math.max(0, Math.min(1, t)) * (rampCache.length - 1);
  const i = Math.min(rampCache.length - 2, Math.floor(x)), f = x - i;
  const a = rampCache[i], b = rampCache[i + 1];
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * f)},${Math.round(a[1] + (b[1] - a[1]) * f)},${Math.round(a[2] + (b[2] - a[2]) * f)})`;
}
export function rampGradientCss() {
  const r = isDark() ? RAMP_DARK : RAMP_LIGHT;
  return `linear-gradient(90deg, ${r.join(', ')})`;
}

export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/* Gemeinsamer Tooltip */
let tipEl = null;
export function showTip(html, x, y) {
  if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'tip'; document.body.appendChild(tipEl); }
  tipEl.innerHTML = html;
  tipEl.hidden = false;
  const r = tipEl.getBoundingClientRect();
  let left = x + 14, top = y + 14;
  if (left + r.width > innerWidth - 8) left = x - r.width - 14;
  if (top + r.height > innerHeight - 8) top = y - r.height - 14;
  tipEl.style.left = Math.max(8, left) + 'px';
  tipEl.style.top = Math.max(8, top) + 'px';
}
export function hideTip() { if (tipEl) tipEl.hidden = true; }
