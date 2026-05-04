import { flexRender, type Row, type Table as TanstackTable } from '@tanstack/react-table';
import type { Url } from '@/api';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { DndRowProvider } from '@/components/dnd-row-context';

interface SortableRowProps {
  row: Row<Url>;
  isDndEnabled: boolean;
}

function SortableRow({ row, isDndEnabled }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
    disabled: !isDndEnabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    position: isDragging ? ('relative' as const) : undefined,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <DndRowProvider value={{ listeners, attributes, isDragging, isDndEnabled }}>
      <TableRow
        ref={setNodeRef}
        style={style}
        className={isDragging ? 'bg-accent shadow-md' : undefined}
        data-state={row.getIsSelected() ? 'selected' : undefined}
      >
        {row.getVisibleCells().map((cell) => (
          <TableCell key={cell.id}>
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </TableCell>
        ))}
      </TableRow>
    </DndRowProvider>
  );
}

interface Props {
  table: TanstackTable<Url>;
  isDndEnabled: boolean;
  onReorder: (oldIndex: number, newIndex: number) => void;
}

export default function UrlTable({ table, isDndEnabled, onReorder }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const rows = table.getRowModel().rows;

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = rows.findIndex((r) => r.id === active.id);
      const newIndex = rows.findIndex((r) => r.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) onReorder(oldIndex, newIndex);
    }
  }

  const tableBody = (
    <TableBody>
      {rows.length > 0 ? (
        rows.map((row) => (
          <SortableRow key={row.id} row={row} isDndEnabled={isDndEnabled} />
        ))
      ) : (
        <TableRow>
          <TableCell
            colSpan={table.getAllColumns().length}
            className="h-24 text-center text-muted-foreground"
          >
            No URLs match your filters.
          </TableCell>
        </TableRow>
      )}
    </TableBody>
  );

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead
                  key={header.id}
                  style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>

        {isDndEnabled ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              {tableBody}
            </SortableContext>
          </DndContext>
        ) : (
          tableBody
        )}
      </Table>
    </div>
  );
}
