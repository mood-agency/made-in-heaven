/// <reference types="@cloudflare/workers-types" />
import { DurableObject } from 'cloudflare:workers';

export interface QueueEntry {
  urlId: number;
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  updatedAt: number;
  error?: string;
}

type WsMsg =
  | { type: 'snapshot'; entries: QueueEntry[] }
  | { type: 'update'; entry: QueueEntry }
  | { type: 'bulk_update'; entries: QueueEntry[] }
  | { type: 'purge'; urlIds: number[] };

const TERMINAL_TTL = 5 * 60 * 1000;
const TERMINAL_STATUSES = new Set<QueueEntry['status']>(['done', 'failed', 'cancelled']);

export class QueueStateDO extends DurableObject {
  private state = new Map<number, QueueEntry>();
  private loaded = false;

  private async ensureLoaded() {
    if (this.loaded) return;
    const entries = await this.ctx.storage.list<QueueEntry>({ prefix: 'status:' });
    for (const [, entry] of entries) {
      this.state.set(entry.urlId, entry);
    }
    this.loaded = true;
  }

  async markQueued(urlIds: number[]): Promise<void> {
    await this.ensureLoaded();
    const now = Date.now();
    const newEntries: QueueEntry[] = urlIds.map((urlId) => ({ urlId, status: 'queued', updatedAt: now }));
    const batch: Record<string, QueueEntry> = {};
    for (const entry of newEntries) {
      this.state.set(entry.urlId, entry);
      batch[`status:${entry.urlId}`] = entry;
    }
    await this.ctx.storage.put(batch);
    this.broadcast({ type: 'bulk_update', entries: newEntries });
  }

  async markRunning(urlId: number): Promise<void> {
    await this.ensureLoaded();
    const entry: QueueEntry = { urlId, status: 'running', updatedAt: Date.now() };
    this.state.set(urlId, entry);
    await this.ctx.storage.put(`status:${urlId}`, entry);
    this.broadcast({ type: 'update', entry });
  }

  async markDone(urlId: number): Promise<void> {
    await this.ensureLoaded();
    const entry: QueueEntry = { urlId, status: 'done', updatedAt: Date.now() };
    this.state.set(urlId, entry);
    await this.ctx.storage.put(`status:${urlId}`, entry);
    this.broadcast({ type: 'update', entry });
    await this.scheduleCleanup();
  }

  async markFailed(urlId: number, error: string): Promise<void> {
    await this.ensureLoaded();
    const entry: QueueEntry = { urlId, status: 'failed', updatedAt: Date.now(), error };
    this.state.set(urlId, entry);
    await this.ctx.storage.put(`status:${urlId}`, entry);
    this.broadcast({ type: 'update', entry });
    await this.scheduleCleanup();
  }

  async cancelQueued(urlIds?: number[]): Promise<number> {
    await this.ensureLoaded();
    const now = Date.now();
    const toCancel: QueueEntry[] = [];

    for (const [, entry] of this.state) {
      if (entry.status !== 'queued') continue;
      if (urlIds && !urlIds.includes(entry.urlId)) continue;
      toCancel.push(entry);
    }

    if (toCancel.length === 0) return 0;

    const batch: Record<string, QueueEntry> = {};
    const updated: QueueEntry[] = [];
    for (const entry of toCancel) {
      const cancelled: QueueEntry = { urlId: entry.urlId, status: 'cancelled', updatedAt: now };
      this.state.set(entry.urlId, cancelled);
      batch[`status:${entry.urlId}`] = cancelled;
      updated.push(cancelled);
    }
    await this.ctx.storage.put(batch);
    this.broadcast({ type: 'bulk_update', entries: updated });
    await this.scheduleCleanup();
    return toCancel.length;
  }

  async isCancelled(urlId: number): Promise<boolean> {
    await this.ensureLoaded();
    return this.state.get(urlId)?.status === 'cancelled';
  }

  async getSnapshot(): Promise<QueueEntry[]> {
    await this.ensureLoaded();
    return [...this.state.values()];
  }

  async clearAll(): Promise<number> {
    await this.ensureLoaded();
    const ids = [...this.state.keys()];
    if (ids.length === 0) return 0;
    await this.ctx.storage.delete(ids.map((id) => `status:${id}`));
    this.state.clear();
    this.broadcast({ type: 'purge', urlIds: ids });
    return ids.length;
  }

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get('Upgrade') !== 'websocket') {
      const entries = await this.getSnapshot();
      return Response.json(entries);
    }
    await this.ensureLoaded();
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.send(JSON.stringify({ type: 'snapshot', entries: [...this.state.values()] } satisfies WsMsg));
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(_ws: WebSocket, _msg: string | ArrayBuffer): Promise<void> {}
  async webSocketClose(_ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): Promise<void> {}
  async webSocketError(_ws: WebSocket, _error: unknown): Promise<void> {}

  async alarm(): Promise<void> {
    await this.ensureLoaded();
    const cutoff = Date.now() - TERMINAL_TTL;
    const purgedIds: number[] = [];
    const keysToDelete: string[] = [];

    for (const [urlId, entry] of this.state) {
      if (TERMINAL_STATUSES.has(entry.status) && entry.updatedAt < cutoff) {
        purgedIds.push(urlId);
        keysToDelete.push(`status:${urlId}`);
        this.state.delete(urlId);
      }
    }

    if (purgedIds.length > 0) {
      await this.ctx.storage.delete(keysToDelete);
      this.broadcast({ type: 'purge', urlIds: purgedIds });
    }

    const stillTerminal = [...this.state.values()].some((e) => TERMINAL_STATUSES.has(e.status));
    if (stillTerminal) {
      await this.ctx.storage.setAlarm(Date.now() + TERMINAL_TTL);
    }
  }

  private broadcast(msg: WsMsg) {
    const data = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(data); } catch {}
    }
  }

  private async scheduleCleanup() {
    const existing = await this.ctx.storage.getAlarm();
    if (!existing) {
      await this.ctx.storage.setAlarm(Date.now() + TERMINAL_TTL);
    }
  }
}
