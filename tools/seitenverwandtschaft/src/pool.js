/* Kleiner Worker-Pool mit Auftrags-IDs, Fortschritt und Abbruch. */
export class Pool {
  constructor(size) {
    this.size = size;
    this.workers = [];
    this.pending = new Map();
    this.nextId = 1;
    for (let i = 0; i < size; i++) {
      const w = new Worker(new URL('./compute-worker.js', import.meta.url));
      w.onmessage = (e) => this._msg(e.data);
      w.onerror = (e) => this._fail(new Error(e.message || 'Worker-Fehler'));
      this.workers.push(w);
    }
  }

  _msg(data) {
    const p = this.pending.get(data.id);
    if (!p) return;
    if (data.progress != null) { p.onProgress && p.onProgress(data.progress); return; }
    this.pending.delete(data.id);
    if (data.error) p.reject(new Error(data.error));
    else p.resolve(data);
  }

  _fail(err) {
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
  }

  call(w, msg, transfer = [], onProgress = null) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, onProgress });
      this.workers[w].postMessage({ ...msg, id }, transfer);
    });
  }

  /* Verteilt Aufträge dynamisch; makeTask(i) liefert [msg, transfer]. */
  async queue(count, makeTask, onResult, onTaskProgress) {
    let next = 0;
    const run = async (w) => {
      while (next < count) {
        const t = next++;
        const [msg, tr] = makeTask(t);
        const res = await this.call(w, msg, tr, onTaskProgress ? (p) => onTaskProgress(t, p) : null);
        onResult(res, t);
      }
    };
    await Promise.all(this.workers.map((_, w) => run(w)));
  }

  broadcast(makeMsg) {
    return Promise.all(this.workers.map((_, w) => {
      const [msg, tr] = makeMsg(w);
      return this.call(w, msg, tr);
    }));
  }

  terminate() {
    for (const w of this.workers) w.terminate();
    this._fail(new Error('abgebrochen'));
    this.workers = [];
  }
}
