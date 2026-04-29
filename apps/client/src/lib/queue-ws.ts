export interface QueueEntry {
  urlId: number;
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  updatedAt: number;
  error?: string;
}

export type QueueWsMessage =
  | { type: 'snapshot'; entries: QueueEntry[] }
  | { type: 'update'; entry: QueueEntry }
  | { type: 'bulk_update'; entries: QueueEntry[] }
  | { type: 'purge'; urlIds: number[] };

type Listener = (msg: QueueWsMessage) => void;

class QueueWsClient {
  private listeners = new Set<Listener>();
  private delay = 1000;
  private stopped = false;
  private url: string;

  constructor(url: string) {
    this.url = url;
    this.connect();
  }

  private connect() {
    if (this.stopped) return;
    const ws = new WebSocket(this.url);

    ws.onopen = () => {
      this.delay = 1000;
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string) as QueueWsMessage;
        for (const l of this.listeners) l(msg);
      } catch {}
    };

    ws.onclose = () => {
      if (!this.stopped) {
        setTimeout(() => this.connect(), this.delay);
        this.delay = Math.min(this.delay * 2, 30_000);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

let client: QueueWsClient | null = null;

export function subscribeToQueueWs(listener: Listener): () => void {
  if (!client) {
    const wsUrl = `${window.location.origin.replace(/^http/, 'ws')}/api/queue/ws`;
    client = new QueueWsClient(wsUrl);
  }
  return client.subscribe(listener);
}
