import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema/index.js';

export function createDbNode(url: string) {
  return drizzle(createClient({ url }), { schema });
}
