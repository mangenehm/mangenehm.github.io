/* Hot-Seat-Sichtschutz: Gerät übergeben, damit niemand fremde Tiere sieht. */

import { el, $, esc } from './dom.js';

export function coverScreen(root, { name, title = '', info = '', button = 'Los geht’s', onReady }) {
  const node = el(`
    <section class="screen cover">
      <div class="cover-card">
        <div class="cover-icon" aria-hidden="true">🙈</div>
        <p class="muted">Gerät an</p>
        <h2>${esc(name)}</h2>
        <p class="muted">übergeben</p>
        ${title ? `<p class="cover-title">${esc(title)}</p>` : ''}
        ${info ? `<p class="cover-info small">${esc(info)}</p>` : ''}
        <button class="btn block" data-act="ready">${esc(button)}</button>
      </div>
    </section>`);
  $(node, '[data-act=ready]').onclick = onReady;
  root.appendChild(node);
  $(node, '[data-act=ready]').focus();
  return {};
}
