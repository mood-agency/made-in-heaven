import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Variables } from '../types.js';
import { analyses } from '../db/schema/index.js';
import { eq, and, desc } from 'drizzle-orm';

const querySchema = z.object({
  strategy: z.enum(['mobile', 'desktop']).optional(),
  limit: z.string().optional(),
});

const router = new Hono<{ Variables: Variables }>()
  .get('/:urlId', zValidator('query', querySchema), async (c) => {
    const db = c.var.db;
    const urlId = Number(c.req.param('urlId'));
    const { strategy, limit: limitStr } = c.req.valid('query');
    const limit = Math.min(Number(limitStr ?? 50), 200);

    const conditions = [eq(analyses.urlId, urlId)];
    if (strategy) conditions.push(eq(analyses.strategy, strategy as 'mobile' | 'desktop'));

    const rows = await db
      .select()
      .from(analyses)
      .where(and(...conditions))
      .orderBy(desc(analyses.analyzedAt))
      .limit(limit);

    return c.json(rows);
  });

export default router;
