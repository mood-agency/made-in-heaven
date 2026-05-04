import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowUpDown, ArrowUp, ArrowDown, GripVertical } from 'lucide-react';
import type { QueueEntry } from '@/api';
import { useDndRow } from '@/components/dnd-row-context';

export function SortIcon({ sorted }: { sorted: false | 'asc' | 'desc' }) {
  if (!sorted) return <ArrowUpDown className="size-3 ml-1 text-muted-foreground/50" />;
  if (sorted === 'asc') return <ArrowUp className="size-3 ml-1" />;
  return <ArrowDown className="size-3 ml-1" />;
}

export function DragHandleCell() {
  const { listeners, attributes, isDndEnabled } = useDndRow();
  return (
    <button
      {...(isDndEnabled ? { ...listeners, ...attributes } : {})}
      className={`flex items-center justify-center p-1 rounded transition-colors ${
        isDndEnabled
          ? 'cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground hover:bg-accent'
          : 'cursor-default text-muted-foreground/20 pointer-events-none'
      }`}
      tabIndex={isDndEnabled ? 0 : -1}
      aria-label="Drag to reorder"
    >
      <GripVertical className="size-4" />
    </button>
  );
}

export function QueueStatusBadge({ entry }: { entry: QueueEntry | undefined }) {
  if (!entry) return null;
  if (entry.status === 'queued')
    return <Badge variant="secondary" className="text-xs shrink-0">En cola</Badge>;
  if (entry.status === 'running')
    return (
      <Badge variant="secondary" className="text-xs shrink-0 gap-1 text-blue-600 border-blue-200 bg-blue-50">
        <Loader2 className="size-3 animate-spin" />
        Analizando…
      </Badge>
    );
  if (entry.status === 'failed')
    return (
      <Badge
        variant="destructive"
        className="text-xs shrink-0 cursor-help"
        title={entry.error ?? 'Error desconocido'}
      >
        Error
      </Badge>
    );
  if (entry.status === 'done')
    return <Badge variant="outline" className="text-xs shrink-0 text-green-600 border-green-200">Listo</Badge>;
  if (entry.status === 'cancelled')
    return <Badge variant="secondary" className="text-xs shrink-0 text-muted-foreground">Cancelado</Badge>;
  return null;
}
