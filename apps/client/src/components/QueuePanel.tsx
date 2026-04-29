import { useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';
import type { QueueEntry, Url } from '@/api';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

function statusOrder(s: QueueEntry['status']) {
  return s === 'running' ? 0 : s === 'queued' ? 1 : s === 'failed' ? 2 : 3;
}

interface Props {
  queueState: Map<number, QueueEntry>;
  urls: Url[];
}

export default function QueuePanel({ queueState, urls }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  if (queueState.size === 0) return null;

  const urlMap = new Map(urls.map((u) => [u.id, u]));
  const entries = [...queueState.values()].sort(
    (a, b) => statusOrder(a.status) - statusOrder(b.status),
  );

  const running = entries.filter((e) => e.status === 'running').length;
  const queued = entries.filter((e) => e.status === 'queued').length;
  const done = entries.filter((e) => e.status === 'done').length;
  const failed = entries.filter((e) => e.status === 'failed').length;

  return (
    <TooltipProvider>
      <div className="rounded-lg border bg-card text-card-foreground shadow-sm overflow-hidden">
        {/* Header */}
        <button
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
          onClick={() => setCollapsed((c) => !c)}
        >
          <div className="flex items-center gap-3">
            {running > 0 && <Loader2 className="size-4 animate-spin text-blue-500" />}
            <span className="text-sm font-medium">Cola de análisis</span>
            <div className="flex gap-1.5">
              {running > 0 && (
                <Badge variant="secondary" className="text-xs text-blue-600 bg-blue-50 border-blue-200">
                  {running} corriendo
                </Badge>
              )}
              {queued > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {queued} en cola
                </Badge>
              )}
              {done > 0 && (
                <Badge variant="secondary" className="text-xs text-green-600 bg-green-50 border-green-200">
                  {done} listo{done > 1 ? 's' : ''}
                </Badge>
              )}
              {failed > 0 && (
                <Badge variant="destructive" className="text-xs">
                  {failed} error{failed > 1 ? 'es' : ''}
                </Badge>
              )}
            </div>
          </div>
          {collapsed ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronUp className="size-4 text-muted-foreground" />}
        </button>

        {/* Entry list */}
        {!collapsed && (
          <div className="border-t divide-y max-h-64 overflow-y-auto">
            {entries.map((entry) => {
              const url = urlMap.get(entry.urlId);
              const name = url ? (url.name ?? new URL(url.url).hostname) : `URL #${entry.urlId}`;

              return (
                <div key={entry.urlId} className="flex items-center gap-3 px-4 py-2.5">
                  {entry.status === 'running' && (
                    <Loader2 className="size-4 shrink-0 animate-spin text-blue-500" />
                  )}
                  {entry.status === 'queued' && (
                    <Clock className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  {entry.status === 'done' && (
                    <CheckCircle2 className="size-4 shrink-0 text-green-500" />
                  )}
                  {entry.status === 'failed' && (
                    <XCircle className="size-4 shrink-0 text-destructive" />
                  )}

                  <span className="text-sm truncate flex-1 min-w-0">{name}</span>

                  {entry.status === 'running' && (
                    <span className="text-xs text-blue-600 shrink-0">Analizando…</span>
                  )}
                  {entry.status === 'queued' && (
                    <span className="text-xs text-muted-foreground shrink-0">En cola</span>
                  )}
                  {entry.status === 'done' && (
                    <span className="text-xs text-green-600 shrink-0">Listo</span>
                  )}
                  {entry.status === 'failed' && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-xs text-destructive shrink-0 cursor-help underline decoration-dotted">
                          Error
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-xs break-words">{entry.error ?? 'Error desconocido'}</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
