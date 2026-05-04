import { startTransition, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  useUrls,
  useAnalyze,
  useAnalyzeAll,
  useAnalyzeSelected,
  useDeleteUrl,
  useUpdateUrl,
  useQueueState,
  downloadScoresCsv,
  type Url,
} from '@/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import ScoreCircle from '@/components/ScoreCircle';
import AddUrlDialog from '@/components/AddUrlDialog';
import BulkImportDialog from '@/components/BulkImportDialog';
import UrlTable from '@/components/UrlTable';
import { arrayMove } from '@dnd-kit/sortable';
import { RefreshCw, Trash2, ExternalLink, X, LayoutGrid, Table2, Play, Download, Loader2, CalendarIcon } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  type Row,
} from '@tanstack/react-table';
import { getUrlColumns } from '@/components/UrlTableColumns';
import {
  DataTableSearch,
  DataTableFacetedFilter,
  DataTableScoreBucketFilter,
  DataTableViewOptions,
  DataTablePagination,
} from '@/components/ui/data-table-toolbar';
import { useUrlTableState } from '@/components/use-url-table-state';
import { timeAgo } from '@/lib/utils';

export default function Dashboard() {
  const {
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
  } = useUrlTableState();

  const [activeDate, setActiveDate] = useState<Date | undefined>(undefined);
  const activeDateStr = activeDate ? activeDate.toLocaleDateString('en-CA') : undefined;

  const { data: urls, isLoading } = useUrls(activeDateStr);
  const analyze = useAnalyze();
  const analyzeAll = useAnalyzeAll();
  const analyzeSelected = useAnalyzeSelected();
  const deleteUrl = useDeleteUrl();
  const updateUrl = useUpdateUrl();
  const queueState = useQueueState();

  const [localUrls, setLocalUrls] = useState<Url[]>([]);

  const filteredManual = useMemo(
    () =>
      [...(urls ?? [])].sort((a, b) => {
        if (a.displayOrder == null && b.displayOrder == null) return 0;
        if (a.displayOrder == null) return 1;
        if (b.displayOrder == null) return -1;
        return a.displayOrder - b.displayOrder;
      }),
    [urls],
  );

  useEffect(() => {
    startTransition(() => setLocalUrls(filteredManual));
  }, [filteredManual]);

  const isDndEnabled = sorting.length === 0 && columnFilters.length === 0 && globalFilter === '';

  function handleReorder(oldIndex: number, newIndex: number) {
    const newOrder = arrayMove(localUrls, oldIndex, newIndex);
    setLocalUrls(newOrder);
    newOrder.forEach((u, i) => {
      if (u.displayOrder !== i + 1) updateUrl.mutate({ id: u.id, displayOrder: i + 1 });
    });
  }

  function handleTagClick(tag: string, activeTags: string[]) {
    const next = activeTags.includes(tag)
      ? activeTags.filter((t) => t !== tag)
      : [...activeTags, tag];
    setColumnFilters(next.length > 0 ? [{ id: 'tags', value: next }] : []);
  }

  async function handleAnalyzeAll() {
    try {
      const data = await analyzeAll.mutateAsync();
      const count = data.queued ?? data.started ?? 0;
      const verb = data.queued !== undefined ? 'queued' : 'started';
      toast.success(`${count} URL${count !== 1 ? 's' : ''} ${verb} for analysis`);
    } catch (err) {
      toast.error(String(err));
    }
  }

  async function handleAnalyzeSelected(ids: number[]) {
    try {
      const data = await analyzeSelected.mutateAsync(ids);
      const count = data.queued ?? data.started ?? 0;
      const verb = data.queued !== undefined ? 'queued' : 'started';
      toast.success(`${count} URL${count !== 1 ? 's' : ''} ${verb} for analysis`);
      table.resetRowSelection();
    } catch (err) {
      toast.error(String(err));
    }
  }

  async function handleAnalyze(id: number) {
    try {
      await analyze.mutateAsync(id);
      toast.success('Analysis started — results in ~10s');
    } catch (err) {
      toast.error(String(err));
    }
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`Delete "${name}"?`)) return;
    try {
      await deleteUrl.mutateAsync(id);
      toast.success('URL deleted');
    } catch (err) {
      toast.error(String(err));
    }
  }

  const columns = useMemo(
    () =>
      getUrlColumns({
        onTagClick: handleTagClick,
        onAnalyze: handleAnalyze,
        onDelete: handleDelete,
        isAnalyzePending: analyze.isPending,
        queueState,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [analyze.isPending, queueState],
  );

  const tableData = isDndEnabled ? localUrls : (urls ?? []);

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable<Url>({
    data: tableData,
    columns,
    state: {
      globalFilter,
      columnFilters,
      sorting,
      pagination,
      columnVisibility,
    },
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    manualSorting: false,
    getRowId: (u) => String(u.id),
    globalFilterFn: (row, _columnId, filterValue: string) =>
      row.original.url.toLowerCase().includes(filterValue.toLowerCase()) ||
      (row.original.name ?? '').toLowerCase().includes(filterValue.toLowerCase()),
  });

  const selectedRows = table.getSelectedRowModel().rows;
  const filteredRows = table.getFilteredRowModel().rows;
  const isFiltered = !isDndEnabled || (urls?.length ?? 0) !== filteredRows.length;

  return (
    <div className="flex flex-col gap-6">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">PageSpeed Monitor</h1>
        <div className="flex flex-wrap items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-md border overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              title="Vista cuadrícula"
              className={`p-1.5 transition-colors ${
                viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-muted-foreground'
              }`}
            >
              <LayoutGrid className="size-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              title="Vista tabla"
              className={`p-1.5 transition-colors ${
                viewMode === 'table' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-muted-foreground'
              }`}
            >
              <Table2 className="size-4" />
            </button>
          </div>

          {/* Analyze action */}
          {isFiltered && filteredRows.length > 0 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleAnalyzeSelected(filteredRows.map((r) => r.original.id))}
              disabled={analyzeSelected.isPending}
            >
              <Play className="size-3.5" data-icon="inline-start" />
              Run filtered ({filteredRows.length})
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={handleAnalyzeAll}
              disabled={analyzeAll.isPending || (urls?.length ?? 0) === 0}
            >
              <Play className="size-3.5" data-icon="inline-start" />
              {analyzeAll.isPending ? 'Queuing…' : 'Run All'}
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                const csvDate = activeDateStr ?? new Date().toLocaleDateString('en-CA');
                await downloadScoresCsv(
                  isFiltered ? filteredRows.map((r) => r.original.id) : undefined,
                  csvDate,
                );
              } catch (err) {
                toast.error(String(err));
              }
            }}
            disabled={(urls?.length ?? 0) === 0}
            title="Download scores as CSV"
          >
            <Download className="size-3.5" data-icon="inline-start" />
            {isFiltered ? `Download CSV (${filteredRows.length})` : 'Download CSV'}
          </Button>

          <BulkImportDialog />
          <AddUrlDialog />
        </div>
      </div>

      {/* Search + filters row */}
      <div className="flex flex-wrap gap-2 items-center">
        <DataTableSearch
          value={globalFilter}
          onChange={setGlobalFilter}
          placeholder="Search by URL or name…"
        />

        {table.getColumn('tags') && (
          <DataTableFacetedFilter column={table.getColumn('tags')!} title="Tags" />
        )}

        {table.getColumn('mobile') && (
          <DataTableScoreBucketFilter column={table.getColumn('mobile')!} title="Mobile" />
        )}

        {table.getColumn('desktop') && (
          <DataTableScoreBucketFilter column={table.getColumn('desktop')!} title="Desktop" />
        )}

        <DataTableViewOptions table={table} />

        {/* Date filter */}
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">Date:</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={activeDate ? 'default' : 'outline'}
                size="sm"
                className="h-8 px-2 text-xs gap-1.5"
              >
                <CalendarIcon className="size-3.5" />
                {(activeDate ?? new Date()).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={activeDate}
                onSelect={(day) => { setActiveDate(day ?? undefined); table.resetPagination(); }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          {activeDate && (
            <button
              onClick={() => setActiveDate(undefined)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Selection action bar */}
      {selectedRows.length > 0 && (
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted text-sm">
          <span className="text-muted-foreground">{selectedRows.length} selected</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleAnalyzeSelected(selectedRows.map((r) => r.original.id))}
            disabled={analyzeSelected.isPending}
          >
            <Play className="size-3.5" data-icon="inline-start" />
            Run Selected ({selectedRows.length})
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              try {
                const csvDate = activeDateStr ?? new Date().toLocaleDateString('en-CA');
                await downloadScoresCsv(selectedRows.map((r) => r.original.id), csvDate);
              } catch (err) {
                toast.error(String(err));
              }
            }}
          >
            <Download className="size-3.5" data-icon="inline-start" />
            Download CSV
          </Button>
          <Button size="sm" variant="ghost" onClick={() => table.resetRowSelection()}>
            <X className="size-3.5" data-icon="inline-start" />
            Clear
          </Button>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-52 rounded-xl" />
          ))}
        </div>
      )}

      {/* Empty state — no URLs at all */}
      {!isLoading && (urls?.length ?? 0) === 0 && (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-muted-foreground">
          <p className="text-lg">No URLs added yet.</p>
          <AddUrlDialog />
        </div>
      )}

      {/* Empty state — no results after filtering */}
      {!isLoading && (urls?.length ?? 0) > 0 && filteredRows.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
          <p>No URLs match your filters.</p>
          <button
            onClick={() => {
              setGlobalFilter('');
              setColumnFilters([]);
            }}
            className="text-sm underline"
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Table view */}
      {!isLoading && filteredRows.length > 0 && viewMode === 'table' && (
        <UrlTable
          table={table}
          isDndEnabled={isDndEnabled}
          onReorder={handleReorder}
        />
      )}

      {/* Grid view */}
      {!isLoading && filteredRows.length > 0 && viewMode === 'grid' && (
        <GridView
          rows={table.getRowModel().rows}
          onAnalyze={handleAnalyze}
          onDelete={handleDelete}
          isAnalyzePending={analyze.isPending}
          queueState={queueState}
          activeTags={(table.getColumn('tags')?.getFilterValue() as string[] | undefined) ?? []}
          onTagClick={(tag) =>
            handleTagClick(
              tag,
              (table.getColumn('tags')?.getFilterValue() as string[] | undefined) ?? [],
            )
          }
        />
      )}

      {/* Pagination */}
      {!isLoading && <DataTablePagination table={table} />}
    </div>
  );
}

