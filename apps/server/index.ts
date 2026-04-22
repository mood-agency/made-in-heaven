import 'dotenv/config';
import { serve } from '@hono/node-server';
import { app } from './app.js';
import { initScheduler } from './services/scheduler.js';

const port = Number(process.env.PORT ?? 3001);

async function main() {
  await initScheduler();
  serve({ fetch: app.fetch, port });
  console.log(`[server] running on http://localhost:${port}`);
}

main().catch(console.error);
