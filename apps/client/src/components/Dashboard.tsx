import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useUrls, useAnalyze, useDeleteUrl } from '@/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import ScoreCircle from '@/components/ScoreCircle';
import AddUrlDialog from '@/components/AddUrlDialog';
import BulkImportDialog from '@/components/BulkImportDialog';
import { RefreshCw, Trash2, ExternalLink, X } from 'lucide-react';

function timeAgo(date: string | null) {
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
  const { data: urls, isLoading } = useUrls();
  const analyze = useAnalyze();
  const deleteUrl = useDeleteUrl();
  const [activeTag, setActiveTag] = useState<string | null>(null);

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

  // Collect all unique tags from all URLs
  const allTags = Array.from(
    new Set((urls ?? []).flatMap((u) => u.tags ?? []))
  ).sort();

  const filtered = activeTag
    ? (urls ?? []).filter((u) => u.tags?.includes(activeTag))
    : urls;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">PageSpeed Monitor</h1>
        <div className="flex gap-2">
          <BulkImportDialog />
          <AddUrlDialog />
        </div>
      </div>

      {/* Tag filter bar */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
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
              <X className="size-3" /> Clear filter
            </button>
          )}
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

      {!isLoading && filtered?.length === 0 && (urls?.length ?? 0) > 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
          <p>No URLs match the selected tag.</p>
          <button onClick={() => setActiveTag(null)} className="text-sm underline">
            Clear filter
          </button>
        </div>
      )}

      {filtered && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((u) => (
            <Card key={u.id} className="flex flex-col">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-0.5 min-w-0">
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
                {/* Tags */}
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

                <p className="text-xs text-muted-foreground text-center">
                  Last analyzed: {timeAgo(u.lastAnalyzed)}
                </p>

                <div className="flex gap-2 mt-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleAnalyze(u.id)}
                    disabled={analyze.isPending}
                  >
                    <RefreshCw className="size-3.5" data-icon="inline-start" />
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
          ))}
        </div>
      )}
    </div>
  );
}
