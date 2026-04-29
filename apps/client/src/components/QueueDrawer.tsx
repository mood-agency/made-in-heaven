import { useEffect, useState } from 'react';
import { Drawer as DrawerPrimitive } from 'vaul';
import { Loader2, CheckCircle2, XCircle, Clock, ChevronRight, ChevronLeft, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { QueueEntry, Url } from '@/api';
import { Drawer, DrawerPortal, DrawerHeader, DrawerTitle, DrawerClose } from '@/components/ui/drawer';
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

export default function QueueDrawer({ queueState, urls }: Props) {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);

  const entries = [...queueState.values()].sort(
    (a, b) => statusOrder(a.status) - statusOrder(b.status),
  );
  const urlMap = new Map(urls.map((u) => [u.id, u]));

  const running = entries.filter((e) => e.status === 'running').length;
  const queued = entries.filter((e) => e.status === 'queued').length;
  const done = entries.filter((e) => e.status === 'done').length;
  const failed = entries.filter((e) => e.status === 'failed').length;
  const total = entries.length;

  // Auto-open when queue becomes active
  useEffect(() => {
    if (queueState.size > 0) {
      setOpen(true);
      setMinimized(false);
    }
  }, [queueState.size > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  if (total === 0 && !open) return null;

  // Floating chip when minimized
  if (minimized && total > 0) {
    return (
      <button
        onClick={() => { setMinimized(false); setOpen(true); }}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-card border shadow-lg px-4 py-3 text-sm hover:shadow-xl transition-shadow"
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
        <ChevronLeft className="size-4 text-muted-foreground" />
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
        direction="right"
      >
        {/* DrawerPortal + raw Content to skip the overlay */}
        <DrawerPortal>
          <DrawerPrimitive.Content
            className={cn(
              'fixed z-50 flex flex-col bg-popover text-sm text-popover-foreground',
              'inset-y-0 right-0 w-80 border-l border-border/60 shadow-2xl rounded-l-xl focus:outline-none',
            )}
          >
            <DrawerHeader className="flex-row items-center justify-between py-3 border-b">
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
                <button
                  onClick={() => { setMinimized(true); setOpen(false); }}
                  className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground"
                  title="Minimizar"
                >
                  <ChevronRight className="size-4" />
                </button>
                <DrawerClose className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground">
                  <X className="size-4" />
                </DrawerClose>
              </div>
            </DrawerHeader>

            {/* Status summary */}
            <div className="flex flex-wrap gap-x-3 gap-y-1 px-4 py-2 text-xs text-muted-foreground border-b">
              {running > 0 && <span className="text-blue-600 font-medium">{running} corriendo</span>}
              {queued > 0 && <span>{queued} en cola</span>}
              {done > 0 && <span className="text-green-600">{done} listo{done > 1 ? 's' : ''}</span>}
              {failed > 0 && <span className="text-destructive">{failed} error{failed > 1 ? 'es' : ''}</span>}
            </div>

            {/* Item list */}
            <div className="overflow-y-auto flex-1 divide-y">
              {entries.map((entry) => {
                const url = urlMap.get(entry.urlId);
                const name = url ? (url.name ?? new URL(url.url).hostname) : `URL #${entry.urlId}`;
                const href = url?.url;

                return (
                  <div key={entry.urlId} className="flex items-center gap-3 px-4 py-3">
                    {entry.status === 'running' && <Loader2 className="size-4 shrink-0 animate-spin text-blue-500" />}
                    {entry.status === 'queued' && <Clock className="size-4 shrink-0 text-muted-foreground" />}
                    {entry.status === 'done' && <CheckCircle2 className="size-4 shrink-0 text-green-500" />}
                    {entry.status === 'failed' && <XCircle className="size-4 shrink-0 text-destructive" />}

                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-sm truncate">{name}</span>
                      {href && <span className="text-xs text-muted-foreground truncate">{href}</span>}
                    </div>

                    <span className={`text-xs shrink-0 ${
                      entry.status === 'running' ? 'text-blue-600' :
                      entry.status === 'done' ? 'text-green-600' :
                      entry.status === 'failed' ? 'text-destructive' :
                      'text-muted-foreground'
                    }`}>
                      {entry.status === 'running' && 'Analizando…'}
                      {entry.status === 'queued' && 'En cola'}
                      {entry.status === 'done' && 'Listo'}
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
