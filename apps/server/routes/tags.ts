import { Hono } from 'hono';
import { db } from '../db/db.js';
import { tags } from '../db/schema/index.js';
import { asc } from 'drizzle-orm';

const router = new Hono();

router.get('/', async (c) => {
  const all = await db.select().from(tags).orderBy(asc(tags.name));
  return c.json(all);
});

export default router;
