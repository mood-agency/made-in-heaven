/// <reference types="@cloudflare/workers-types" />
import { DurableObject } from 'cloudflare:workers';

export interface QueueEntry {
  urlId: number;
  status: 'queued' | 'running' | 'done' | 'failed';
  updatedAt: number;
  error?: string;
}

type WsMsg =
  | { type: 'snapshot'; entries: QueueEntry[] }
  | { type: 'update'; entry: QueueEntry }
  | { type: 'bulk_update'; entries: QueueEntry[] }
  | { type: 'purge'; urlIds: number[] };

const TERMINAL_TTL = 5 * 60 * 1000;

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

  async getSnapshot(): Promise<QueueEntry[]> {
    await this.ensureLoaded();
    return [...this.state.values()];
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
      if ((entry.status === 'done' || entry.status === 'failed') && entry.updatedAt < cutoff) {
        purgedIds.push(urlId);
        keysToDelete.push(`status:${urlId}`);
        this.state.delete(urlId);
      }
    }

    if (purgedIds.length > 0) {
      await this.ctx.storage.delete(keysToDelete);
      this.broadcast({ type: 'purge', urlIds: purgedIds });
    }

    const stillTerminal = [...this.state.values()].some(
      (e) => e.status === 'done' || e.status === 'failed',
    );
    if (stillTerminal) {
      await this.ctx.storage.setAlarm(Date.now() + TERMINAL_TTL);
    }
  }

  private broadcast(msg: WsMsg) {
    const data = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(data);
      } catch {}
    }
  }

  private async scheduleCleanup() {
    const existing = await this.ctx.storage.getAlarm();
    if (!existing) {
      await this.ctx.storage.setAlarm(Date.now() + TERMINAL_TTL);
    }
  }
}
