import { Hono } from 'hono';
import { db } from '../db/db.js';
import { analyses } from '../db/schema/index.js';
import { eq, and, desc } from 'drizzle-orm';

const router = new Hono();

router.get('/:urlId', async (c) => {
  const urlId = Number(c.req.param('urlId'));
  const strategy = c.req.query('strategy') as 'mobile' | 'desktop' | undefined;
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 200);

  const conditions = [eq(analyses.urlId, urlId)];
  if (strategy) conditions.push(eq(analyses.strategy, strategy));

  const rows = await db
    .select()
    .from(analyses)
    .where(and(...conditions))
    .orderBy(desc(analyses.analyzedAt))
    .limit(limit);

  return c.json(rows);
});

export default router;
