import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { SortingState, PaginationState, ColumnFiltersState, VisibilityState } from '@tanstack/react-table';

type ViewMode = 'grid' | 'table';

function readLocalStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeLocalStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

export function useUrlTableState() {
  const [params, setParams] = useSearchParams();

  // ── Column visibility (useState + localStorage) ───────────────────────────
  const [columnVisibility, setColumnVisibilityState] = useState<VisibilityState>(
    () => readLocalStorage('mih-col-visibility', {}),
  );

  const setColumnVisibility = useCallback(
    (updater: VisibilityState | ((prev: VisibilityState) => VisibilityState)) => {
      setColumnVisibilityState((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        writeLocalStorage('mih-col-visibility', next);
        return next;
      });
    },
    [],
  );

  // ── Search query ──────────────────────────────────────────────────────────
  const globalFilter = params.get('q') ?? '';
  const setGlobalFilter = useCallback(
    (value: string) =>
      setParams(
        (p) => {
          const n = new URLSearchParams(p);
          if (value) n.set('q', value);
          else n.delete('q');
          n.delete('page');
          return n;
        },
        { replace: true },
      ),
    [setParams],
  );

  // ── Tag filter → maps to TanStack columnFilters on 'tags' column ──────────
  const rawTags = params.get('tags');
  const activeTags: string[] = rawTags ? rawTags.split(',').filter(Boolean) : [];

  const columnFilters: ColumnFiltersState = activeTags.length > 0
    ? [{ id: 'tags', value: activeTags }]
    : [];

  const setColumnFilters = useCallback(
    (updater: ColumnFiltersState | ((prev: ColumnFiltersState) => ColumnFiltersState)) => {
      setParams(
        (p) => {
          const prev: ColumnFiltersState = p.get('tags')
            ? [{ id: 'tags', value: p.get('tags')!.split(',').filter(Boolean) }]
            : [];
          const next = typeof updater === 'function' ? updater(prev) : updater;
          const n = new URLSearchParams(p);
          const tagsValue = (next.find((f) => f.id === 'tags')?.value as string[] | undefined) ?? [];
          if (tagsValue.length > 0) n.set('tags', tagsValue.join(','));
          else n.delete('tags');
          n.delete('page');
          return n;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  // ── Sorting ───────────────────────────────────────────────────────────────
  const rawSort = params.get('sort');
  const sorting: SortingState = rawSort
    ? rawSort
        .split(',')
        .filter(Boolean)
        .map((s) => {
          const [id, dir] = s.split(':');
          return { id, desc: dir === 'desc' };
        })
    : [];

  const setSorting = useCallback(
    (updater: SortingState | ((prev: SortingState) => SortingState)) => {
      setParams(
        (p) => {
          const prev: SortingState = (p.get('sort') ?? '')
            .split(',')
            .filter(Boolean)
            .map((s) => {
              const [id, dir] = s.split(':');
              return { id, desc: dir === 'desc' };
            });
          const next = typeof updater === 'function' ? updater(prev) : updater;
          const n = new URLSearchParams(p);
          if (next.length > 0)
            n.set('sort', next.map((s) => `${s.id}:${s.desc ? 'desc' : 'asc'}`).join(','));
          else n.delete('sort');
          n.delete('page');
          return n;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  // ── Pagination ────────────────────────────────────────────────────────────
  const pageIndex = Math.max(0, (Number(params.get('page') ?? '1') || 1) - 1);
  const [pageSize, setPageSizeState] = useState<number>(() => readLocalStorage('mih-page-size', 20));

  const pagination: PaginationState = { pageIndex, pageSize };

  const setPagination = useCallback(
    (updater: PaginationState | ((prev: PaginationState) => PaginationState)) => {
      setParams(
        (p) => {
          const prevPageIndex = Math.max(0, (Number(p.get('page') ?? '1') || 1) - 1);
          const prev = { pageIndex: prevPageIndex, pageSize };
          const next = typeof updater === 'function' ? updater(prev) : updater;
          const n = new URLSearchParams(p);
          if (next.pageIndex > 0) n.set('page', String(next.pageIndex + 1));
          else n.delete('page');
          if (next.pageSize !== pageSize) {
            writeLocalStorage('mih-page-size', next.pageSize);
            setPageSizeState(next.pageSize);
          }
          return n;
        },
        { replace: true },
      );
    },
    [setParams, pageSize],
  );

  // ── View mode (grid / table) ──────────────────────────────────────────────
  const viewMode: ViewMode =
    (params.get('view') as ViewMode | null) ?? readLocalStorage('mih-view', 'table') as ViewMode;

  const setViewMode = useCallback(
    (mode: ViewMode) => {
      writeLocalStorage('mih-view', mode);
      setParams(
        (p) => {
          const n = new URLSearchParams(p);
          n.set('view', mode);
          return n;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  return {
    globalFilter,
    setGlobalFilter,
    columnFilters,
    setColumnFilters,
    sorting,
    setSorting,
    pagination,
    setPagination,
    viewMode,
    setViewMode,
    columnVisibility,
    setColumnVisibility,
    activeTags,
  };
}
