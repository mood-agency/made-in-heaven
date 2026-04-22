import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { rpc } from '@/lib/rpc';

export type ScheduleInterval = 'manual' | 'hourly' | 'every6h' | 'every12h' | 'daily' | 'weekly';

export interface Url {
  id: number;
  url: string;
  name: string | null;
  scheduleInterval: string;
  isActive: boolean;
  displayOrder: number | null;
  createdAt: string | null;
  lastAnalyzed: string | null;
  tags: string[];
  latestMobile: Analysis | null;
  latestDesktop: Analysis | null;
}

export interface Analysis {
  id: number;
  urlId: number;
  strategy: 'mobile' | 'desktop';
  analyzedAt: string | null;
  performanceScore: number | null;
  fcp: number | null;
  lcp: number | null;
  tbt: number | null;
  cls: number | null;
  si: number | null;
  tti: number | null;
  error: string | null;
}

export interface Tag {
  id: number;
  name: string;
}

export interface Settings {
  pagespeed_api_key?: string;
}

export interface BulkImportItem {
  url: string;
  name?: string;
  scheduleInterval: ScheduleInterval;
  tags?: string[];
}

export interface BulkImportResult {
  created: Url[];
  errors: { url: string; message: string }[];
}

async function throwIfError(res: Response) {
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText })) as { message?: string };
    throw new Error(err.message ?? 'Request failed');
  }
  return res;
}

// ─── URLs ───────────────────────────────────────────────────────────────────

export function useUrls() {
  return useQuery<Url[]>({
    queryKey: ['urls'],
    queryFn: async () => {
      const res = await throwIfError(await rpc.api.urls.$get());
      return res.json() as Promise<Url[]>;
    },
  });
}

export function useAddUrl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { url: string; name?: string; scheduleInterval: ScheduleInterval; tags?: string[] }) => {
      const res = await throwIfError(await rpc.api.urls.$post({ json: data }));
      return res.json() as Promise<Url>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['urls'] }),
  });
}

export function useUpdateUrl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...data }: { id: number; name?: string; scheduleInterval?: ScheduleInterval; isActive?: boolean; displayOrder?: number | null; tags?: string[] }) => {
      const res = await throwIfError(await rpc.api.urls[':id'].$put({ param: { id: String(id) }, json: data }));
      return res.json() as Promise<Url>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['urls'] }),
  });
}

export function useDeleteUrl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      await throwIfError(await rpc.api.urls[':id'].$delete({ param: { id: String(id) } }));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['urls'] }),
  });
}

export function useAnalyze() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await throwIfError(await rpc.api.urls[':id'].analyze.$post({ param: { id: String(id) } }));
      return res.json() as Promise<{ message: string }>;
    },
    onSuccess: (_data, id) => {
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['urls'] });
        qc.invalidateQueries({ queryKey: ['analyses', id] });
      }, 8000);
    },
  });
}

export function useAnalyzeAll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await throwIfError(await rpc.api.urls['analyze-all'].$post());
      return res.json() as Promise<{ queued?: number; started?: number }>;
    },
    onSuccess: (data) => {
      const count = data.queued ?? data.started ?? 0;
      setTimeout(() => qc.invalidateQueries({ queryKey: ['urls'] }), 15000);
      return count;
    },
  });
}

export function useBulkImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (items: BulkImportItem[]) => {
      const res = await throwIfError(await rpc.api.urls.bulk.$post({ json: { urls: items } }));
      return res.json() as Promise<BulkImportResult>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['urls'] }),
  });
}

// ─── Analyses ────────────────────────────────────────────────────────────────

export function useAnalyses(urlId: number, strategy?: 'mobile' | 'desktop') {
  return useQuery<Analysis[]>({
    queryKey: ['analyses', urlId, strategy],
    queryFn: async () => {
      const query: Record<string, string> = { limit: '60' };
      if (strategy) query.strategy = strategy;
      const res = await throwIfError(
        await rpc.api.analyses[':urlId'].$get({ param: { urlId: String(urlId) }, query }),
      );
      return res.json() as Promise<Analysis[]>;
    },
    enabled: !!urlId,
  });
}

// ─── Tags ─────────────────────────────────────────────────────────────────────

export function useTags() {
  return useQuery<Tag[]>({
    queryKey: ['tags'],
    queryFn: async () => {
      const res = await throwIfError(await rpc.api.tags.$get());
      return res.json() as Promise<Tag[]>;
    },
  });
}

// ─── Settings ────────────────────────────────────────────────────────────────

export function useSettings() {
  return useQuery<Settings>({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await throwIfError(await rpc.api.settings.$get());
      return res.json() as Promise<Settings>;
    },
  });
}

export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { pagespeed_api_key: string }) => {
      const res = await throwIfError(await rpc.api.settings.$put({ json: data }));
      return res.json() as Promise<{ ok: boolean }>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });
}
