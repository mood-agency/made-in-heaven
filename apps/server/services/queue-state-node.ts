import type { WebSocket as WsSocket, WebSocketServer } from 'ws';
import type { QueueEntry } from '../queue-state-do.js';

type WsMsg =
  | { type: 'snapshot'; entries: QueueEntry[] }
  | { type: 'update'; entry: QueueEntry }
  | { type: 'bulk_update'; entries: QueueEntry[] }
  | { type: 'purge'; urlIds: number[] };

const TERMINAL_TTL = 5 * 60 * 1000;

class QueueStateNode {
  private state = new Map<number, QueueEntry>();
  private wss: WebSocketServer | null = null;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  setWss(wss: WebSocketServer) {
    this.wss = wss;
  }

  addClient(ws: WsSocket) {
    ws.send(JSON.stringify({ type: 'snapshot', entries: [...this.state.values()] } satisfies WsMsg));
  }

  markQueued(urlIds: number[]) {
    const now = Date.now();
    const entries = urlIds.map((urlId): QueueEntry => ({ urlId, status: 'queued', updatedAt: now }));
    for (const e of entries) this.state.set(e.urlId, e);
    this.broadcast({ type: 'bulk_update', entries });
  }

  markRunning(urlId: number) {
    const entry: QueueEntry = { urlId, status: 'running', updatedAt: Date.now() };
    this.state.set(urlId, entry);
    this.broadcast({ type: 'update', entry });
  }

  markDone(urlId: number) {
    const entry: QueueEntry = { urlId, status: 'done', updatedAt: Date.now() };
    this.state.set(urlId, entry);
    this.broadcast({ type: 'update', entry });
    this.scheduleCleanup();
  }

  markFailed(urlId: number, error: string) {
    const entry: QueueEntry = { urlId, status: 'failed', updatedAt: Date.now(), error };
    this.state.set(urlId, entry);
    this.broadcast({ type: 'update', entry });
    this.scheduleCleanup();
  }

  getSnapshot(): QueueEntry[] {
    return [...this.state.values()];
  }

  private broadcast(msg: WsMsg) {
    if (!this.wss) return;
    const data = JSON.stringify(msg);
    for (const client of this.wss.clients) {
      if (client.readyState === 1) {
        try { client.send(data); } catch {}
      }
    }
  }

  private scheduleCleanup() {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      const cutoff = Date.now() - TERMINAL_TTL;
      const purgedIds: number[] = [];
      for (const [urlId, entry] of this.state) {
        if ((entry.status === 'done' || entry.status === 'failed') && entry.updatedAt < cutoff) {
          purgedIds.push(urlId);
          this.state.delete(urlId);
        }
      }
      if (purgedIds.length > 0) this.broadcast({ type: 'purge', urlIds: purgedIds });
      const stillTerminal = [...this.state.values()].some(e => e.status === 'done' || e.status === 'failed');
      if (!stillTerminal && this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
        this.cleanupTimer = null;
      }
    }, TERMINAL_TTL);
  }
}

export const queueStateNode = new QueueStateNode();
