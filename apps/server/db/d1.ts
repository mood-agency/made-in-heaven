/// <reference types="@cloudflare/workers-types" />
import { drizzle } from 'drizzle-orm/d1';
import type { Db } from '../types.js';
import * as schema from './schema/index.js';

export function createDbD1(d1: D1Database): Db {
  return drizzle(d1, { schema }) as unknown as Db;
}
