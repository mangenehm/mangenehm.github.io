/* Online: Einladung teilen (Link, Teilen-Dialog, QR-Code), Beitreten, Warten. */

import { el, $, esc, toast } from './dom.js';

export function inviteUrl(roomId) {
  return location.origin + location.pathname + location.search + '#room=' + roomId;
}

async function drawQr(canvas, text) {
  try {
    const { default: qrcode } = await import('../../vendor/qrcode.js');
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    const quiet = 3, scale = 6;
    const size = (n + quiet * 2) * scale;
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#13293d';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
    }
  } catch { canvas.hidden = true; }
}

export function lobbyScreen(root, { roomId, status = 'connecting', onCancel }) {
  const url = inviteUrl(roomId);
  const node = el(`
    <section class="screen lobby">
      <div class="card">
        <h2>Mitspieler einladen</h2>
        <p class="muted small">Schick diesen Link oder lass den QR-Code scannen. Sobald dein Gegenüber beitritt, versteckt ihr beide eure Tiere.</p>
        <div class="invite">
          <input type="text" readonly value="${esc(url)}" aria-label="Einladungslink">
          <button class="btn secondary" data-act="copy">Kopieren</button>
        </div>
        ${navigator.share ? '<button class="btn teal block" data-act="share">Teilen …</button>' : ''}
        <div class="qr"><canvas aria-label="QR-Code mit dem Einladungslink"></canvas></div>
        <p class="room-code muted">Raum-Code <b>${esc(roomId.toUpperCase())}</b></p>
        <p class="lobby-status"></p>
      </div>
      <button class="btn secondary block" data-act="cancel">Abbrechen</button>
    </section>`);
  root.appendChild(node);
  drawQr($(node, 'canvas'), url);
  $(node, '[data-act=copy]').onclick = async () => {
    try { await navigator.clipboard.writeText(url); toast('Link kopiert'); }
    catch { $(node, 'input').select(); }
  };
  const share = $(node, '[data-act=share]');
  if (share) share.onclick = () => navigator.share({ title: 'Tiersuche', text: 'Spiel Tiersuche mit mir!', url }).catch(() => {});
  $(node, '[data-act=cancel]').onclick = onCancel;

  function setStatus(st, detail) {
    const box = $(node, '.lobby-status');
    box.className = 'lobby-status ' + st;
    box.textContent = st === 'error' ? detail
      : st === 'connected' ? 'Verbunden – gleich geht’s los …'
        : 'Warte auf Mitspieler …';
  }
  setStatus(status);
  return { setStatus };
}

export function joinScreen(root, { roomId, name = '', onJoin, onCancel }) {
  const node = el(`
    <section class="screen join">
      <div class="card">
        <h2>Spiel beitreten</h2>
        <p class="muted small">Raum <b>${esc(roomId.toUpperCase())}</b></p>
        <form autocomplete="off">
          <label class="field"><span>Dein Name</span><input type="text" name="name" maxlength="20" value="${esc(name)}" placeholder="Bo" required></label>
          <button class="btn block" type="submit">Beitreten</button>
        </form>
      </div>
      <button class="btn secondary block" data-act="cancel">Zurück zum Start</button>
    </section>`);
  root.appendChild(node);
  $(node, 'form').onsubmit = e => { e.preventDefault(); onJoin(e.target.name.value.trim() || 'Bo'); };
  $(node, '[data-act=cancel]').onclick = onCancel;
  $(node, 'input').focus();
  return {};
}

export function waitScreen(root, { title, text = '', onCancel = null }) {
  const node = el(`
    <section class="screen wait">
      <div class="card center">
        <div class="spinner" aria-hidden="true"></div>
        <h2>${esc(title)}</h2>
        <p class="muted wait-text">${esc(text)}</p>
        ${onCancel ? '<button class="btn secondary" data-act="cancel">Spiel verlassen</button>' : ''}
      </div>
    </section>`);
  root.appendChild(node);
  if (onCancel) $(node, '[data-act=cancel]').onclick = onCancel;
  return { setText(t) { $(node, '.wait-text').textContent = t; } };
}
