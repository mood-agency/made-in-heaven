import { useParams, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useUrls, useAnalyses, useAnalyze, useUpdateUrl, type ScheduleInterval } from '@/api';
import { Button } from '@/components/ui/button';
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
import { ArrowLeft, RefreshCw } from 'lucide-react';
import type { Analysis } from '@/api';

const SCHEDULES = [
  { value: 'manual', label: 'Manual only' },
  { value: 'hourly', label: 'Every hour' },
  { value: 'every6h', label: 'Every 6 hours' },
  { value: 'every12h', label: 'Every 12 hours' },
  { value: 'daily', label: 'Daily (9 AM)' },
  { value: 'weekly', label: 'Weekly (Mon 9 AM)' },
];

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

  const mobileQ = useAnalyses(urlId, 'mobile');
  const desktopQ = useAnalyses(urlId, 'desktop');
  const analyze = useAnalyze();
  const updateUrl = useUpdateUrl();

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
          <h1 className="text-xl font-semibold truncate">{urlData.name ?? urlData.url}</h1>
          <p className="text-xs text-muted-foreground truncate">{urlData.url}</p>
        </div>
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
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              History — {Math.max(mobile.length, desktop.length)} analyses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {METRICS.map((m) => (
                <MetricChart key={m.key as string} mobile={mobile} desktop={desktop} metric={m} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
