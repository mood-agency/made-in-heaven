import 'dotenv/config';
import { mkdirSync } from 'fs';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { app } from './app.js';
import { createDbNode } from './db/node.js';
import { initScheduler, reschedule, removeJob } from './services/scheduler.js';
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
  await next();
});

nodeServer.route('/', app);

async function main() {
  await initScheduler(db, apiKey);
  serve({ fetch: nodeServer.fetch, port });
  console.log(`[server] running on http://localhost:${port}`);
}

main().catch(console.error);
