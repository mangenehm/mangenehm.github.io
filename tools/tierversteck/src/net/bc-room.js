/*
 * Test-Hook: Trysteros Raum-API über BroadcastChannel nachgebaut.
 * Mit ?net=bc in der Adresse spielen zwei Tabs desselben Browsers
 * „online“ gegeneinander – ohne Relays und ohne WebRTC.
 */

export function joinRoom(_config, roomId) {
  const id = Math.random().toString(36).slice(2);
  const ch = new BroadcastChannel('tierversteck-' + roomId);
  const peers = new Set();
  const room = {
    onPeerJoin: null, onPeerLeave: null, handler: null,
    makeAction: () => ({
      send: async (data, { target } = {}) => ch.postMessage({ t: 'data', from: id, to: target, data }),
      set onMessage(fn) { room.handler = fn; },
    }),
    getPeers: () => Object.fromEntries([...peers].map(p => [p, {}])),
    leave() { try { ch.postMessage({ t: 'bye', from: id }); ch.close(); } catch { /* schon zu */ } },
  };
  ch.onmessage = ({ data: m }) => {
    if (!m || m.from === id) return;
    if (m.t === 'announce' || m.t === 'ack') {
      if (!peers.has(m.from)) { peers.add(m.from); room.onPeerJoin?.(m.from); }
      if (m.t === 'announce') ch.postMessage({ t: 'ack', from: id });
    } else if (m.t === 'data' && m.to === id) {
      room.handler?.(m.data, { peerId: m.from });
    } else if (m.t === 'bye' && peers.delete(m.from)) {
      room.onPeerLeave?.(m.from);
    }
  };
  setTimeout(() => ch.postMessage({ t: 'announce', from: id }), 0);
  addEventListener('pagehide', () => room.leave());
  return room;
}
