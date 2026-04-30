import { useEffect, useRef, useState } from 'react';
import { Drawer as DrawerPrimitive } from 'vaul';
import { Loader2, CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp, X, Ban, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { QueueEntry, Url } from '@/api';
import { useCancelQueue, useAnalyze } from '@/api';
import { Drawer, DrawerPortal, DrawerHeader, DrawerTitle, DrawerClose } from '@/components/ui/drawer';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

function statusOrder(s: QueueEntry['status']) {
  return s === 'running' ? 0 : s === 'queued' ? 1 : s === 'failed' ? 2 : s === 'cancelled' ? 3 : 4;
}

interface Props {
  queueState: Map<number, QueueEntry>;
  urls: Url[];
}

export default function QueueDrawer({ queueState, urls }: Props) {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const cancelQueue = useCancelQueue();
  const analyze = useAnalyze();

  const entries = [...queueState.values()]
    .filter((e) => !((e.status === 'done' || e.status === 'cancelled') && dismissed.has(e.urlId)))
    .sort((a, b) => statusOrder(a.status) - statusOrder(b.status));
  const urlMap = new Map(urls.map((u) => [u.id, u]));

  const running = entries.filter((e) => e.status === 'running').length;
  const queued = entries.filter((e) => e.status === 'queued').length;
  const done = entries.filter((e) => e.status === 'done').length;
  const failed = entries.filter((e) => e.status === 'failed').length;
  const cancelled = entries.filter((e) => e.status === 'cancelled').length;
  const total = entries.length;

  const prevSizeRef = useRef(0);
  useEffect(() => {
    const size = queueState.size;
    if (size > 0 && size > prevSizeRef.current) {
      setOpen(true);
      setMinimized(false);
    }
    prevSizeRef.current = size;
  }, [queueState.size]);

  if (total === 0 && !open) return null;

  // Chip when minimized
  if (minimized && total > 0) {
    return (
      <button
        onClick={() => { setMinimized(false); setOpen(true); }}
        className="fixed bottom-0 right-6 z-50 flex items-center gap-2 rounded-t-xl bg-card border border-b-0 shadow-2xl px-4 py-3 text-sm cursor-pointer"
      >
        {running > 0 ? (
          <Loader2 className="size-4 animate-spin text-blue-500 shrink-0" />
        ) : failed > 0 ? (
          <XCircle className="size-4 text-destructive shrink-0" />
        ) : (
          <CheckCircle2 className="size-4 text-green-500 shrink-0" />
        )}
        <span className="font-medium">
          {running > 0
            ? `${running} analizando…`
            : queued > 0
              ? `${queued} en cola`
              : failed > 0
                ? `${failed} con error`
                : `${done} listo${done > 1 ? 's' : ''}`}
        </span>
        <ChevronUp className="size-4 text-muted-foreground" />
      </button>
    );
  }

  return (
    <TooltipProvider>
      <Drawer
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setMinimized(false);
        }}
        modal={false}
        direction="bottom"
      >
        {/* Portal without overlay — custom bottom-right positioning */}
        <DrawerPortal>
          <DrawerPrimitive.Content
            className={cn(
              'fixed z-50 flex flex-col bg-popover text-sm text-popover-foreground',
              'bottom-0 right-6 w-96 max-h-[70vh]',
              'rounded-t-xl border border-b-0 shadow-2xl',
              'focus:outline-none',
            )}
          >
            <DrawerHeader className="flex-row items-center justify-between py-3 border-b shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                {running > 0 && <Loader2 className="size-4 animate-spin text-blue-500 shrink-0" />}
                <DrawerTitle className="text-sm truncate">
                  {running > 0
                    ? `Analizando ${running} de ${total}`
                    : queued > 0
                      ? `${queued} en cola`
                      : `Análisis completado`}
                </DrawerTitle>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {(queued > 0 || running > 0) && (
                  <button
                    onClick={() => cancelQueue.mutate({ includeRunning: true })}
                    disabled={cancelQueue.isPending}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs text-muted-foreground hover:bg-muted hover:text-destructive transition-colors"
                  >
                    <Ban className="size-3.5" />
                    Cancelar todo
                  </button>
                )}
                <button
                  onClick={() => { setMinimized(true); setOpen(false); }}
                  className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground"
                  title="Minimizar"
                >
                  <ChevronDown className="size-4" />
                </button>
                <DrawerClose className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground">
                  <X className="size-4" />
                </DrawerClose>
              </div>
            </DrawerHeader>

            {/* Status summary */}
            <div className="flex flex-wrap gap-x-3 gap-y-1 px-4 py-2 text-xs text-muted-foreground border-b shrink-0">
              {running > 0 && <span className="text-blue-600 font-medium">{running} corriendo</span>}
              {queued > 0 && <span>{queued} en cola</span>}
              {done > 0 && <span className="text-green-600">{done} listo{done > 1 ? 's' : ''}</span>}
              {failed > 0 && <span className="text-destructive">{failed} error{failed > 1 ? 'es' : ''}</span>}
              {cancelled > 0 && <span className="text-muted-foreground">{cancelled} cancelado{cancelled > 1 ? 's' : ''}</span>}
            </div>

            {/* Item list */}
            <div className="overflow-y-auto flex-1 divide-y">
              {entries.map((entry) => {
                const url = urlMap.get(entry.urlId);
                const name = url ? (url.name ?? new URL(url.url).hostname) : `URL #${entry.urlId}`;
                const href = url?.url;

                return (
                  <div key={entry.urlId} className="group flex items-center gap-3 px-4 py-3">
                    {entry.status === 'running' && <Loader2 className="size-4 shrink-0 animate-spin text-blue-500" />}
                    {entry.status === 'queued' && <Clock className="size-4 shrink-0 text-muted-foreground" />}
                    {entry.status === 'done' && <CheckCircle2 className="size-4 shrink-0 text-green-500" />}
                    {entry.status === 'failed' && <XCircle className="size-4 shrink-0 text-destructive" />}
                    {entry.status === 'cancelled' && <Ban className="size-4 shrink-0 text-muted-foreground" />}

                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-sm truncate">{name}</span>
                      {href && <span className="text-xs text-muted-foreground truncate">{href}</span>}
                    </div>

                    {entry.status === 'done' ? (
                      <span className="relative shrink-0 w-8 flex items-center justify-end">
                        <span className="text-xs text-green-600 group-hover:opacity-0 transition-opacity">Listo</span>
                        <button
                          onClick={() => setDismissed((prev) => new Set([...prev, entry.urlId]))}
                          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                          title="Descartar"
                        >
                          <X className="size-3.5" />
                        </button>
                      </span>
                    ) : entry.status === 'queued' ? (
                      <span className="relative shrink-0 w-12 flex items-center justify-end">
                        <span className="text-xs text-muted-foreground group-hover:opacity-0 transition-opacity">En cola</span>
                        <button
                          onClick={() => cancelQueue.mutate({ urlIds: [entry.urlId] })}
                          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                          title="Cancelar"
                        >
                          <X className="size-3.5" />
                        </button>
                      </span>
                    ) : entry.status === 'cancelled' ? (
                      <span className="relative shrink-0 w-16 flex items-center justify-end">
                        <span className="text-xs text-muted-foreground group-hover:opacity-0 transition-opacity">Cancelado</span>
                        <button
                          onClick={() => analyze.mutate(entry.urlId)}
                          disabled={analyze.isPending}
                          className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-blue-500"
                          title="Reintentar"
                        >
                          <RotateCcw className="size-3.5" />
                        </button>
                      </span>
                    ) : (
                      <span className={cn('text-xs shrink-0', {
                        'text-destructive': entry.status === 'failed',
                      })}>
                        {entry.status === 'running' && (
                          <span className="relative shrink-0 w-16 flex items-center justify-end">
                            <span className="text-xs text-blue-600 group-hover:opacity-0 transition-opacity">Analizando…</span>
                            <button
                              onClick={() => cancelQueue.mutate({ urlIds: [entry.urlId], includeRunning: true })}
                              className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                              title="Cancelar"
                            >
                              <X className="size-3.5" />
                            </button>
                          </span>
                        )}
                        {entry.status === 'failed' && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help underline decoration-dotted">Error</span>
                            </TooltipTrigger>
                            <TooltipContent side="left">
                              <p className="max-w-xs break-words">{entry.error ?? 'Error desconocido'}</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </DrawerPrimitive.Content>
        </DrawerPortal>
      </Drawer>
    </TooltipProvider>
  );
}
