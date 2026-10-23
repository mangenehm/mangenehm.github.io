/* Kleine DOM-Helfer. Namen und Adressen kommen teils vom Gegner – immer escapen. */

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** HTML-String → Element (erstes Kind). */
export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export const $ = (root, sel) => root.querySelector(sel);
export const $$ = (root, sel) => [...root.querySelectorAll(sel)];

export function vibrate(pattern) {
  try { navigator.vibrate?.(pattern); } catch { /* egal */ }
}

export function store(key, value) {
  try {
    if (value === undefined) return JSON.parse(localStorage.getItem('tierversteck:' + key) ?? 'null');
    localStorage.setItem('tierversteck:' + key, JSON.stringify(value));
  } catch { return null; }
}

export function toast(text, ms = 2600) {
  const t = el(`<div class="toast" role="status">${esc(text)}</div>`);
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms);
}
