import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import urlsRouter from './routes/urls.js';
import analysesRouter from './routes/analyses.js';
import settingsRouter from './routes/settings.js';
import tagsRouter from './routes/tags.js';
import { initScheduler } from './services/scheduler.js';

const app = new Hono();

app.use('*', logger());
app.use('*', cors());

app.notFound((c) => c.json({ message: 'Not Found' }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ message: 'Internal Server Error' }, 500);
});

app.route('/api/urls', urlsRouter);
app.route('/api/analyses', analysesRouter);
app.route('/api/settings', settingsRouter);
app.route('/api/tags', tagsRouter);

const port = Number(process.env.PORT ?? 3001);

async function main() {
  await initScheduler();
  serve({ fetch: app.fetch, port });
  console.log(`[server] running on http://localhost:${port}`);
}

main().catch(console.error);
