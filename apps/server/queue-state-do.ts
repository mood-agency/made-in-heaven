/// <reference types="@cloudflare/workers-types" />
import { DurableObject } from 'cloudflare:workers';

export interface QueueEntry {
  urlId: number;
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  updatedAt: number;
  error?: string;
  screenshotState?: 'queued' | 'running' | 'done' | 'failed';
  screenshotError?: string;
  screenshotUpdatedAt?: number;
}

type WsMsg =
  | { type: 'snapshot'; entries: QueueEntry[] }
  | { type: 'update'; entry: QueueEntry }
  | { type: 'bulk_update'; entries: QueueEntry[] }
  | { type: 'purge'; urlIds: number[] };

const TERMINAL_TTL = 24 * 60 * 60 * 1000;
const QUEUED_TTL = 2 * 60 * 60 * 1000;
const RUNNING_TTL = 3 * 60 * 1000;
const SCREENSHOT_RUNNING_TTL = 5 * 60 * 1000;
const TERMINAL_STATUSES = new Set<QueueEntry['status']>(['done', 'failed', 'cancelled']);
const TERMINAL_SCREENSHOT_STATUSES = new Set<NonNullable<QueueEntry['screenshotState']>>(['done', 'failed']);

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
    const batchPairs = Object.entries(batch);
    for (let i = 0; i < batchPairs.length; i += 128) {
      await this.ctx.storage.put(Object.fromEntries(batchPairs.slice(i, i + 128)));
    }
    this.broadcast({ type: 'bulk_update', entries: newEntries });
    await this.scheduleAlarm(QUEUED_TTL);
  }

  async markRunning(urlId: number): Promise<void> {
    await this.ensureLoaded();
    const existing = this.state.get(urlId);
    const entry: QueueEntry = {
      urlId, status: 'running', updatedAt: Date.now(),
      error: existing?.error,
      screenshotState: existing?.screenshotState,
      screenshotError: existing?.screenshotError,
      screenshotUpdatedAt: existing?.screenshotUpdatedAt,
    };
    this.state.set(urlId, entry);
    await this.ctx.storage.put(`status:${urlId}`, entry);
    this.broadcast({ type: 'update', entry });
    await this.scheduleAlarm(RUNNING_TTL);
  }

  async markDone(urlId: number): Promise<void> {
    await this.ensureLoaded();
    const existing = this.state.get(urlId);
    if (existing?.status === 'cancelled') return;
    const entry: QueueEntry = {
      urlId, status: 'done', updatedAt: Date.now(),
      screenshotState: existing?.screenshotState,
      screenshotError: existing?.screenshotError,
      screenshotUpdatedAt: existing?.screenshotUpdatedAt,
    };
    this.state.set(urlId, entry);
    await this.ctx.storage.put(`status:${urlId}`, entry);
    this.broadcast({ type: 'update', entry });
    await this.scheduleAlarm(TERMINAL_TTL);
  }

  async markFailed(urlId: number, error: string): Promise<void> {
    await this.ensureLoaded();
    const existing = this.state.get(urlId);
    if (existing?.status === 'cancelled') return;
    // When the DLQ exhausts retries, preserve the real error from the last attempt
    const effectiveError = (error === 'Exhausted all retries' && existing?.error)
      ? `${existing.error} (agotados todos los reintentos)`
      : error;
    const entry: QueueEntry = {
      urlId, status: 'failed', updatedAt: Date.now(), error: effectiveError,
      screenshotState: existing?.screenshotState,
      screenshotError: existing?.screenshotError,
      screenshotUpdatedAt: existing?.screenshotUpdatedAt,
    };
    this.state.set(urlId, entry);
    await this.ctx.storage.put(`status:${urlId}`, entry);
    this.broadcast({ type: 'update', entry });
    await this.scheduleAlarm(TERMINAL_TTL);
  }

  async markScreenshotQueued(urlId: number): Promise<void> {
    await this.ensureLoaded();
    const existing = this.state.get(urlId);
    if (!existing) return;
    const entry: QueueEntry = { ...existing, screenshotState: 'queued', screenshotUpdatedAt: Date.now() };
    this.state.set(urlId, entry);
    await this.ctx.storage.put(`status:${urlId}`, entry);
    this.broadcast({ type: 'update', entry });
  }

  async markScreenshotRunning(urlId: number): Promise<void> {
    await this.ensureLoaded();
    const existing = this.state.get(urlId);
    if (!existing) return;
    const entry: QueueEntry = { ...existing, screenshotState: 'running', screenshotUpdatedAt: Date.now() };
    this.state.set(urlId, entry);
    await this.ctx.storage.put(`status:${urlId}`, entry);
    this.broadcast({ type: 'update', entry });
    await this.scheduleAlarm(SCREENSHOT_RUNNING_TTL);
  }

  async markScreenshotDone(urlId: number): Promise<void> {
    await this.ensureLoaded();
    const existing = this.state.get(urlId);
    if (!existing) return;
    const entry: QueueEntry = { ...existing, screenshotState: 'done', screenshotUpdatedAt: Date.now() };
    this.state.set(urlId, entry);
    await this.ctx.storage.put(`status:${urlId}`, entry);
    this.broadcast({ type: 'update', entry });
    await this.scheduleAlarm(TERMINAL_TTL);
  }

  async markScreenshotFailed(urlId: number, error: string): Promise<void> {
    await this.ensureLoaded();
    const existing = this.state.get(urlId);
    if (!existing) return;
    const entry: QueueEntry = {
      ...existing,
      screenshotState: 'failed',
      screenshotError: error,
      screenshotUpdatedAt: Date.now(),
    };
    this.state.set(urlId, entry);
    await this.ctx.storage.put(`status:${urlId}`, entry);
    this.broadcast({ type: 'update', entry });
    await this.scheduleAlarm(TERMINAL_TTL);
  }

  async cancelQueued(urlIds?: number[], includeRunning = false): Promise<number> {
    await this.ensureLoaded();
    const now = Date.now();
    const toCancel: QueueEntry[] = [];

    for (const [, entry] of this.state) {
      if (entry.status !== 'queued' && !(includeRunning && entry.status === 'running')) continue;
      if (urlIds && !urlIds.includes(entry.urlId)) continue;
      toCancel.push(entry);
    }

    if (toCancel.length === 0) return 0;

    const batch: Record<string, QueueEntry> = {};
    const updated: QueueEntry[] = [];
    for (const entry of toCancel) {
      const cancelled: QueueEntry = {
        urlId: entry.urlId,
        status: 'cancelled',
        updatedAt: now,
        // Cancel any pending screenshot too so the entry can be purged
        screenshotState: entry.screenshotState === 'queued' ? 'failed' : entry.screenshotState,
        screenshotError: entry.screenshotState === 'queued' ? 'Cancelled' : entry.screenshotError,
        screenshotUpdatedAt: entry.screenshotState === 'queued' ? now : entry.screenshotUpdatedAt,
      };
      this.state.set(entry.urlId, cancelled);
      batch[`status:${entry.urlId}`] = cancelled;
      updated.push(cancelled);
    }
    const cancelPairs = Object.entries(batch);
    for (let i = 0; i < cancelPairs.length; i += 128) {
      await this.ctx.storage.put(Object.fromEntries(cancelPairs.slice(i, i + 128)));
    }
    this.broadcast({ type: 'bulk_update', entries: updated });
    await this.scheduleAlarm(TERMINAL_TTL);
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

  async clearFinished(): Promise<number> {
    await this.ensureLoaded();
    const ids: number[] = [];
    for (const [id, entry] of this.state) {
      if (entry.status === 'done' || entry.status === 'failed') ids.push(id);
    }
    if (ids.length === 0) return 0;
    const finishedKeys = ids.map((id) => `status:${id}`);
    for (let i = 0; i < finishedKeys.length; i += 128) {
      await this.ctx.storage.delete(finishedKeys.slice(i, i + 128));
    }
    for (const id of ids) this.state.delete(id);
    this.broadcast({ type: 'purge', urlIds: ids });
    return ids.length;
  }

  async clearAll(): Promise<number> {
    await this.ensureLoaded();
    const ids = [...this.state.keys()];
    if (ids.length === 0) return 0;
    const allKeys = ids.map((id) => `status:${id}`);
    for (let i = 0; i < allKeys.length; i += 128) {
      await this.ctx.storage.delete(allKeys.slice(i, i + 128));
    }
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
    const now = Date.now();
    const terminalCutoff = now - TERMINAL_TTL;
    const runningCutoff = now - RUNNING_TTL;
    const screenshotRunningCutoff = now - SCREENSHOT_RUNNING_TTL;

    const queuedCutoff = now - QUEUED_TTL;
    const purgedIds: number[] = [];
    const keysToDelete: string[] = [];
    const timedOut: QueueEntry[] = [];
    const timedOutBatch: Record<string, QueueEntry> = {};

    for (const [urlId, entry] of this.state) {
      const isStatusTerminal = TERMINAL_STATUSES.has(entry.status);
      const isScreenshotTerminal = !entry.screenshotState || TERMINAL_SCREENSHOT_STATUSES.has(entry.screenshotState);
      const lastUpdated = Math.max(entry.updatedAt, entry.screenshotUpdatedAt ?? 0);

      if (isStatusTerminal && isScreenshotTerminal && lastUpdated < terminalCutoff) {
        purgedIds.push(urlId);
        keysToDelete.push(`status:${urlId}`);
        this.state.delete(urlId);
        continue;
      }

      if (entry.status === 'queued' && entry.updatedAt < queuedCutoff) {
        const failed: QueueEntry = { ...entry, status: 'failed', updatedAt: now, error: 'Queue timeout: never consumed' };
        this.state.set(urlId, failed);
        timedOutBatch[`status:${urlId}`] = failed;
        timedOut.push(failed);
        continue;
      }

      if (entry.status === 'running' && entry.updatedAt < runningCutoff) {
        const failed: QueueEntry = {
          ...entry,
          status: 'failed',
          updatedAt: now,
          error: 'Worker watchdog: job stalled with no response',
        };
        this.state.set(urlId, failed);
        timedOutBatch[`status:${urlId}`] = failed;
        timedOut.push(failed);
        continue;
      }

      if (entry.screenshotState === 'running' && entry.screenshotUpdatedAt && entry.screenshotUpdatedAt < screenshotRunningCutoff) {
        const updated: QueueEntry = {
          ...entry,
          screenshotState: 'failed',
          screenshotError: 'Screenshot timed out',
          screenshotUpdatedAt: now,
        };
        this.state.set(urlId, updated);
        timedOutBatch[`status:${urlId}`] = updated;
        timedOut.push(updated);
      }
    }

    if (keysToDelete.length > 0) {
      for (let i = 0; i < keysToDelete.length; i += 128) {
        await this.ctx.storage.delete(keysToDelete.slice(i, i + 128));
      }
      this.broadcast({ type: 'purge', urlIds: purgedIds });
    }

    if (timedOut.length > 0) {
      const timedOutPairs = Object.entries(timedOutBatch);
      for (let i = 0; i < timedOutPairs.length; i += 128) {
        await this.ctx.storage.put(Object.fromEntries(timedOutPairs.slice(i, i + 128)));
      }
      this.broadcast({ type: 'bulk_update', entries: timedOut });
    }

    const hasQueued = [...this.state.values()].some((e) => e.status === 'queued');
    const hasRunning = [...this.state.values()].some((e) => e.status === 'running');
    const hasScreenshotRunning = [...this.state.values()].some((e) => e.screenshotState === 'running');
    const hasTerminal = [...this.state.values()].some((e) => {
      const isStatusTerminal = TERMINAL_STATUSES.has(e.status);
      const isScreenshotTerminal = !e.screenshotState || TERMINAL_SCREENSHOT_STATUSES.has(e.screenshotState);
      return isStatusTerminal && isScreenshotTerminal;
    });

    if (hasRunning) await this.scheduleAlarm(RUNNING_TTL);
    else if (hasScreenshotRunning) await this.scheduleAlarm(SCREENSHOT_RUNNING_TTL);
    else if (hasTerminal) await this.scheduleAlarm(TERMINAL_TTL);
    else if (hasQueued) await this.scheduleAlarm(QUEUED_TTL);
  }

  private broadcast(msg: WsMsg) {
    const data = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(data); } catch {}
    }
  }

  private async scheduleAlarm(delayMs: number) {
    const target = Date.now() + delayMs;
    const existing = await this.ctx.storage.getAlarm();
    if (!existing || existing > target) {
      await this.ctx.storage.setAlarm(target);
    }
  }
}
