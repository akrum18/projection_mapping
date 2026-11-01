// Link between the editor and projector windows.
//  - Same browser on the same computer: BroadcastChannel (instant, no server).
//  - Projector window on another computer (or another browser): the server relay,
//    Server-Sent Events down and POST up (see /api/relay in server.py).
// Messages carry an id so a window that hears one on both paths acts on it once.
// Exposes the BroadcastChannel-style interface the app already used:
// link.postMessage(msg) and link.onmessage = (e) => e.data.
import { CHANNEL, uid } from "./state.js";

// Newer messages of these kinds replace older ones still waiting to be sent.
const coalesceKey = (m) => (m.type === "state" ? "state" : m.type === "editUI" ? "editUI" : m.type === "wall" && m.ev === "move" ? "wallmove" : m.type === "outputInfo" ? "info" : null);

export class Link {
  constructor(role) {
    this.role = role; // "editor" | "output"
    this.handler = null;
    this.seen = new Set(); this.seenOrder = [];
    this.outputs = 0;       // editor: projector windows listening on the relay
    this.relay = false;     // relay connected
    this.relayOpen = false; // SSE currently open
    this.queue = []; this.sending = false;
    this.bc = new BroadcastChannel(CHANNEL);
    this.bc.onmessage = (e) => this.receive(e.data, "local");
    this.lastLocal = 0;
  }
  set onmessage(fn) { this.handler = fn; }

  receive(m, via) {
    if (!m || typeof m !== "object") return;
    if (m._id) {
      if (this.seen.has(m._id)) return;
      this.seen.add(m._id); this.seenOrder.push(m._id);
      if (this.seenOrder.length > 400) this.seen.delete(this.seenOrder.shift());
    }
    if (via === "local") this.lastLocal = performance.now();
    if (m.type === "relayPeers") this.outputs = m.outputs | 0;
    this.handler?.({ data: m, via });
  }

  postMessage(msg) {
    const m = { ...msg, _id: uid() + uid() };
    this.seen.add(m._id); // ignore our own message if it echoes back
    this.bc.postMessage(m);
    if (!this.relayOpen) return;
    if (this.role === "output" || this.outputs > 0) this.enqueue(m);
    else if (m.type === "state") this.cacheLater(m);
  }

  // With no projector on the network, still refresh the server's copy of the show
  // every so often, so a projector computer that connects later starts right away.
  cacheLater(m) {
    this.cachePending = m;
    if (this.cacheTimer) return;
    this.cacheTimer = setTimeout(() => { this.cacheTimer = null; if (this.cachePending) this.enqueue(this.cachePending); this.cachePending = null; }, 1500);
  }

  // Ordered, one request at a time; moves and state updates coalesce so a slow
  // network drops in-between frames instead of falling behind.
  enqueue(m) {
    const key = coalesceKey(m);
    if (key) {
      const i = this.queue.findIndex((x) => coalesceKey(x) === key);
      if (i >= 0) { this.queue[i] = m; return; }
    }
    this.queue.push(m);
    this.pump();
  }
  async pump() {
    if (this.sending) return;
    this.sending = true;
    while (this.queue.length) {
      const m = this.queue.shift();
      try {
        await fetch("/api/relay", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to: this.role === "editor" ? "output" : "editor", msg: m }),
        });
      } catch (e) { /* server gone: drop it, the next state update catches up */ }
    }
    this.sending = false;
  }

  connectRelay() {
    if (this.relay) return;
    this.relay = true;
    const es = new EventSource(`/api/relay?role=${this.role}`);
    es.onopen = () => { this.relayOpen = true; this.handler?.({ data: { type: "relayOpen" }, via: "network" }); };
    es.onerror = () => { this.relayOpen = false; };
    es.onmessage = (e) => { try { this.receive(JSON.parse(e.data), "network"); } catch (err) {} };
  }
}
