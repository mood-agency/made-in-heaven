import { useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useUrls, useAnalyses, useAnalyze, useUpdateUrl, useTags, useRefreshMetadata, type ScheduleInterval } from '@/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import ScoreCircle from '@/components/ScoreCircle';
import { MetricChart, METRICS } from '@/components/MetricsChart';
import { Input } from '@/components/ui/input';
import { ArrowLeft, RefreshCw, Pencil, X, ExternalLink } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import type { Analysis } from '@/api';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { DataTable } from '@/components/ui/data-table';
import { SortIcon } from '@/components/url-table-helpers';

const SCHEDULES = [
  { value: 'manual', label: 'Manual only' },
  { value: 'daily', label: 'Daily (9 AM)' },
];

function latestPerDay(analyses: Analysis[]): Analysis[] {
  const seen = new Set<string>();
  return analyses.filter((a) => {
    if (!a.analyzedAt) return false;
    const day = new Date(a.analyzedAt).toISOString().slice(0, 10);
    if (seen.has(day)) return false;
    seen.add(day);
    return true;
  });
}

function makeAnalysisHeader(label: string) {
  return ({ column }: { column: { getIsSorted: () => false | 'asc' | 'desc'; getToggleSortingHandler: () => ((e: unknown) => void) | undefined } }) => (
    <button
      className="flex items-center justify-end w-full hover:text-foreground"
      onClick={(e) => column.getToggleSortingHandler()?.(e)}
    >
      {label}
      <SortIcon sorted={column.getIsSorted()} />
    </button>
  );
}

function DiffBadge({ diffPercent }: { diffPercent: number | null | undefined }) {
  if (diffPercent === null || diffPercent === undefined) {
    return <span className="text-xs text-muted-foreground">First capture</span>;
  }
  if (diffPercent < 0.5) {
    return <span className="text-xs font-medium text-green-600 dark:text-green-400">No change</span>;
  }
  if (diffPercent < 5) {
    return <span className="text-xs font-medium text-yellow-600 dark:text-yellow-400">{diffPercent.toFixed(1)}% changed</span>;
  }
  return <span className="text-xs font-medium text-red-600 dark:text-red-400">{diffPercent.toFixed(1)}% changed</span>;
}

type LightboxState = { src: string; label: string; diffSrc?: string; wide?: boolean };

function ScreenshotCard({
  label,
  analysis,
  wide,
  onOpen,
}: {
  label: string;
  analysis: Analysis | undefined;
  wide?: boolean;
  onOpen: (state: LightboxState) => void;
}) {
  if (!analysis?.screenshotKey) return null;
  const src = `/api/screenshots/${analysis.screenshotKey}`;
  const diffSrc = analysis.diffKey ? `/api/screenshots/${analysis.diffKey}` : undefined;
  return (
    <div className="flex flex-col gap-1.5 flex-1 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
        <div className="flex items-center gap-2">
          <DiffBadge diffPercent={analysis.diffPercent} />
          {diffSrc && (
            <button
              onClick={() => onOpen({ src: diffSrc, label: `${label} — Diff`, wide })}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Diff
            </button>
          )}
        </div>
      </div>
      <button
        onClick={() => onOpen({ src, label, diffSrc, wide })}
        className="block w-full text-left cursor-zoom-in"
      >
        <div className="aspect-[4/3] overflow-hidden rounded border bg-muted">
          <img
            src={src}
            alt={`${label} screenshot`}
            loading="lazy"
            className="w-full h-full object-cover object-top"
          />
        </div>
      </button>
    </div>
  );
}

