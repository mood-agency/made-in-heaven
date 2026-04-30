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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import ScoreCircle from '@/components/ScoreCircle';
import AddUrlDialog from '@/components/AddUrlDialog';
import BulkImportDialog from '@/components/BulkImportDialog';
import UrlTable from '@/components/UrlTable';
import { arrayMove } from '@dnd-kit/sortable';
import { RefreshCw, Trash2, ExternalLink, X, LayoutGrid, Table2, Play, Download, Search, ChevronLeft, ChevronRight, Loader2, CalendarIcon } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type ViewMode = 'grid' | 'table';
type SortMode = 'manual' | 'alpha' | 'url' | 'mobile' | 'desktop';

function timeAgo(date: string | null): string {
  if (!date) return 'Never';
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function Dashboard() {
  const [activeDate, setActiveDate] = useState<Date | undefined>(undefined);
  const activeDateStr = activeDate ? activeDate.toLocaleDateString('en-CA') : undefined;
  const { data: urls, isLoading } = useUrls(activeDateStr);
  const analyze = useAnalyze();
  const analyzeAll = useAnalyzeAll();
  const analyzeSelected = useAnalyzeSelected();
  const deleteUrl = useDeleteUrl();
  const updateUrl = useUpdateUrl();
  const queueState = useQueueState();

  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(
    () => (localStorage.getItem('mih-view') ?? 'table') as ViewMode,
  );
  const [sortMode, setSortMode] = useState<SortMode>(
    () => (localStorage.getItem('mih-sort') ?? 'manual') as SortMode,
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [pageSize, setPageSize] = useState<number>(
    () => Number(localStorage.getItem('mih-page-size') ?? '20'),
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [localUrls, setLocalUrls] = useState<Url[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  function changeView(mode: ViewMode) {
    setViewMode(mode);
    localStorage.setItem('mih-view', mode);
  }

  function changeSort(mode: SortMode) {
    setSortMode(mode);
    localStorage.setItem('mih-sort', mode);
  }

  function changePageSize(size: number) {
    setPageSize(size);
    setCurrentPage(1);
    localStorage.setItem('mih-page-size', String(size));
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
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

  async function handleAnalyzeSelected() {
    const ids = [...selectedIds];
    try {
      const data = await analyzeSelected.mutateAsync(ids);
      const count = data.queued ?? data.started ?? 0;
      const verb = data.queued !== undefined ? 'queued' : 'started';
      toast.success(`${count} URL${count !== 1 ? 's' : ''} ${verb} for analysis`);
      clearSelection();
    } catch (err) {
      toast.error(String(err));
    }
  }

  async function handleAnalyzeFiltered() {
    const ids = searched.map((u) => u.id);
    try {
      const data = await analyzeSelected.mutateAsync(ids);
      const count = data.queued ?? data.started ?? 0;
      const verb = data.queued !== undefined ? 'queued' : 'started';
      toast.success(`${count} URL${count !== 1 ? 's' : ''} ${verb} for analysis`);
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

  function handleReorder(oldIndex: number, newIndex: number) {
    const newOrder = arrayMove(localUrls, oldIndex, newIndex);
    setLocalUrls(newOrder);
    newOrder.forEach((u, i) => {
      if (u.displayOrder !== i + 1) {
        updateUrl.mutate({ id: u.id, displayOrder: i + 1 });
      }
    });
  }

  const allTags = Array.from(
    new Set((urls ?? []).flatMap((u) => u.tags ?? []))
  ).sort();

  const filtered = useMemo(
    () => activeTag
      ? (urls ?? []).filter((u) => u.tags?.includes(activeTag))
      : (urls ?? []),
    [urls, activeTag],
  );

  // Server-side manual order (source of truth for localUrls sync)
  const filteredManual = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (a.displayOrder == null && b.displayOrder == null) return 0;
      if (a.displayOrder == null) return 1;
      if (b.displayOrder == null) return -1;
      return a.displayOrder - b.displayOrder;
    });
  }, [filtered]);

  // Sync localUrls from server when data changes; reset selection on filter change
  useEffect(() => {
    startTransition(() => {
      setLocalUrls(filteredManual);
      setSelectedIds(new Set());
    });
  }, [filteredManual]);

  const sorted = useMemo(() => {
    if (sortMode === 'manual') return localUrls;
    return [...filtered].sort((a, b) => {
      switch (sortMode) {
        case 'alpha': {
          const nameA = a.name ?? new URL(a.url).hostname;
          const nameB = b.name ?? new URL(b.url).hostname;
          return nameA.localeCompare(nameB);
        }
        case 'url':
          return a.url.localeCompare(b.url);
        case 'mobile': {
          const sa = a.latestMobile?.performanceScore ?? -1;
          const sb = b.latestMobile?.performanceScore ?? -1;
          return sb - sa;
        }
        case 'desktop': {
          const sa = a.latestDesktop?.performanceScore ?? -1;
          const sb = b.latestDesktop?.performanceScore ?? -1;
          return sb - sa;
        }
      }
    });
  }, [filtered, sortMode, localUrls]);

  const searched = useMemo(() => {
    if (!searchQuery.trim()) return sorted;
    const q = searchQuery.toLowerCase();
    return sorted.filter((u) => u.url.toLowerCase().includes(q));
  }, [sorted, searchQuery]);

  const totalPages = Math.ceil(searched.length / pageSize) || 1;

  const paginated = useMemo(
    () => searched.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [searched, currentPage, pageSize],
  );

  useEffect(() => { setCurrentPage(1); }, [searchQuery, activeTag, activeDateStr]);

  const toggleSelectAll = () => {
    const visibleIds = paginated.map((u) => u.id);
    const allSelected = visibleIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">PageSpeed Monitor</h1>
        <div className="flex flex-wrap items-center gap-2">
          {/* Sort controls */}
          <div className="flex rounded-md border overflow-hidden text-xs">
            {(['manual', 'alpha', 'url', 'mobile', 'desktop'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => changeSort(mode)}
                className={`px-3 py-1.5 transition-colors ${
                  sortMode === mode
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-accent text-muted-foreground'
                }`}
              >
                {mode === 'manual' ? '#' : mode === 'alpha' ? 'A-Z' : mode === 'url' ? 'URL' : mode === 'mobile' ? 'Mobile' : 'Desktop'}
              </button>
            ))}
          </div>

          {/* View toggle */}
          <div className="flex rounded-md border overflow-hidden">
            <button
              onClick={() => changeView('grid')}
              title="Vista cuadrícula"
              className={`p-1.5 transition-colors ${
                viewMode === 'grid' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-muted-foreground'
              }`}
            >
              <LayoutGrid className="size-4" />
            </button>
            <button
              onClick={() => changeView('table')}
              title="Vista tabla"
              className={`p-1.5 transition-colors ${
                viewMode === 'table' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent text-muted-foreground'
              }`}
            >
              <Table2 className="size-4" />
            </button>
          </div>

          {/* Run filtered — shown when any filter is active */}
          {(activeTag || searchQuery.trim() || activeDate) ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleAnalyzeFiltered}
              disabled={analyzeSelected.isPending || searched.length === 0}
            >
              <Play className="size-3.5" data-icon="inline-start" />
              Run filtered ({searched.length})
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
                const isFiltered = activeTag !== null || searchQuery.trim() !== '' || activeDate !== undefined;
                await downloadScoresCsv(isFiltered ? searched.map((u) => u.id) : undefined, activeDateStr);
              } catch (err) {
                toast.error(String(err));
              }
            }}
            disabled={(urls?.length ?? 0) === 0}
            title="Download scores as CSV"
          >
            <Download className="size-3.5" data-icon="inline-start" />
            {(activeTag || searchQuery.trim() || activeDate) ? `Download CSV (${searched.length})` : 'Download CSV'}
          </Button>

          <BulkImportDialog />
          <AddUrlDialog />
        </div>
      </div>

      {/* URL search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by URL…"
          className="pl-8 pr-8"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {/* Tag filter bar + date filter */}
      {(allTags.length > 0 || true) && (
        <div className="flex flex-wrap gap-2 items-center">
          {allTags.length > 0 && (
            <>
              <span className="text-xs text-muted-foreground">Filter by tag:</span>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                  className="focus:outline-none"
                >
                  <Badge
                    variant={activeTag === tag ? 'default' : 'outline'}
                    className="cursor-pointer hover:bg-accent transition-colors"
                  >
                    {tag}
                  </Badge>
                </button>
              ))}
              {activeTag && (
                <button
                  onClick={() => setActiveTag(null)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" /> Clear
                </button>
              )}
              <span className="text-muted-foreground/40 text-xs">|</span>
            </>
          )}

          {/* Date filter */}
          <span className="text-xs text-muted-foreground">Date:</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={activeDate ? 'default' : 'outline'}
                size="sm"
                className="h-7 px-2 text-xs gap-1.5"
              >
                <CalendarIcon className="size-3.5" />
                {(activeDate ?? new Date()).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={activeDate}
                onSelect={(day) => setActiveDate(day ?? undefined)}
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
      )}

      {/* Selection action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted text-sm">
          <span className="text-muted-foreground">{selectedIds.size} selected</span>
          <Button
            size="sm"
            variant="outline"
            onClick={handleAnalyzeSelected}
            disabled={analyzeSelected.isPending}
          >
            <Play className="size-3.5" data-icon="inline-start" />
            Run Selected ({selectedIds.size})
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              try {
                await downloadScoresCsv([...selectedIds]);
              } catch (err) {
                toast.error(String(err));
              }
            }}
          >
            <Download className="size-3.5" data-icon="inline-start" />
            Download CSV
          </Button>
          <Button size="sm" variant="ghost" onClick={clearSelection}>
            <X className="size-3.5" data-icon="inline-start" />
            Clear
          </Button>
        </div>
      )}

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-52 rounded-xl" />
          ))}
        </div>
      )}

      {!isLoading && urls?.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-muted-foreground">
          <p className="text-lg">No URLs added yet.</p>
          <AddUrlDialog />
        </div>
      )}

      {!isLoading && searched.length === 0 && (urls?.length ?? 0) > 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
          {searchQuery.trim() ? (
            <>
              <p>No URLs match your search.</p>
              <button onClick={() => setSearchQuery('')} className="text-sm underline">
                Clear search
              </button>
            </>
          ) : (
            <>
              <p>No URLs match the selected tag.</p>
              <button onClick={() => setActiveTag(null)} className="text-sm underline">
                Clear filter
              </button>
            </>
          )}
        </div>
      )}

      {searched.length > 0 && viewMode === 'table' && (
        <UrlTable
          urls={paginated}
          sortMode={sortMode}
          activeTag={activeTag}
          onTagClick={(tag) => setActiveTag(activeTag === tag ? null : tag)}
          onReorder={handleReorder}
          onAnalyze={handleAnalyze}
          onDelete={handleDelete}
          isAnalyzePending={analyze.isPending}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          queueState={queueState}
        />
      )}

      {searched.length > 0 && viewMode === 'grid' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {paginated.map((u) => (
            <div key={u.id} className="relative">
              <div className="absolute top-3 left-3 z-10">
                <Checkbox
                  checked={selectedIds.has(u.id)}
                  onCheckedChange={() => toggleSelect(u.id)}
                  aria-label={`Select ${u.name ?? u.url}`}
                />
              </div>
              <Card className="flex flex-col">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-0.5 min-w-0 pl-6">
                      <CardTitle className="text-base truncate">
                        {u.name ?? new URL(u.url).hostname}
                      </CardTitle>
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
                        <button
                          key={tag}
                          onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                          className="focus:outline-none"
                        >
                          <Badge
                            variant={activeTag === tag ? 'default' : 'outline'}
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
                      <span className={`text-xs font-medium ${
                        queueState.get(u.id)?.status === 'running' ? 'text-blue-600' :
                        queueState.get(u.id)?.status === 'failed' ? 'text-destructive' :
                        queueState.get(u.id)?.status === 'done' ? 'text-green-600' :
                        'text-muted-foreground'
                      }`}>
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
                      onClick={() => handleAnalyze(u.id)}
                      disabled={analyze.isPending || queueState.get(u.id)?.status === 'queued' || queueState.get(u.id)?.status === 'running'}
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
                      onClick={() => handleDelete(u.id, u.name ?? u.url)}
                    >
                      <Trash2 className="size-3.5 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {searched.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <span className="text-xs text-muted-foreground">
            {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, searched.length)} of {searched.length}
          </span>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-xs text-muted-foreground tabular-nums">
              {currentPage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>

          <div className="flex rounded-md border overflow-hidden text-xs">
            {([20, 50, 100] as const).map((size) => (
              <button
                key={size}
                onClick={() => changePageSize(size)}
                className={`px-3 py-1.5 transition-colors ${
                  pageSize === size
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-accent text-muted-foreground'
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
