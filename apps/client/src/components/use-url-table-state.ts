import { useCallback, useState } from 'react';
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

// Module-level cache — survives SPA navigation (component unmount/remount)
// but resets on full page reload, which is the expected behaviour.
const cache = {
  globalFilter: '',
  columnFilters: [] as ColumnFiltersState,
  sorting: [] as SortingState,
  pagination: { pageIndex: 0, pageSize: readLocalStorage('mih-page-size', 20) } as PaginationState,
  viewMode: readLocalStorage('mih-view', 'table') as ViewMode,
  columnVisibility: readLocalStorage('mih-col-visibility', {}) as VisibilityState,
};

export function useUrlTableState() {
  const [globalFilter, setGlobalFilterRaw] = useState(() => cache.globalFilter);
  const [columnFilters, setColumnFiltersRaw] = useState<ColumnFiltersState>(() => cache.columnFilters);
  const [sorting, setSortingRaw] = useState<SortingState>(() => cache.sorting);
  const [pagination, setPaginationRaw] = useState<PaginationState>(() => cache.pagination);
  const [viewMode, setViewModeRaw] = useState<ViewMode>(() => cache.viewMode);
  const [columnVisibility, setColumnVisibilityRaw] = useState<VisibilityState>(() => cache.columnVisibility);

  const activeTags = (columnFilters.find((f) => f.id === 'tags')?.value as string[] | undefined) ?? [];

  const setGlobalFilter = useCallback((value: string) => {
    cache.globalFilter = value;
    setGlobalFilterRaw(value);
  }, []);

  const setColumnFilters = useCallback(
    (updater: ColumnFiltersState | ((prev: ColumnFiltersState) => ColumnFiltersState)) => {
      setColumnFiltersRaw((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        cache.columnFilters = next;
        return next;
      });
    },
    [],
  );

  const setSorting = useCallback(
    (updater: SortingState | ((prev: SortingState) => SortingState)) => {
      setSortingRaw((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        cache.sorting = next;
        return next;
      });
    },
    [],
  );

  const setPagination = useCallback(
    (updater: PaginationState | ((prev: PaginationState) => PaginationState)) => {
      setPaginationRaw((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        cache.pagination = next;
        if (next.pageSize !== prev.pageSize) writeLocalStorage('mih-page-size', next.pageSize);
        return next;
      });
    },
    [],
  );

  const setViewMode = useCallback((mode: ViewMode) => {
    cache.viewMode = mode;
    writeLocalStorage('mih-view', mode);
    setViewModeRaw(mode);
  }, []);

  const setColumnVisibility = useCallback(
    (updater: VisibilityState | ((prev: VisibilityState) => VisibilityState)) => {
      setColumnVisibilityRaw((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        cache.columnVisibility = next;
        writeLocalStorage('mih-col-visibility', next);
        return next;
      });
    },
    [],
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
