import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import urlsRouter from './routes/urls.js';
import analysesRouter from './routes/analyses.js';
import settingsRouter from './routes/settings.js';
import tagsRouter from './routes/tags.js';

const app = new Hono();

app.use('*', logger());
app.use('*', cors());

app.notFound((c) => c.json({ message: 'Not Found' }, 404));
app.onError((err, c) => {
  console.error(err);
  return c.json({ message: 'Internal Server Error' }, 500);
});

const routes = app
  .route('/api/urls', urlsRouter)
  .route('/api/analyses', analysesRouter)
  .route('/api/settings', settingsRouter)
  .route('/api/tags', tagsRouter);

export { app };
export type AppType = typeof routes;
