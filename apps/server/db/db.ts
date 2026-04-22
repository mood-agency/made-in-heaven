import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema/index.js';
import { mkdirSync } from 'fs';

mkdirSync('./data', { recursive: true });

const client = createClient({ url: 'file:./data/psi.db' });
export const db = drizzle(client, { schema });
