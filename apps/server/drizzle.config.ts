import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './db/schema/index.ts',
  out: './drizzle/migrations',
  dialect: 'sqlite',
});
