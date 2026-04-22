import { Hono } from 'hono';
import type { Variables } from '../types.js';
import { tags } from '../db/schema/index.js';
import { asc } from 'drizzle-orm';

const router = new Hono<{ Variables: Variables }>()
  .get('/', async (c) => {
    const db = c.var.db;
    const all = await db.select().from(tags).orderBy(asc(tags.name));
    return c.json(all);
  });

export default router;
