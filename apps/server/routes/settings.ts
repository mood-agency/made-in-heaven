import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db } from '../db/db.js';
import { settings } from '../db/schema/index.js';

const updateSchema = z.object({
  pagespeed_api_key: z.string(),
});

const router = new Hono()
  .get('/', async (c) => {
    const rows = await db.select().from(settings);
    const result = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return c.json(result);
  })
  .put('/', zValidator('json', updateSchema), async (c) => {
    const data = c.req.valid('json');
    await db
      .insert(settings)
      .values({ key: 'pagespeed_api_key', value: data.pagespeed_api_key })
      .onConflictDoUpdate({ target: settings.key, set: { value: data.pagespeed_api_key } });
    return c.json({ ok: true });
  });

export default router;
