import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PlayerGame } from '../src/engine/game.js';
import { randomBoard, randomFleet, makeRng } from '../src/engine/board.js';
import { createLocalPair } from '../src/net/local.js';
import { commitFleet, verifyReveal } from '../src/net/commit.js';
import { placementCells } from '../src/engine/shapes.js';

const tick = () => new Promise(r => setTimeout(r, 0));

function setup(seed, board = randomBoard(10, makeRng(seed))) {
  const [ta, tb] = createLocalPair();
  const events = { host: [], guest: [] };
  const host = new PlayerGame({ role: 'host', name: 'Ada', board, send: m => ta.send(m), onEvent: e => events.host.push(e) });
  const guest = new PlayerGame({ role: 'guest', name: 'Bo', send: m => tb.send(m), onEvent: e => events.guest.push(e) });
  ta.onMessage(m => host.receive(m));
  tb.onMessage(m => guest.receive(m));
  return { host, guest, events, ta, tb };
}

async function playToEnd(host, guest, rng) {
  const games = { host, guest };
  for (let i = 0; i < 1000 && host.phase === 'playing'; i++) {
    const g = games[host.s.turn];
    assert.ok(g.myTurn, 'Spieler am Zug muss schießen können');
    const free = [];
    for (let y = 0; y < g.board.size; y++) for (let x = 0; x < g.board.size; x++) {
      if (!g.s.outgoing.some(s => s.x === x && s.y === y)) free.push([x, y]);
    }
    const [x, y] = free[Math.floor(rng() * free.length)];
    g.shoot(x, y);
    await tick();
  }
}

test('kompletter Hot-Seat-Ablauf über den lokalen Transport', async () => {
  const { host, guest, events } = setup(1);
  host.start(); guest.start();
  await tick();
  assert.equal(host.phase, 'hiding');
  assert.equal(guest.phase, 'hiding');
  assert.deepEqual(guest.board, host.board);
  assert.equal(host.s.oppName, 'Bo');
  assert.equal(guest.s.oppName, 'Ada');

  await host.commit(randomFleet(10, makeRng(2)));
  await guest.commit(randomFleet(10, makeRng(3)));
  await tick();
  assert.equal(host.phase, 'playing');
  assert.equal(guest.phase, 'playing');
  assert.ok(host.myTurn);
  assert.ok(!guest.myTurn);

  await playToEnd(host, guest, makeRng(4));
  await tick(); await tick();
  assert.equal(host.phase, 'over');
  assert.equal(guest.phase, 'over');
  assert.equal(host.s.winner, guest.s.winner);
  assert.deepEqual(host.s.verdict, { ok: true });
  assert.deepEqual(guest.s.verdict, { ok: true });
  assert.ok(events.host.some(e => e.type === 'verdict' && e.ok));
});

test('Konter: der Getroffene schießt sofort und danach normal', async () => {
  const board = { size: 8, terrain: new Array(64).fill('other') };
  // Gast-Hund liegt auf Straße → im Lieblingsgelände
  for (let x = 0; x < 3; x++) board.terrain[x] = 'road';
  const { host, guest } = setup(0, board);
  host.start(); guest.start(); await tick();
  const guestFleet = [
    { animal: 'dog', x: 0, y: 0, rot: 0, flip: false },
    { animal: 'snake', x: 5, y: 0, rot: 0, flip: false },
    { animal: 'horse', x: 0, y: 4, rot: 0, flip: false },
    { animal: 'cat', x: 3, y: 5, rot: 0, flip: false },
    { animal: 'mouse', x: 7, y: 7, rot: 0, flip: false },
  ];
  await host.commit(randomFleet(8, makeRng(5)));
  await guest.commit(guestFleet);
  await tick();

  host.shoot(0, 0);
  await tick();
  assert.equal(host.s.outgoing[0].result, 'hit');
  assert.equal(host.s.outgoing[0].counter, true);
  assert.equal(guest.s.turn, 'guest');
  assert.equal(guest.s.kind, 'counter');
  assert.ok(guest.myTurn);

  // Konter-Schuss des Gasts
  const target = findFree(host);
  guest.shoot(...target);
  await tick();
  assert.equal(guest.s.outgoing[0].kind, 'counter');
  assert.equal(guest.s.turn, 'guest');      // danach normaler Zug des Gasts
  assert.equal(guest.s.kind, 'normal');
  assert.ok(guest.myTurn);
  guest.shoot(...findFree(host, [target]));
  await tick();
  assert.ok(host.myTurn);

  // zweiter Treffer auf den Hund: kein Konter mehr
  host.shoot(1, 0);
  await tick();
  assert.equal(host.s.outgoing[1].counter, false);
  assert.equal(guest.s.kind, 'normal');
});

