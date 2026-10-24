/* Startbildschirm: Modus wählen, Regeln, Raum-Code. */

import { ANIMALS, ANIMAL_IDS } from '../engine/shapes.js';
import { el, $, esc } from './dom.js';
import { headHtml, asset } from './sprites.js';

export function rulesHtml() {
  // In der Hilfe nach Reviergröße absteigend
  const rows = [...ANIMAL_IDS].sort((a, b) => ANIMALS[b].size - ANIMALS[a].size).map(id => {
    const a = ANIMALS[id];
    return `<tr><td>${headHtml(id)} ${esc(a.name)}</td><td>${a.size}</td><td>${esc(a.favoriteLabel)}</td></tr>`;
  }).join('');
  return `
    <p>Das Spielfeld ist eine echte Umgebung, aufgeteilt in <b>Orte</b>: Häuserblöcke, Parks, Wälder, Plätze und Teiche,
       begrenzt von echten Straßen. Die Spieler*innen verstecken fünf Tiere.
       Abwechselnd wird ein Ort abgesucht.
       Wer zuerst alle Tiere der oder des anderen findet, gewinnt.</p>
    <table class="rules-table">
      <thead><tr><th>Tier</th><th>Reviere</th><th>Lieblingsgelände</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <ul class="rules-list">
      <li>Ein Tier mit einem größeren Revier muss <b>benachbarte</b> Orte belegen – sie grenzen aneinander oder liegen sich an einer Straße gegenüber. Zwei Tiere teilen sich nie ein Revier.</li>
      <li>Nach einem Treffer darfst du gleich nochmal suchen. Liegst du daneben, ist die oder der andere dran.</li>
      <li><b>Lieblingsgelände ✨:</b> Ein Tier ist im Lieblingsgelände, wenn mindestens die Hälfte seines Reviers (aufgerundet) darin liegt.
          Beim Verstecken glänzt es dann ✨. Wasser darf belegt werden, ist aber für kein Tier Lieblingsgelände.</li>
      <li><b>Spuren 👣:</b> Geht eine Suche daneben, verrät die Antwort, ob in einem Nachbarort ein Tier steckt – aber nur,
          wenn es <b>nicht</b> im Lieblingsgelände ist. Tiere im Lieblingsgelände hinterlassen keine Spuren – dafür wird dort wahrscheinlich eher gesucht.</li>
    </ul>`;
}

export function startScreen(root, { onOnline, onJoin }) {
  const hero = asset('hero');
  const node = el(`
    <section class="screen start">
      <div class="hero ${hero ? 'has-img' : ''}">
        ${hero ? `<img class="hero-img" src="${hero.src}" alt="">` : `<div class="hero-emoji" aria-hidden="true">${ANIMAL_IDS.map(id => `<span>${ANIMALS[id].emoji}</span>`).join('')}</div>`}
        <h1>Tiersuche</h1>
        <p class="tagline">Verstecken und Suchen in deiner echten Nachbarschaft: Schlange, Pferd, Hund, Katze und Maus verkriechen sich in Häuserblöcken, Parks und Wäldern.</p>
      </div>
      <div class="card">
        <div class="mode-buttons">
          <button class="btn block" data-act="online">🌐 Online-Spiel erstellen</button>
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
