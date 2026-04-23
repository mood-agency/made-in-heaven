import { Link } from 'react-router-dom';
import type { Url } from '@/api';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import ScoreCircle from '@/components/ScoreCircle';
import { RefreshCw, Trash2, ExternalLink, GripVertical } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

type SortMode = 'manual' | 'alpha' | 'url' | 'mobile' | 'desktop';

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

interface RowProps {
  url: Url;
  sortMode: SortMode;
  activeTag: string | null;
  onTagClick: (tag: string) => void;
  onAnalyze: (id: number) => void;
  onDelete: (id: number, name: string) => void;
  isAnalyzePending: boolean;
  isSelected: boolean;
  onToggleSelect: (id: number) => void;
}

function SortableRow({
  url: u,
  sortMode,
  activeTag,
  onTagClick,
  onAnalyze,
  onDelete,
  isAnalyzePending,
  isSelected,
  onToggleSelect,
}: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: u.id,
    disabled: sortMode !== 'manual',
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    position: isDragging ? ('relative' as const) : undefined,
    zIndex: isDragging ? 10 : undefined,
  };

  const displayName = u.name ?? new URL(u.url).hostname;
  const isManual = sortMode === 'manual';

  return (
    <TableRow ref={setNodeRef} style={style} className={isDragging ? 'bg-accent shadow-md' : undefined}>
      <TableCell className="w-8 px-2">
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleSelect(u.id)}
          aria-label={`Select ${displayName}`}
        />
      </TableCell>

      <TableCell className="w-10 px-2">
        <button
          {...(isManual ? { ...attributes, ...listeners } : {})}
          className={`flex items-center justify-center p-1 rounded transition-colors ${
            isManual
              ? 'cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground hover:bg-accent'
              : 'cursor-default text-muted-foreground/20 pointer-events-none'
          }`}
          tabIndex={isManual ? 0 : -1}
          aria-label="Drag to reorder"
        >
          <GripVertical className="size-4" />
        </button>
      </TableCell>

      <TableCell className="font-medium max-w-[160px] truncate">
        <Link to={`/urls/${u.id}`} className="hover:underline" title={displayName}>
          {displayName}
        </Link>
      </TableCell>

      <TableCell className="hidden lg:table-cell max-w-[200px]">
        <a
          href={u.url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-xs text-muted-foreground hover:underline truncate"
          title={u.url}
        >
          <span className="truncate">{u.url}</span>
          <ExternalLink className="size-3 shrink-0" />
        </a>
      </TableCell>

      <TableCell className="hidden md:table-cell">
        <div className="flex flex-wrap gap-1">
          {u.tags.map((tag) => (
            <button key={tag} onClick={() => onTagClick(tag)} className="focus:outline-none">
              <Badge
                variant={activeTag === tag ? 'default' : 'outline'}
                className="text-xs cursor-pointer hover:bg-accent transition-colors"
              >
                {tag}
              </Badge>
            </button>
          ))}
        </div>
      </TableCell>

      <TableCell className="text-center">
        <div className="flex justify-center">
          <ScoreCircle score={u.latestMobile?.performanceScore ?? null} size="sm" />
        </div>
      </TableCell>

      <TableCell className="text-center">
        <div className="flex justify-center">
          <ScoreCircle score={u.latestDesktop?.performanceScore ?? null} size="sm" />
        </div>
      </TableCell>

      <TableCell className="hidden md:table-cell">
        <Badge variant="secondary" className="text-xs">
          {u.scheduleInterval === 'manual' ? 'Manual' : u.scheduleInterval}
        </Badge>
      </TableCell>

      <TableCell className="hidden sm:table-cell text-xs text-muted-foreground whitespace-nowrap">
        {timeAgo(u.lastAnalyzed)}
      </TableCell>

      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onAnalyze(u.id)}
            disabled={isAnalyzePending}
            title="Analizar"
          >
            <RefreshCw className="size-3.5" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onDelete(u.id, displayName)} title="Eliminar">
            <Trash2 className="size-3.5 text-destructive" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

interface Props {
  urls: Url[];
  sortMode: SortMode;
  activeTag: string | null;
  onTagClick: (tag: string) => void;
  onReorder: (oldIndex: number, newIndex: number) => void;
  onAnalyze: (id: number) => void;
  onDelete: (id: number, name: string) => void;
  isAnalyzePending: boolean;
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  onToggleSelectAll: () => void;
}

export default function UrlTable({
  urls,
  sortMode,
  activeTag,
  onTagClick,
  onReorder,
  onAnalyze,
  onDelete,
  isAnalyzePending,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
}: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = urls.findIndex((u) => u.id === active.id);
      const newIndex = urls.findIndex((u) => u.id === over.id);
      onReorder(oldIndex, newIndex);
    }
  }

  const allSelected = urls.length > 0 && urls.every((u) => selectedIds.has(u.id));
  const someSelected = urls.some((u) => selectedIds.has(u.id));

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={urls.map((u) => u.id)} strategy={verticalListSortingStrategy}>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8 px-2">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                    onCheckedChange={onToggleSelectAll}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead className="w-10 px-2" />
                <TableHead>Nombre</TableHead>
                <TableHead className="hidden lg:table-cell">URL</TableHead>
                <TableHead className="hidden md:table-cell">Tags</TableHead>
                <TableHead className="text-center">Mobile</TableHead>
                <TableHead className="text-center">Desktop</TableHead>
                <TableHead className="hidden md:table-cell">Intervalo</TableHead>
                <TableHead className="hidden sm:table-cell">Analizado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {urls.map((u) => (
                <SortableRow
                  key={u.id}
                  url={u}
                  sortMode={sortMode}
                  activeTag={activeTag}
                  onTagClick={onTagClick}
                  onAnalyze={onAnalyze}
                  onDelete={onDelete}
                  isAnalyzePending={isAnalyzePending}
                  isSelected={selectedIds.has(u.id)}
                  onToggleSelect={onToggleSelect}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      </SortableContext>
    </DndContext>
  );
}