// ─── Grid view ───────────────────────────────────────────────────────────────

import type { QueueEntry } from '@/api';

interface GridViewProps {
  rows: Row<Url>[];
  onAnalyze: (id: number) => void;
  onDelete: (id: number, name: string) => void;
  isAnalyzePending: boolean;
  queueState: Map<number, QueueEntry>;
  activeTags: string[];
  onTagClick: (tag: string) => void;
}

function GridView({
  rows,
  onAnalyze,
  onDelete,
  isAnalyzePending,
  queueState,
  activeTags,
  onTagClick,
}: GridViewProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {rows.map(({ original: u, getIsSelected, toggleSelected }) => (
        <div key={u.id} className="relative">
          <div className="absolute top-3 left-3 z-10">
            <Checkbox
              checked={getIsSelected()}
              onCheckedChange={() => toggleSelected()}
              aria-label={`Select ${u.name ?? u.url}`}
            />
          </div>
          <Card className="flex flex-col">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-0.5 min-w-0 pl-6">
                  <Link to={`/urls/${u.id}`} className="text-base font-semibold truncate hover:underline">
                    {u.name ?? new URL(u.url).hostname}
                  </Link>
                  <a
                    href={u.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-muted-foreground truncate hover:underline flex items-center gap-1"
                  >
                    {u.url}
                    <ExternalLink className="size-3 shrink-0" />
                  </a>
                </div>
                <Badge variant="secondary" className="shrink-0 text-xs">
                  {u.scheduleInterval === 'manual' ? 'Manual' : u.scheduleInterval}
                </Badge>
              </div>
              {u.tags && u.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {u.tags.map((tag) => (
                    <button key={tag} onClick={() => onTagClick(tag)} className="focus:outline-none">
                      <Badge
                        variant={activeTags.includes(tag) ? 'default' : 'outline'}
                        className="text-xs cursor-pointer hover:bg-accent transition-colors"
                      >
                        {tag}
                      </Badge>
                    </button>
                  ))}
                </div>
              )}
            </CardHeader>

            <CardContent className="flex-1 flex flex-col gap-4">
              <div className="flex justify-around">
                <ScoreCircle score={u.latestMobile?.performanceScore ?? null} label="Mobile" />
                <ScoreCircle score={u.latestDesktop?.performanceScore ?? null} label="Desktop" />
              </div>

              <div className="flex flex-col items-center gap-1">
                {queueState.get(u.id) && (
                  <span
                    className={`text-xs font-medium ${
                      queueState.get(u.id)?.status === 'running'
                        ? 'text-blue-600'
                        : queueState.get(u.id)?.status === 'failed'
                        ? 'text-destructive'
                        : queueState.get(u.id)?.status === 'done'
                        ? 'text-green-600'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {queueState.get(u.id)?.status === 'queued' && 'En cola'}
                    {queueState.get(u.id)?.status === 'running' && '⏳ Analizando…'}
                    {queueState.get(u.id)?.status === 'done' && '✓ Listo'}
                    {queueState.get(u.id)?.status === 'failed' && '✗ Error'}
                  </span>
                )}
                <p className="text-xs text-muted-foreground text-center">
                  Last analyzed: {timeAgo(u.lastAnalyzed)}
                </p>
              </div>

              <div className="flex gap-2 mt-auto">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => onAnalyze(u.id)}
                  disabled={
                    isAnalyzePending ||
                    queueState.get(u.id)?.status === 'queued' ||
                    queueState.get(u.id)?.status === 'running'
                  }
                >
                  {queueState.get(u.id)?.status === 'running' ? (
                    <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" />
                  ) : (
                    <RefreshCw className="size-3.5" data-icon="inline-start" />
                  )}
                  Analyze
                </Button>
                <Button variant="outline" size="sm" className="flex-1" asChild>
                  <Link to={`/urls/${u.id}`}>View details</Link>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDelete(u.id, u.name ?? u.url)}
                >
                  <Trash2 className="size-3.5 text-destructive" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ))}
    </div>
  );
}
