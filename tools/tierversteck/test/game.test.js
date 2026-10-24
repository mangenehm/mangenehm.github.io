import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PlayerGame } from '../src/engine/game.js';
import { randomFleet, makeRng, isInFavorite } from '../src/engine/board.js';
import { randomBoard } from '../src/map/regions.js';
import { createLocalPair } from '../src/net/local.js';
import { commitFleet, verifyReveal } from '../src/net/commit.js';
import { gridBoard } from './helpers.js';

const tick = () => new Promise(r => setTimeout(r, 0));

function setup(seed, board = randomBoard(makeRng(seed), { n: 96, targetCount: 30 })) {
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
    assert.ok(g.myTurn, 'Spieler am Zug muss suchen können');
    const free = g.board.regions.map((_, r) => r).filter(r => !g.s.outgoing.some(s => s.r === r));
    g.shoot(free[Math.floor(rng() * free.length)]);
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

  await host.commit(randomFleet(host.board, makeRng(2)));
  await guest.commit(randomFleet(guest.board, makeRng(3)));
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

test('Zug wechselt immer, Spuren kommen beim Suchenden an', async () => {
  const board = gridBoard();
  const { host, guest } = setup(0, board);
  host.start(); guest.start(); await tick();
  // Gast-Hund auf Häusern (nicht Lieblingsgelände) oben links
  const guestFleet = [
    { animal: 'dog', regions: [0, 1, 2] },
    { animal: 'snake', regions: [4, 5, 11] },
    { animal: 'horse', regions: [24, 25, 26, 27] },
    { animal: 'cat', regions: [20, 21] },
    { animal: 'mouse', regions: [35] },
  ];
  await host.commit(randomFleet(board, makeRng(5)));
  await guest.commit(guestFleet);
  await tick();

  host.shoot(3);                       // neben dem Hund und der Schlange
  await tick();
  assert.equal(host.s.outgoing[0].result, 'miss');
  assert.equal(host.s.outgoing[0].tracks, true);
  assert.ok(guest.myTurn);
  const free = board.regions.map((_, r) => r).find(r => !host.s.placements.some(p => p.regions.includes(r)));
  guest.shoot(free);
  await tick();
  assert.ok(host.myTurn);

  host.shoot(0);                       // Treffer: trotzdem wechselt der Zug
  await tick();
  assert.equal(host.s.outgoing[1].result, 'hit');
  assert.equal(host.s.outgoing[1].tracks, false);
  assert.ok(guest.myTurn);
  assert.ok(!host.myTurn);
});

test('Suchen außer der Reihe werden ignoriert', async () => {
  const { host, guest, events } = setup(7);
  host.start(); guest.start(); await tick();
  await host.commit(randomFleet(host.board, makeRng(8)));
  await guest.commit(randomFleet(guest.board, makeRng(9)));
  await tick();
  assert.throws(() => guest.shoot(0));
  host.receive({ t: 'shot', r: 0 });   // Gast ist nicht am Zug
  assert.equal(host.s.incoming.length, 0);
  assert.ok(events.host.some(e => e.type === 'error'));
  host.receive({ t: 'shot', r: 999 });  // ungültige Nachricht
  host.receive({ t: 'quatsch' });
  assert.equal(host.s.incoming.length, 0);
  assert.throws(() => host.shoot(999));
});

test('Spielstand lässt sich serialisieren und fortsetzen', async () => {
  const { host, guest, ta } = setup(11);
  host.start(); guest.start(); await tick();
  await host.commit(randomFleet(host.board, makeRng(12)));
  await guest.commit(randomFleet(guest.board, makeRng(13)));
  await tick();
  host.shoot(4); await tick();
  const saved = JSON.parse(JSON.stringify(host.toJSON()));
  const resumed = new PlayerGame({ send: m => ta.send(m) }, saved);
  assert.equal(resumed.phase, 'playing');
  assert.equal(resumed.s.outgoing.length, 1);
  assert.deepEqual(resumed.s.placements, host.s.placements);
});

test('Schummeln wird beim Aufdecken erkannt', async () => {
  const board = gridBoard();
  const fleet = randomFleet(board, makeRng(21));
  const salt = 'abc';
  const commit = await commitFleet(fleet, salt);
  const dog = fleet.find(p => p.animal === 'dog');
  // ehrliche Antworten: Treffer auf den Hund, Daneben irgendwo frei
  const freeR = board.regions.map((_, r) => r).find(r => !fleet.some(p => p.regions.includes(r)));
  const near = board.adj[freeR].some(n => fleet.some(p => p.regions.includes(n) && !isInFavorite(board, p)));
  const honest = [
    { r: dog.regions[0], result: 'hit', tracks: false },
    { r: freeR, result: 'miss', tracks: near },
  ];
  assert.deepEqual(await verifyReveal({ board, commit, placements: fleet, salt, shots: honest }), { ok: true });
  // gelogenes „Daneben“
  const lie = [{ ...honest[0], result: 'miss' }];
  assert.equal((await verifyReveal({ board, commit, placements: fleet, salt, shots: lie })).ok, false);
  // verschwiegene oder erfundene Spuren
  const tracksLie = [honest[0], { ...honest[1], tracks: !near }];
  assert.equal((await verifyReveal({ board, commit, placements: fleet, salt, shots: tracksLie })).ok, false);
  // nachträglich umgestellt
  const moved = randomFleet(board, makeRng(22));
  assert.equal((await verifyReveal({ board, commit, placements: moved, salt, shots: [] })).ok, false);
  // falsches Salz
  assert.equal((await verifyReveal({ board, commit, placements: fleet, salt: 'x', shots: [] })).ok, false);
});
