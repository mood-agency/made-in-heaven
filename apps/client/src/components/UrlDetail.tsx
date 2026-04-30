import { useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useUrls, useAnalyses, useAnalyze, useUpdateUrl, useTags, type ScheduleInterval } from '@/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
import { ArrowLeft, RefreshCw, Pencil, X } from 'lucide-react';
import type { Analysis } from '@/api';

const SCHEDULES = [
  { value: 'manual', label: 'Manual only' },
  { value: 'daily', label: 'Daily (9 AM)' },
];

function latestPerDay(analyses: Analysis[]): Analysis[] {
  const seen = new Set<string>();
  return analyses.filter((a) => {
    if (!a.analyzedAt) return false;
    const day = new Date(a.analyzedAt).toLocaleDateString();
    if (seen.has(day)) return false;
    seen.add(day);
    return true;
  });
}

function AnalysisTable({ analyses, strategy }: { analyses: Analysis[]; strategy: string }) {
  if (analyses.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium capitalize">{strategy}</p>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Score</TableHead>
              <TableHead className="text-right">FCP</TableHead>
              <TableHead className="text-right">LCP</TableHead>
              <TableHead className="text-right">TBT</TableHead>
              <TableHead className="text-right">CLS</TableHead>
              <TableHead className="text-right">SI</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {analyses.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {a.analyzedAt ? new Date(a.analyzedAt).toLocaleString() : '—'}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {a.performanceScore ?? '—'}
                </TableCell>
                <TableCell className="text-right">{a.fcp ? `${Math.round(a.fcp)}ms` : '—'}</TableCell>
                <TableCell className="text-right">{a.lcp ? `${Math.round(a.lcp)}ms` : '—'}</TableCell>
                <TableCell className="text-right">{a.tbt ? `${Math.round(a.tbt)}ms` : '—'}</TableCell>
                <TableCell className="text-right">{a.cls?.toFixed(3) ?? '—'}</TableCell>
                <TableCell className="text-right">{a.si ? `${Math.round(a.si)}ms` : '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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

export default function UrlDetail() {
  const { id } = useParams<{ id: string }>();
  const urlId = Number(id);

  const { data: urls } = useUrls();
  const urlData = urls?.find((u) => u.id === urlId);

  const analysesQ = useAnalyses(urlId);
  const mobileQ = { ...analysesQ, data: analysesQ.data?.filter((a) => a.strategy === 'mobile') };
  const desktopQ = { ...analysesQ, data: analysesQ.data?.filter((a) => a.strategy === 'desktop') };
  const analyze = useAnalyze();
  const updateUrl = useUpdateUrl();
  const { data: existingTags = [] } = useTags();

  const [editingTags, setEditingTags] = useState(false);
  const [localTags, setLocalTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);

  const [editingInfo, setEditingInfo] = useState(false);
  const [localName, setLocalName] = useState('');
  const [localUrl, setLocalUrl] = useState('');

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

      <div className="flex gap-4 flex-wrap">
        <StrategyCard strategy="mobile" latest={mobile[0]} />
        <StrategyCard strategy="desktop" latest={desktop[0]} />
      </div>

      {(mobileQ.isLoading || desktopQ.isLoading) && <Skeleton className="h-48 w-full" />}

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
