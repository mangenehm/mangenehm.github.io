/* Hot-Seat-Sichtschutz: Gerät übergeben, damit niemand fremde Tiere sieht. */

import { el, $, esc } from './dom.js';

export function coverScreen(root, { name, title = '', info = '', icon = '🙈', button = 'Los geht’s', onReady }) {
  const node = el(`
    <section class="screen cover">
      <div class="cover-card">
        <div class="cover-icon" aria-hidden="true"><span class="emoji">📱</span><span class="emoji hand">👉</span></div>
        <h2>${esc(name)}</h2>
        ${title ? `<p class="cover-title">${esc(title)}</p>` : ''}
        ${info ? `<p class="cover-info small">${esc(info)}</p>` : ''}
        <button class="btn block big-btn" data-act="ready"><b class="emoji">${esc(icon)}</b> ${esc(button)}</button>
      </div>
    </section>`);
  $(node, '[data-act=ready]').onclick = onReady;
  root.appendChild(node);
  $(node, '[data-act=ready]').focus();
  return {};
}
