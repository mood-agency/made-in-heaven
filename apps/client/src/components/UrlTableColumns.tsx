import { type ColumnDef, type FilterFn } from '@tanstack/react-table';
import { Link } from 'react-router-dom';
import { ExternalLink, RefreshCw, Trash2, Loader2 } from 'lucide-react';
import type { Url, QueueEntry } from '@/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import ScoreCircle from '@/components/ScoreCircle';
import { QueueStatusBadge, SortIcon, DragHandleCell } from '@/components/url-table-helpers';
import { timeAgo } from '@/lib/utils';

const scoreBucketFilter: FilterFn<Url> = (row, columnId, filterValue: string[]) => {
  const score = row.getValue<number>(columnId);
  if (!filterValue || filterValue.length === 0) return true;
  return filterValue.some((bucket) => {
    if (bucket === 'good') return score >= 70;
    if (bucket === 'needs-improvement') return score >= 50 && score < 70;
    if (bucket === 'poor') return score >= 0 && score < 50;
    return false;
  });
};
scoreBucketFilter.autoRemove = (val: string[]) => !val || val.length === 0;

export interface UrlColumnHandlers {
  onTagClick: (tag: string, activeTags: string[]) => void;
  onAnalyze: (id: number) => void;
  onDelete: (id: number, name: string) => void;
  isAnalyzePending: boolean;
  queueState: Map<number, QueueEntry>;
}

export function getUrlColumns(handlers: UrlColumnHandlers): ColumnDef<Url>[] {
  return [
    {
      id: 'select',
      size: 40,
      enableSorting: false,
      enableHiding: false,
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected()
              ? true
              : table.getIsSomePageRowsSelected()
              ? 'indeterminate'
              : false
          }
          onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(v) => row.toggleSelected(!!v)}
          aria-label={`Select ${row.original.name ?? row.original.url}`}
        />
      ),
    },
    {
      id: 'dragHandle',
      size: 40,
      enableSorting: false,
      enableHiding: false,
      header: () => null,
      cell: () => <DragHandleCell />,
    },
    {
      id: 'name',
      accessorFn: (u) => u.name ?? new URL(u.url).hostname,
      enableSorting: true,
      header: ({ column }) => (
        <button
          className="flex items-center hover:text-foreground"
          onClick={column.getToggleSortingHandler()}
        >
          Nombre <SortIcon sorted={column.getIsSorted()} />
        </button>
      ),
      cell: ({ row }) => {
        const displayName = row.original.name ?? new URL(row.original.url).hostname;
        return (
          <div className="font-medium max-w-[160px] truncate">
            <Link to={`/urls/${row.original.id}`} className="hover:underline" title={displayName}>
              {displayName}
            </Link>
          </div>
        );
      },
    },
    {
      id: 'url',
      accessorKey: 'url',
      enableSorting: true,
      header: ({ column }) => (
        <button
          className="flex items-center hover:text-foreground"
          onClick={column.getToggleSortingHandler()}
        >
          URL <SortIcon sorted={column.getIsSorted()} />
        </button>
      ),
      cell: ({ row }) => (
        <a
          href={row.original.url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:underline truncate max-w-[200px]"
          title={row.original.url}
        >
          <span className="truncate">{row.original.url}</span>
          <ExternalLink className="size-3 shrink-0" />
        </a>
      ),
    },
    {
      id: 'tags',
      accessorKey: 'tags',
      enableSorting: false,
      filterFn: 'arrIncludesSome',
      header: 'Tags',
      cell: ({ row, table }) => {
        const activeTags = (table.getColumn('tags')?.getFilterValue() as string[] | undefined) ?? [];
        return (
          <div className="flex flex-wrap gap-1">
            {row.original.tags.map((tag) => (
              <button key={tag} onClick={() => handlers.onTagClick(tag, activeTags)} className="focus:outline-none">
                <Badge
                  variant={activeTags.includes(tag) ? 'default' : 'outline'}
                  className="text-xs cursor-pointer hover:bg-accent transition-colors"
                >
                  {tag}
                </Badge>
              </button>
            ))}
          </div>
        );
      },
    },
    {
      id: 'mobile',
      accessorFn: (u) => u.latestMobile?.performanceScore ?? -1,
      enableSorting: true,
      filterFn: scoreBucketFilter,
      header: ({ column }) => (
        <button
          className="flex items-center justify-center w-full hover:text-foreground"
          onClick={column.getToggleSortingHandler()}
        >
          Mobile <SortIcon sorted={column.getIsSorted()} />
        </button>
      ),
      cell: ({ row }) => (
        <div className="flex justify-center">
          <ScoreCircle score={row.original.latestMobile?.performanceScore ?? null} size="sm" />
        </div>
      ),
    },
    {
      id: 'desktop',
      accessorFn: (u) => u.latestDesktop?.performanceScore ?? -1,
      enableSorting: true,
      filterFn: scoreBucketFilter,
      header: ({ column }) => (
        <button
          className="flex items-center justify-center w-full hover:text-foreground"
          onClick={column.getToggleSortingHandler()}
        >
          Desktop <SortIcon sorted={column.getIsSorted()} />
        </button>
      ),
      cell: ({ row }) => (
        <div className="flex justify-center">
          <ScoreCircle score={row.original.latestDesktop?.performanceScore ?? null} size="sm" />
        </div>
      ),
    },
    {
      id: 'scheduleInterval',
      accessorKey: 'scheduleInterval',
      enableSorting: false,
      header: 'Intervalo',
      cell: ({ row }) => (
        <Badge variant="secondary" className="text-xs">
          {row.original.scheduleInterval === 'manual' ? 'Manual' : row.original.scheduleInterval}
        </Badge>
      ),
    },
    {
      id: 'lastAnalyzed',
      accessorFn: (u) => u.lastAnalyzed ? new Date(u.lastAnalyzed).getTime() : 0,
      enableSorting: true,
      header: 'Analizado',
      cell: ({ row }) => {
        const queueEntry = handlers.queueState.get(row.original.id);
        return (
          <div className="flex flex-col gap-1 text-xs text-muted-foreground whitespace-nowrap">
            <QueueStatusBadge entry={queueEntry} />
            {!queueEntry && timeAgo(row.original.lastAnalyzed)}
            {queueEntry && queueEntry.status === 'done' && timeAgo(row.original.lastAnalyzed)}
          </div>
        );
      },
    },
    {
      id: 'actions',
      enableSorting: false,
      enableHiding: false,
      header: () => <div className="text-right">Acciones</div>,
      cell: ({ row }) => {
        const u = row.original;
        const queueEntry = handlers.queueState.get(u.id);
        const displayName = u.name ?? new URL(u.url).hostname;
        return (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handlers.onAnalyze(u.id)}
              disabled={
                handlers.isAnalyzePending ||
                queueEntry?.status === 'queued' ||
                queueEntry?.status === 'running'
              }
              title="Analizar"
            >
              {queueEntry?.status === 'running' ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handlers.onDelete(u.id, displayName)}
              title="Eliminar"
            >
              <Trash2 className="size-3.5 text-destructive" />
            </Button>
          </div>
        );
      },
    },
  ];
}