function findFree(g, exclude = []) {
  const occ = g.s.placements.flatMap(p => placementCells(p).map(c => c.join()));
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    if (!occ.includes(x + ',' + y) && !exclude.some(e => e[0] === x && e[1] === y)) return [x, y];
  }
}

test('Schüsse außer der Reihe werden ignoriert', async () => {
  const { host, guest, events } = setup(7);
  host.start(); guest.start(); await tick();
  await host.commit(randomFleet(10, makeRng(8)));
  await guest.commit(randomFleet(10, makeRng(9)));
  await tick();
  assert.throws(() => guest.shoot(0, 0));
  host.receive({ t: 'shot', x: 0, y: 0, kind: 'normal' });   // Gast ist nicht am Zug
  assert.equal(host.s.incoming.length, 0);
  assert.ok(events.host.some(e => e.type === 'error'));
  host.receive({ t: 'shot', x: 99, y: 0, kind: 'normal' });  // ungültige Nachricht
  host.receive({ t: 'quatsch' });
  assert.equal(host.s.incoming.length, 0);
});

test('Spielstand lässt sich serialisieren und fortsetzen', async () => {
  const { host, guest, ta } = setup(11);
  host.start(); guest.start(); await tick();
  await host.commit(randomFleet(10, makeRng(12)));
  await guest.commit(randomFleet(10, makeRng(13)));
  await tick();
  host.shoot(4, 4); await tick();
  const saved = JSON.parse(JSON.stringify(host.toJSON()));
  const resumed = new PlayerGame({ send: m => ta.send(m) }, saved);
  assert.equal(resumed.phase, 'playing');
  assert.equal(resumed.s.outgoing.length, 1);
  assert.deepEqual(resumed.s.placements, host.s.placements);
});

test('Schummeln wird beim Aufdecken erkannt', async () => {
  const board = randomBoard(8, makeRng(20));
  const fleet = randomFleet(8, makeRng(21));
  const salt = 'abc';
  const commit = await commitFleet(fleet, salt);
  const occupied = placementCells(fleet[0])[0];
  // ehrliche Antworten
  const honest = [{ x: occupied[0], y: occupied[1], kind: 'normal', result: 'hit', counter: false }];
  const { isInFavorite } = await import('../src/engine/board.js');
  honest[0].counter = isInFavorite(board, fleet[0]);
  if (fleet[0].animal === 'mouse') { honest[0].result = 'found'; honest[0].animal = 'mouse'; }
  assert.deepEqual(await verifyReveal({ board, commit, placements: fleet, salt, shots: honest }), { ok: true });
  // gelogenes „Daneben“
  const lie = [{ ...honest[0], result: 'miss', counter: false }];
  assert.equal((await verifyReveal({ board, commit, placements: fleet, salt, shots: lie })).ok, false);
  // nachträglich umgestellt
  const moved = randomFleet(8, makeRng(22));
  assert.equal((await verifyReveal({ board, commit, placements: moved, salt, shots: [] })).ok, false);
  // falsches Salz
  assert.equal((await verifyReveal({ board, commit, placements: fleet, salt: 'x', shots: [] })).ok, false);
});
