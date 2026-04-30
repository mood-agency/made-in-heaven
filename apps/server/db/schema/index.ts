import { sqliteTable, text, integer, real, index, primaryKey } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

export const urls = sqliteTable('urls', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  url: text('url').notNull().unique(),
  name: text('name'),
  scheduleInterval: text('schedule_interval').notNull().default('manual'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  displayOrder: integer('display_order'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  lastAnalyzed: integer('last_analyzed', { mode: 'timestamp' }),
  metaTitle: text('meta_title'),
  metaDescription: text('meta_description'),
  metaImage: text('meta_image'),
  metaFetchedAt: integer('meta_fetched_at', { mode: 'timestamp' }),
});

export const analyses = sqliteTable('analyses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  urlId: integer('url_id').notNull().references(() => urls.id, { onDelete: 'cascade' }),
  strategy: text('strategy', { enum: ['mobile', 'desktop'] }).notNull(),
  analyzedAt: integer('analyzed_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  performanceScore: real('performance_score'),
  fcp: real('fcp'),
  lcp: real('lcp'),
  tbt: real('tbt'),
  cls: real('cls'),
  si: real('si'),
  tti: real('tti'),
  error: text('error'),
}, (t) => [
  index('analyses_url_id_idx').on(t.urlId),
]);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value'),
});

export const tags = sqliteTable('tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
});

export const urlTags = sqliteTable('url_tags', {
  urlId: integer('url_id').notNull().references(() => urls.id, { onDelete: 'cascade' }),
  tagId: integer('tag_id').notNull().references(() => tags.id, { onDelete: 'cascade' }),
}, (t) => [
  primaryKey({ columns: [t.urlId, t.tagId] }),
]);

export const urlsRelations = relations(urls, ({ many }) => ({
  analyses: many(analyses),
  urlTags: many(urlTags),
}));

export const analysesRelations = relations(analyses, ({ one }) => ({
  url: one(urls, { fields: [analyses.urlId], references: [urls.id] }),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  urlTags: many(urlTags),
}));

export const urlTagsRelations = relations(urlTags, ({ one }) => ({
  url: one(urls, { fields: [urlTags.urlId], references: [urls.id] }),
  tag: one(tags, { fields: [urlTags.tagId], references: [tags.id] }),
}));

export type Url = typeof urls.$inferSelect;
export type NewUrl = typeof urls.$inferInsert;
export type Analysis = typeof analyses.$inferSelect;
export type NewAnalysis = typeof analyses.$inferInsert;
export type Setting = typeof settings.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
