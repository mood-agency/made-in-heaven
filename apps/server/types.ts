import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import type * as schema from './db/schema/index.js';

// Single concrete type used everywhere. D1 instances are cast to this at the factory level
// (both adapters expose identical query APIs at runtime).
export type Db = LibSQLDatabase<typeof schema>;

export type Variables = {
  db: Db;
  apiKey: string | undefined;
  reschedule?: (urlId: number, urlStr: string, interval: string) => void;
  removeJob?: (urlId: number) => void;
};
