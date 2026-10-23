import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TrysteroTransport, randomRoomId } from '../src/net/trystero.js';
import { PlayerGame } from '../src/engine/game.js';
import { randomBoard, randomFleet, makeRng } from '../src/engine/board.js';
import { isValidMessage, msg } from '../src/net/protocol.js';

const tick = () => new Promise(r => setTimeout(r, 0));

/** Nachbau von Trysteros Raum-API im Speicher; drop() lässt Nachrichten verloren gehen. */
function fakeNetwork() {
  const peers = new Map();
  let n = 0;
  const net = { lossy: false };
  net.joinRoom = () => {
    const id = 'peer' + (++n);
    const room = {
      id, onPeerJoin: null, onPeerLeave: null, handler: null,
      makeAction: () => ({
        send: async (data, { target }) => {
          if (net.lossy) return;
          const to = peers.get(target);
          if (to) queueMicrotask(() => to.handler?.(structuredClone(data), { peerId: id }));
        },
        set onMessage(fn) { room.handler = fn; },
      }),
      getPeers: () => ({}),
      leave: () => {
        peers.delete(id);
        for (const p of peers.values()) queueMicrotask(() => p.onPeerLeave?.(id));
      },
    };
    queueMicrotask(() => {
      for (const p of peers.values()) { p.onPeerJoin?.(id); room.onPeerJoin?.(p.id); }
      peers.set(id, room);
    });
    return room;
  };
  return net;
}

test('Nachrichten kommen genau einmal und in Reihenfolge an, auch nach Abbruch', async () => {
  const net = fakeNetwork();
  const a = new TrysteroTransport({ roomId: 'r', playerId: 'A', joinRoom: net.joinRoom });
  const b = new TrysteroTransport({ roomId: 'r', playerId: 'B', joinRoom: net.joinRoom });
  const gotA = [], gotB = [];
  a.onMessage(m => gotA.push(m));
  b.onMessage(m => gotB.push(m));
  a.send({ n: 1 });                     // vor dem Verbinden: landet im Postausgang
  await a.connect(); await b.connect();
  await tick(); await tick();
  assert.equal(a.status, 'connected');
  assert.deepEqual(gotB, [{ n: 1 }]);

  net.lossy = true;
  a.send({ n: 2 });                     // geht verloren
  net.lossy = false;

  // B lädt die Seite neu: neuer Peer, aber gespeicherter Kanalzustand
  const saved = b.state();
  b.close();
  const b2 = new TrysteroTransport({ roomId: 'r', playerId: 'B', saved, joinRoom: net.joinRoom });
  b2.onMessage(m => gotB.push(m));
  await b2.connect();
  for (let i = 0; i < 5; i++) await tick();
  a.send({ n: 3 });
  b2.send({ back: 1 });
  for (let i = 0; i < 5; i++) await tick();
  assert.deepEqual(gotB, [{ n: 1 }, { n: 2 }, { n: 3 }]);
  assert.deepEqual(gotA, [{ back: 1 }]);
});

test('ein Dritter im Raum wird ignoriert', async () => {
  const net = fakeNetwork();
  const a = new TrysteroTransport({ roomId: 'r', playerId: 'A', joinRoom: net.joinRoom });
  const b = new TrysteroTransport({ roomId: 'r', playerId: 'B', joinRoom: net.joinRoom });
  await a.connect(); await b.connect();
  await tick(); await tick();
  const c = new TrysteroTransport({ roomId: 'r', playerId: 'C', joinRoom: net.joinRoom });
  const gotC = [];
  c.onMessage(m => gotC.push(m));
  await c.connect();
  for (let i = 0; i < 4; i++) await tick();
  a.send({ secret: true });
  for (let i = 0; i < 4; i++) await tick();
  assert.deepEqual(gotC, []);
  assert.equal(a.ch.oppPid, 'B');
});

test('komplette Online-Partie über den Transport', async () => {
  const net = fakeNetwork();
  const ta = new TrysteroTransport({ roomId: 'r', playerId: 'A', joinRoom: net.joinRoom });
  const tb = new TrysteroTransport({ roomId: 'r', playerId: 'B', joinRoom: net.joinRoom });
  const host = new PlayerGame({ role: 'host', name: 'Ada', board: randomBoard(9, makeRng(1)), send: m => ta.send(m) });
  const guest = new PlayerGame({ role: 'guest', name: 'Bo', send: m => tb.send(m) });
  ta.onMessage(m => host.receive(m));
  tb.onMessage(m => guest.receive(m));
  host.start(); guest.start();
  await ta.connect(); await tb.connect();
  for (let i = 0; i < 6; i++) await tick();
  assert.equal(guest.phase, 'hiding');
  await host.commit(randomFleet(9, makeRng(2)));
  await guest.commit(randomFleet(9, makeRng(3)));
  for (let i = 0; i < 4; i++) await tick();
  const rng = makeRng(4);
  for (let i = 0; i < 400 && host.phase === 'playing'; i++) {
    const g = host.s.turn === 'host' ? host : guest;
    let x, y;
    do { x = Math.floor(rng() * 9); y = Math.floor(rng() * 9); } while (g.s.outgoing.some(s => s.x === x && s.y === y));
    g.shoot(x, y);
    for (let k = 0; k < 3; k++) await tick();
  }
  for (let i = 0; i < 6; i++) await tick();
  assert.equal(host.phase, 'over');
  assert.equal(host.s.verdict?.ok, true);
  assert.equal(guest.s.verdict?.ok, true);
});

test('Protokoll-Prüfung', () => {
  assert.ok(isValidMessage(msg.hello('Ada')));
  assert.ok(isValidMessage(msg.shot(3, 4, 'counter')));
  assert.ok(!isValidMessage({ t: 'shot', x: 3, y: 4, kind: 'mega' }));
  assert.ok(!isValidMessage({ t: 'result', x: 0, y: 0, result: 'found', counter: false }));
  assert.ok(!isValidMessage({ t: 'hello', v: 1, name: 'x'.repeat(100) }));
  assert.ok(!isValidMessage(null));
  assert.match(randomRoomId(), /^[a-z0-9]{10}$/);
});
