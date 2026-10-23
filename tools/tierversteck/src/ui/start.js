/* Startbildschirm: Modus wählen, Regeln, Raum-Code. */

import { ANIMALS, ANIMAL_IDS } from '../engine/shapes.js';
import { el, $, esc } from './dom.js';
import { headHtml, asset } from './sprites.js';

export function rulesHtml() {
  const rows = ANIMAL_IDS.map(id => {
    const a = ANIMALS[id];
    return `<tr><td>${headHtml(id)} ${esc(a.name)}</td><td>${a.cells.length}</td><td>${shapeSvg(a.cells, a.color)}</td><td>${esc(a.favoriteLabel)}</td></tr>`;
  }).join('');
  return `
    <p>Jede Seite versteckt fünf Tiere mit zusammen 16 Feldern auf einer echten Karte.
       Abwechselnd wird ein Feld abgesucht: <b>Daneben</b>, <b>Treffer</b> oder <b>Gefunden</b>.
       Wer zuerst alle Tiere des anderen findet, gewinnt.</p>
    <table class="rules-table">
      <thead><tr><th>Tier</th><th>Felder</th><th>Form</th><th>Lieblingsgelände</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <ul class="rules-list">
      <li>Tiere dürfen gedreht und gespiegelt werden, sich aber nicht überlappen oder berühren – auch nicht diagonal.</li>
      <li>Ein Treffer gibt keinen Extra-Schuss.</li>
      <li><b>Konter ⚡:</b> Steht ein Tier mit mindestens der Hälfte seiner Felder (aufgerundet) im Lieblingsgelände,
          darf sein Besitzer beim ersten Treffer sofort zurückschießen – danach folgt sein normaler Zug.
          Höchstens ein Konter pro Tier, und ein Konter löst keinen weiteren aus.</li>
      <li>Beim Verstecken glänzt ein Tier ✨, sobald es im Lieblingsgelände steht.</li>
      <li>Wasser darf belegt werden, ist aber für kein Tier Lieblingsgelände.</li>
    </ul>`;
}

export function shapeSvg(cells, color) {
  const w = Math.max(...cells.map(c => c[0])) + 1, h = Math.max(...cells.map(c => c[1])) + 1;
  const s = 10;
  const rects = cells.map(([x, y]) => `<rect x="${x * s + 1}" y="${y * s + 1}" width="${s - 2}" height="${s - 2}" rx="2" fill="${color}"/>`).join('');
  return `<svg class="shape-svg" viewBox="0 0 ${w * s} ${h * s}" width="${w * s * 1.6}" height="${h * s * 1.6}" aria-hidden="true">${rects}</svg>`;
}

export function startScreen(root, { onHotseat, onOnline, onJoin }) {
  const hero = asset('hero');
  const node = el(`
    <section class="screen start">
      <div class="hero ${hero ? 'has-img' : ''}">
        ${hero ? `<img class="hero-img" src="${hero.src}" alt="">` : `<div class="hero-emoji" aria-hidden="true">${ANIMAL_IDS.map(id => `<span>${ANIMALS[id].emoji}</span>`).join('')}</div>`}
        <h1>Tierversteck</h1>
        <p class="tagline">Schiffe versenken auf einer echten Karte: Versteck Schlange, Pferd, Hund, Katze und Maus in deiner Nachbarschaft.</p>
      </div>
      <div class="card">
        <div class="mode-buttons">
          <button class="btn block" data-act="hotseat">👥 Zu zweit an einem Gerät</button>
          <button class="btn teal block" data-act="online">🌐 Online-Spiel erstellen</button>
        </div>
        <form class="join-row" autocomplete="off">
          <input type="text" name="code" placeholder="Raum-Code oder Einladungslink" aria-label="Raum-Code oder Einladungslink">
          <button class="btn secondary" type="submit">Beitreten</button>
        </form>
      </div>
      <details class="card rules">
        <summary><h2>Spielregeln</h2></summary>
        ${rulesHtml()}
      </details>
    </section>`);
  $(node, '[data-act=hotseat]').onclick = onHotseat;
  $(node, '[data-act=online]').onclick = onOnline;
  $(node, 'form').onsubmit = e => {
    e.preventDefault();
    const v = $(node, 'input').value.trim();
    const m = v.match(/room=([a-z0-9]+)/i) || v.match(/^([a-z0-9]{4,20})$/i);
    if (m) onJoin(m[1].toLowerCase());
    else $(node, 'input').focus();
  };
  root.appendChild(node);
  return {};
}
