import type { WebSocket as WsSocket, WebSocketServer } from 'ws';
import type { QueueEntry } from '../queue-state-do.js';

type WsMsg =
  | { type: 'snapshot'; entries: QueueEntry[] }
  | { type: 'update'; entry: QueueEntry }
  | { type: 'bulk_update'; entries: QueueEntry[] }
  | { type: 'purge'; urlIds: number[] };

const TERMINAL_TTL = 5 * 60 * 1000;
const RUNNING_TTL = 60_000;
const TERMINAL_STATUSES = new Set<QueueEntry['status']>(['done', 'failed', 'cancelled']);

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
    setTimeout(() => {
      const current = this.state.get(urlId);
      if (current?.status === 'running') {
        const failed: QueueEntry = { urlId, status: 'failed', updatedAt: Date.now(), error: 'Analysis timed out' };
        this.state.set(urlId, failed);
        this.broadcast({ type: 'update', entry: failed });
        this.scheduleCleanup();
      }
    }, RUNNING_TTL);
  }

  markDone(urlId: number) {
    if (this.state.get(urlId)?.status === 'cancelled') return;
    const entry: QueueEntry = { urlId, status: 'done', updatedAt: Date.now() };
    this.state.set(urlId, entry);
    this.broadcast({ type: 'update', entry });
    this.scheduleCleanup();
  }

  markFailed(urlId: number, error: string) {
    if (this.state.get(urlId)?.status === 'cancelled') return;
    const entry: QueueEntry = { urlId, status: 'failed', updatedAt: Date.now(), error };
    this.state.set(urlId, entry);
    this.broadcast({ type: 'update', entry });
    this.scheduleCleanup();
  }

  cancelQueued(urlIds?: number[], includeRunning = false): number {
    const now = Date.now();
    const updated: QueueEntry[] = [];
    for (const [, entry] of this.state) {
      if (entry.status !== 'queued' && !(includeRunning && entry.status === 'running')) continue;
      if (urlIds && !urlIds.includes(entry.urlId)) continue;
      const cancelled: QueueEntry = { urlId: entry.urlId, status: 'cancelled', updatedAt: now };
      this.state.set(entry.urlId, cancelled);
      updated.push(cancelled);
    }
    if (updated.length > 0) {
      this.broadcast({ type: 'bulk_update', entries: updated });
      this.scheduleCleanup();
    }
    return updated.length;
  }

  isCancelled(urlId: number): boolean {
    return this.state.get(urlId)?.status === 'cancelled';
  }

  clearAll(): number {
    const ids = [...this.state.keys()];
    this.state.clear();
    if (ids.length > 0) this.broadcast({ type: 'purge', urlIds: ids });
    return ids.length;
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
        if (TERMINAL_STATUSES.has(entry.status) && entry.updatedAt < cutoff) {
          purgedIds.push(urlId);
          this.state.delete(urlId);
        }
      }
      if (purgedIds.length > 0) this.broadcast({ type: 'purge', urlIds: purgedIds });
      const stillTerminal = [...this.state.values()].some(e => TERMINAL_STATUSES.has(e.status));
      if (!stillTerminal && this.cleanupTimer) {
        clearInterval(this.cleanupTimer);
        this.cleanupTimer = null;
      }
    }, TERMINAL_TTL);
  }
}

export const queueStateNode = new QueueStateNode();