function ScreenshotPanel({ mobile, desktop }: { mobile: Analysis | undefined; desktop: Analysis | undefined }) {
  const hasAny = mobile?.screenshotKey || desktop?.screenshotKey;
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);

  if (!hasAny) return null;
  return (
    <>
      <div className="flex flex-col gap-2 p-4 rounded-lg border bg-muted/30">
        <p className="text-sm font-medium">Latest screenshots</p>
        <div className="flex gap-3 flex-col sm:flex-row">
          <ScreenshotCard label="Mobile" analysis={mobile} onOpen={setLightbox} />
          <ScreenshotCard label="Desktop" analysis={desktop} wide onOpen={setLightbox} />
        </div>
      </div>

      <Dialog open={!!lightbox} onOpenChange={(open) => { if (!open) setLightbox(null); }}>
        <DialogContent
          className={`p-0 gap-0 overflow-hidden ${lightbox?.wide ? 'max-w-[95vw] sm:max-w-[95vw] w-[95vw]' : 'max-w-sm sm:max-w-sm'}`}
          showCloseButton={false}
        >
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b">
            <span className="text-sm font-medium">{lightbox?.label}</span>
            <div className="flex items-center gap-1">
              {lightbox?.diffSrc && (
                <button
                  onClick={() => setLightbox({ src: lightbox.diffSrc!, label: `${lightbox.label} — Diff`, wide: lightbox.wide })}
                  className="text-xs text-muted-foreground hover:text-foreground underline px-2 py-1"
                >
                  Diff
                </button>
              )}
              <a
                href={lightbox?.src}
                target="_blank"
                rel="noreferrer"
                title="Open full size"
                className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <ExternalLink className="size-3.5" />
              </a>
              <button
                onClick={() => setLightbox(null)}
                className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>
          <div className="overflow-y-auto max-h-[85vh]">
            {lightbox && (
              <img src={lightbox.src} alt={lightbox.label} className="w-full block" />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

const analysisColumns: ColumnDef<Analysis>[] = [
  {
    id: 'analyzedAt',
    accessorFn: (a) => a.analyzedAt ? new Date(a.analyzedAt).getTime() : 0,
    header: ({ column }) => (
      <button className="flex items-center hover:text-foreground" onClick={(e) => column.getToggleSortingHandler()?.(e)}>
        Date <SortIcon sorted={column.getIsSorted()} />
      </button>
    ),
    cell: ({ row }) => (
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {row.original.analyzedAt ? new Date(row.original.analyzedAt).toLocaleString() : '—'}
      </span>
    ),
    sortDescFirst: true,
  },
  {
    id: 'score',
    accessorFn: (a) => a.performanceScore ?? -1,
    header: makeAnalysisHeader('Score'),
    cell: ({ row }) => (
      <div className="text-right font-medium">{row.original.performanceScore ?? '—'}</div>
    ),
  },
  {
    id: 'fcp',
    accessorFn: (a) => a.fcp ?? -1,
    header: makeAnalysisHeader('FCP'),
    cell: ({ row }) => <div className="text-right">{row.original.fcp ? `${Math.round(row.original.fcp)}ms` : '—'}</div>,
  },
  {
    id: 'lcp',
    accessorFn: (a) => a.lcp ?? -1,
    header: makeAnalysisHeader('LCP'),
    cell: ({ row }) => <div className="text-right">{row.original.lcp ? `${Math.round(row.original.lcp)}ms` : '—'}</div>,
  },
  {
    id: 'tbt',
    accessorFn: (a) => a.tbt ?? -1,
    header: makeAnalysisHeader('TBT'),
    cell: ({ row }) => <div className="text-right">{row.original.tbt ? `${Math.round(row.original.tbt)}ms` : '—'}</div>,
  },
  {
    id: 'cls',
    accessorFn: (a) => a.cls ?? -1,
    header: makeAnalysisHeader('CLS'),
    cell: ({ row }) => <div className="text-right">{row.original.cls?.toFixed(3) ?? '—'}</div>,
  },
  {
    id: 'si',
    accessorFn: (a) => a.si ?? -1,
    header: makeAnalysisHeader('SI'),
    cell: ({ row }) => <div className="text-right">{row.original.si ? `${Math.round(row.original.si)}ms` : '—'}</div>,
  },
  {
    id: 'screenshot',
    header: () => <div className="text-right">📸</div>,
    cell: ({ row }) => (
      <div className="flex justify-end gap-1.5">
        {row.original.screenshotKey && (
          <a
            href={`/api/screenshots/${row.original.screenshotKey}`}
            target="_blank"
            rel="noreferrer"
            title="View screenshot"
            className="text-muted-foreground hover:text-foreground"
          >
            📸
          </a>
        )}
        {row.original.diffKey && (
          <a
            href={`/api/screenshots/${row.original.diffKey}`}
            target="_blank"
            rel="noreferrer"
            title="View diff"
            className="text-muted-foreground hover:text-foreground"
          >
            Δ
          </a>
        )}
      </div>
    ),
    enableSorting: false,
  },
];

function AnalysisTable({ analyses, strategy }: { analyses: Analysis[]; strategy: string }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'analyzedAt', desc: true }]);

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: analyses,
    columns: analysisColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId: (a) => String(a.id),
  });

  if (analyses.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium capitalize">{strategy}</p>
      <div className="overflow-x-auto">
        <DataTable table={table} />
      </div>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function StrategyCard({ strategy, latest }: { strategy: string; latest: Analysis | undefined }) {
  return (
    <Card className="flex-1">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm capitalize">{strategy}</CardTitle>
      </CardHeader>
      <CardContent>
        {!latest ? (
          <p className="text-sm text-muted-foreground">No data yet.</p>
        ) : latest.error ? (
          <p className="text-sm text-destructive">{latest.error}</p>
        ) : (
          <div className="flex gap-6 items-start">
            <ScoreCircle score={latest.performanceScore} label="Score" />
            <div className="flex flex-col gap-1.5 flex-1">
              <MetricRow label="FCP" value={latest.fcp ? `${Math.round(latest.fcp)}ms` : '—'} />
              <MetricRow label="LCP" value={latest.lcp ? `${Math.round(latest.lcp)}ms` : '—'} />
              <MetricRow label="TBT" value={latest.tbt ? `${Math.round(latest.tbt)}ms` : '—'} />
              <MetricRow label="CLS" value={latest.cls?.toFixed(3) ?? '—'} />
              <MetricRow label="SI" value={latest.si ? `${Math.round(latest.si)}ms` : '—'} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MetaPreview({
  image,
  title,
  description,
  onRefresh,
  refreshing,
}: {
  image: string | null;
  title: string | null;
  description: string | null;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const isEmpty = !image && !title && !description;
  return (
    <div className="flex items-start gap-4 p-4 rounded-lg border bg-muted/30">
      {image && (
        <img
          src={image}
          alt=""
          className="size-20 rounded object-cover shrink-0 bg-muted"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      )}
      <div className="flex-1 min-w-0">
        {title && <p className="text-sm font-medium truncate">{title}</p>}
        {description && (
          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-3">{description}</p>
        )}
        {isEmpty && (
          <p className="text-sm text-muted-foreground">No preview yet — click refresh or run an analysis.</p>
        )}
      </div>
      <button
        onClick={onRefresh}
        disabled={refreshing}
        title="Refresh title, description and preview image"
        className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} />
      </button>
    </div>
  );
}

export default function UrlDetail() {
  const { id } = useParams<{ id: string }>();
  const urlId = Number(id);

  const { data: urls } = useUrls();
  const urlData = urls?.find((u) => u.id === urlId);

  const isoToday = new Date().toISOString().slice(0, 10);
  function daysAgoISO(n: number) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }
  const { startDate, endDate } = ((): { startDate?: string; endDate?: string } => {
    if (datePreset === '7d')  return { startDate: daysAgoISO(6),  endDate: isoToday };
    if (datePreset === '30d') return { startDate: daysAgoISO(29), endDate: isoToday };
    if (datePreset === '90d') return { startDate: daysAgoISO(89), endDate: isoToday };
    if (datePreset === 'all') return {};
    return { startDate: customStart || undefined, endDate: customEnd || undefined };
  })();

  const analysesQ = useAnalyses(urlId, { startDate, endDate });
  const mobileQ = { ...analysesQ, data: analysesQ.data?.filter((a) => a.strategy === 'mobile') };
  const desktopQ = { ...analysesQ, data: analysesQ.data?.filter((a) => a.strategy === 'desktop') };
  const analyze = useAnalyze();
  const updateUrl = useUpdateUrl();
  const refreshMeta = useRefreshMetadata();
  const { data: existingTags = [] } = useTags();

  const [editingTags, setEditingTags] = useState(false);
  const [localTags, setLocalTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);

  const [editingInfo, setEditingInfo] = useState(false);
  const [localName, setLocalName] = useState('');
  const [localUrl, setLocalUrl] = useState('');

  type DatePreset = '7d' | '30d' | '90d' | 'all' | 'custom';
  const [datePreset, setDatePreset] = useState<DatePreset>('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  function startEditingInfo() {
    setLocalName(urlData?.name ?? '');
    setLocalUrl(urlData?.url ?? '');
    setEditingInfo(true);
  }

  async function handleSaveInfo() {
    try {
      await updateUrl.mutateAsync({
        id: urlId,
        name: localName.trim() || undefined,
        url: localUrl.trim(),
      });
      toast.success('URL updated');
      setEditingInfo(false);
    } catch (err) {
      toast.error(String(err));
    }
  }

  const tagSuggestions = existingTags
    .map((t) => t.name)
    .filter((n) => n.includes(tagInput.toLowerCase()) && !localTags.includes(n));

  function startEditingTags() {
    setLocalTags(urlData?.tags ?? []);
    setTagInput('');
    setEditingTags(true);
  }

  function addLocalTag(tag: string) {
    const normalized = tag.trim().toLowerCase();
    if (normalized && !localTags.includes(normalized)) {
      setLocalTags((prev) => [...prev, normalized]);
    }
    setTagInput('');
    setShowSuggestions(false);
  }

  function removeLocalTag(tag: string) {
    setLocalTags((prev) => prev.filter((t) => t !== tag));
  }

  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (tagInput.trim()) addLocalTag(tagInput);
    } else if (e.key === 'Backspace' && !tagInput && localTags.length > 0) {
      setLocalTags((prev) => prev.slice(0, -1));
    }
  }

  async function handleSaveTags() {
    const pendingTag = tagInput.trim().toLowerCase();
    const finalTags = pendingTag && !localTags.includes(pendingTag)
      ? [...localTags, pendingTag]
      : localTags;
    try {
      await updateUrl.mutateAsync({ id: urlId, tags: finalTags });
      toast.success('Tags updated');
      setEditingTags(false);
    } catch (err) {
      toast.error(String(err));
    }
  }

  async function handleRefreshMeta() {
    try {
      await refreshMeta.mutateAsync(urlId);
      toast.success('Preview image updated');
    } catch (err) {
      toast.error(String(err));
    }
  }

  async function handleAnalyze() {
    try {
      await analyze.mutateAsync(urlId);
      toast.success('Analysis started — results in ~10s');
    } catch (err) {
      toast.error(String(err));
    }
  }

  async function handleScheduleChange(value: string) {
    try {
      await updateUrl.mutateAsync({ id: urlId, scheduleInterval: value as ScheduleInterval });
      toast.success('Schedule updated');
    } catch (err) {
      toast.error(String(err));
    }
  }

  if (!urlData) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const mobile = mobileQ.data ?? [];
  const desktop = desktopQ.data ?? [];
  const hasHistory = mobile.length > 0 || desktop.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4 flex-wrap">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/">
            <ArrowLeft className="size-4" />
            Back
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          {!editingInfo ? (
            <div className="flex items-center gap-1.5 group">
              <div className="min-w-0">
                <h1 className="text-xl font-semibold truncate">{urlData.name ?? urlData.url}</h1>
                <p className="text-xs text-muted-foreground truncate">{urlData.url}</p>
              </div>
              <button
                onClick={startEditingInfo}
                className="shrink-0 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                title="Edit name and URL"
              >
                <Pencil className="size-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-1.5">
                <Input
                  placeholder="Name (optional)"
                  value={localName}
                  onChange={(e) => setLocalName(e.target.value)}
                  className="h-8 text-sm"
                />
                <Input
                  placeholder="https://example.com"
                  value={localUrl}
                  onChange={(e) => setLocalUrl(e.target.value)}
                  required
                  type="url"
                  className="h-8 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveInfo} disabled={updateUrl.isPending || !localUrl.trim()}>
                  {updateUrl.isPending ? 'Saving…' : 'Save'}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditingInfo(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
        {/* Tags */}
        {!editingTags ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {(urlData.tags ?? []).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
            ))}
            <button
              onClick={startEditingTags}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Pencil className="size-3" />
              {urlData.tags?.length ? 'Edit tags' : 'Add tags'}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2 w-full">
            <div className="relative">
              <div
                className="flex flex-wrap gap-1.5 min-h-9 px-3 py-1.5 rounded-md border border-input bg-background cursor-text"
                onClick={() => tagInputRef.current?.focus()}
              >
                {localTags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1 text-xs">
                    {tag}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); removeLocalTag(tag); }}
                      className="hover:text-destructive"
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
                <input
                  ref={tagInputRef}
                  value={tagInput}
                  onChange={(e) => { setTagInput(e.target.value); setShowSuggestions(true); }}
                  onKeyDown={handleTagKeyDown}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  placeholder={localTags.length === 0 ? 'Add tags…' : ''}
                  className="flex-1 min-w-20 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  autoFocus
                />
              </div>
              {showSuggestions && tagSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-md border bg-popover shadow-md">
                  {tagSuggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent"
                      onMouseDown={() => addLocalTag(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSaveTags} disabled={updateUrl.isPending}>
                {updateUrl.isPending ? 'Saving…' : 'Save tags'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditingTags(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
        <Select value={urlData.scheduleInterval} onValueChange={handleScheduleChange}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SCHEDULES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={handleAnalyze} disabled={analyze.isPending}>
          <RefreshCw className="size-4" />
          {analyze.isPending ? 'Analyzing…' : 'Analyze now'}
        </Button>
      </div>

      <MetaPreview
        image={urlData.metaImage}
        title={urlData.metaTitle}
        description={urlData.metaDescription}
        onRefresh={handleRefreshMeta}
        refreshing={refreshMeta.isPending}
      />

      <ScreenshotPanel mobile={mobile[0]} desktop={desktop[0]} />

      <div className="flex gap-4 flex-wrap">
        <StrategyCard strategy="mobile" latest={mobile[0]} />
        <StrategyCard strategy="desktop" latest={desktop[0]} />
      </div>

      {(mobileQ.isLoading || desktopQ.isLoading) && <Skeleton className="h-48 w-full" />}

      <div className="flex flex-wrap items-center gap-2">
        {(['7d', '30d', '90d', 'all'] as const).map((p) => (
          <Button
            key={p}
            size="sm"
            variant={datePreset === p ? 'default' : 'outline'}
            onClick={() => setDatePreset(p)}
          >
            {p === 'all' ? 'All time' : p.toUpperCase()}
          </Button>
        ))}
        <Button
          size="sm"
          variant={datePreset === 'custom' ? 'default' : 'outline'}
          onClick={() => setDatePreset('custom')}
        >
          Custom
        </Button>
        {datePreset === 'custom' && (
          <>
            <input
              type="date"
              value={customStart}
              max={customEnd || isoToday}
              onChange={(e) => setCustomStart(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            />
            <span className="text-sm text-muted-foreground">to</span>
            <input
              type="date"
              value={customEnd}
              min={customStart}
              max={isoToday}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            />
          </>
        )}
      </div>

      {hasHistory && (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                History — {Math.max(mobile.length, desktop.length)} analyses
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {METRICS.map((m) => (
                  <MetricChart
                    key={m.key as string}
                    mobile={latestPerDay(mobile)}
                    desktop={latestPerDay(desktop)}
                    metric={m}
                  />
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">All results</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <AnalysisTable analyses={mobile} strategy="mobile" />
              <AnalysisTable analyses={desktop} strategy="desktop" />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
