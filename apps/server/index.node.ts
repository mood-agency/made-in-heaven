import 'dotenv/config';
import { mkdirSync } from 'fs';
import { serve } from '@hono/node-server';
import { WebSocketServer } from 'ws';
import { Hono } from 'hono';
import { app } from './app.js';
import { createDbNode } from './db/node.js';
import { initScheduler, reschedule, removeJob } from './services/scheduler.js';
import { analyzeUrl } from './services/pagespeed.js';
import { queueStateNode } from './services/queue-state-node.js';
import type { Variables } from './types.js';

mkdirSync('./data', { recursive: true });

const db = createDbNode('file:./data/mih.db');
const apiKey = process.env.PAGESPEED_API_KEY;
const port = Number(process.env.PORT ?? 3001);

const nodeServer = new Hono<{ Variables: Variables }>();

nodeServer.use('*', async (c, next) => {
  c.set('db', db);
  c.set('apiKey', apiKey);
  c.set('reschedule', (urlId, urlStr, interval) => reschedule(db, apiKey, urlId, urlStr, interval));
  c.set('removeJob', removeJob);
  c.set('enqueueAnalysis', async (urlId, urlStr) => {
    queueStateNode.markQueued([urlId]);
    void (async () => {
      queueStateNode.markRunning(urlId);
      try {
        await analyzeUrl(db, urlId, urlStr, apiKey);
        queueStateNode.markDone(urlId);
      } catch (err) {
        queueStateNode.markFailed(urlId, String(err));
      }
    })();
  });
  c.set('enqueueBatchAnalysis', async (items) => {
    const urlIds = items.map((i) => i.urlId);
    queueStateNode.markQueued(urlIds);
    const CONCURRENCY = 3;
    void (async () => {
      for (let i = 0; i < items.length; i += CONCURRENCY) {
        await Promise.all(
          items.slice(i, i + CONCURRENCY).map(async ({ urlId, urlStr }) => {
            queueStateNode.markRunning(urlId);
            try {
              await analyzeUrl(db, urlId, urlStr, apiKey);
              queueStateNode.markDone(urlId);
            } catch (err) {
              queueStateNode.markFailed(urlId, String(err));
            }
          }),
        );
      }
    })();
  });
  await next();
});

nodeServer.route('/', app);

nodeServer.get('/api/queue/state', (c) => c.json(queueStateNode.getSnapshot()));

async function main() {
  await initScheduler(db, apiKey);
  const server = serve({ fetch: nodeServer.fetch, port });

  const wss = new WebSocketServer({ noServer: true });
  queueStateNode.setWss(wss);

  server.on('upgrade', (req, socket, head) => {
    if (req.url === '/api/queue/ws') {
      wss.handleUpgrade(req, socket as import('net').Socket, head, (ws) => {
        wss.emit('connection', ws, req);
        queueStateNode.addClient(ws);
      });
    } else {
      socket.destroy();
    }
  });

  console.log(`[server] running on http://localhost:${port}`);
}

main().catch(console.error);
