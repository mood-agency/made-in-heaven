import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface Url {
  id: number;
  url: string;
  name: string | null;
  scheduleInterval: string;
  isActive: boolean;
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
  scheduleInterval: string;
  tags?: string[];
}

export interface BulkImportResult {
  created: Url[];
  errors: { url: string; message: string }[];
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message ?? 'Request failed');
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ─── URLs ───────────────────────────────────────────────────────────────────

export function useUrls() {
  return useQuery<Url[]>({ queryKey: ['urls'], queryFn: () => apiFetch('/urls') });
}

export function useAddUrl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { url: string; name?: string; scheduleInterval: string; tags?: string[] }) =>
      apiFetch<Url>('/urls', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['urls'] }),
  });
}

export function useUpdateUrl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; name?: string; scheduleInterval?: string; isActive?: boolean; tags?: string[] }) =>
      apiFetch<Url>(`/urls/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['urls'] }),
  });
}

export function useDeleteUrl() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiFetch<void>(`/urls/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['urls'] }),
  });
}

export function useAnalyze() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      apiFetch<{ message: string }>(`/urls/${id}/analyze`, { method: 'POST' }),
    onSuccess: (_data, id) => {
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['urls'] });
        qc.invalidateQueries({ queryKey: ['analyses', id] });
      }, 8000);
    },
  });
}

export function useBulkImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: BulkImportItem[]) =>
      apiFetch<BulkImportResult>('/urls/bulk', { method: 'POST', body: JSON.stringify({ urls: items }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['urls'] }),
  });
}

// ─── Analyses ────────────────────────────────────────────────────────────────

export function useAnalyses(urlId: number, strategy?: 'mobile' | 'desktop') {
  const params = new URLSearchParams({ limit: '60' });
  if (strategy) params.set('strategy', strategy);
  return useQuery<Analysis[]>({
    queryKey: ['analyses', urlId, strategy],
    queryFn: () => apiFetch(`/analyses/${urlId}?${params}`),
    enabled: !!urlId,
  });
}

// ─── Tags ─────────────────────────────────────────────────────────────────────

export function useTags() {
  return useQuery<Tag[]>({ queryKey: ['tags'], queryFn: () => apiFetch('/tags') });
}

// ─── Settings ────────────────────────────────────────────────────────────────

export function useSettings() {
  return useQuery<Settings>({ queryKey: ['settings'], queryFn: () => apiFetch('/settings') });
}

export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { pagespeed_api_key: string }) =>
      apiFetch<{ ok: boolean }>('/settings', { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });
}
