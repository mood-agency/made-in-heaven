import { type Table, type Column } from '@tanstack/react-table';
import { X, Search, SlidersHorizontal, ChevronLeft, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';

// ─── Search ─────────────────────────────────────────────────────────────────

interface DataTableSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function DataTableSearch({ value, onChange, placeholder = 'Search…', className }: DataTableSearchProps) {
  return (
    <div className={`relative max-w-sm ${className ?? ''}`}>
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-8 pr-8"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

// ─── Faceted filter ──────────────────────────────────────────────────────────

interface DataTableFacetedFilterProps<TData, TValue> {
  column: Column<TData, TValue>;
  title: string;
}

export function DataTableFacetedFilter<TData, TValue>({
  column,
  title,
}: DataTableFacetedFilterProps<TData, TValue>) {
  const facets = column.getFacetedUniqueValues();
  const selectedValues = new Set(column.getFilterValue() as string[] | undefined);

  const options = Array.from(facets.keys())
    .flat()
    .filter((v): v is string => typeof v === 'string')
    .reduce<string[]>((acc, v) => (acc.includes(v) ? acc : [...acc, v]), [])
    .sort();

  function toggle(value: string) {
    const next = new Set(selectedValues);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    column.setFilterValue(next.size > 0 ? Array.from(next) : undefined);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          {title}
          {selectedValues.size > 0 && (
            <>
              <Separator orientation="vertical" className="mx-0.5 h-4" />
              {selectedValues.size > 2 ? (
                <Badge variant="secondary" className="px-1 text-xs font-normal">
                  {selectedValues.size}
                </Badge>
              ) : (
                Array.from(selectedValues).map((v) => (
                  <Badge key={v} variant="secondary" className="px-1 text-xs font-normal">
                    {v}
                  </Badge>
                ))
              )}
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1" align="start">
        <div className="flex flex-col gap-0.5">
          {options.map((opt) => (
            <button
              key={opt}
              onClick={() => toggle(opt)}
              className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
            >
              <Checkbox checked={selectedValues.has(opt)} onCheckedChange={() => toggle(opt)} />
              <span className="flex-1 text-left">{opt}</span>
              {facets.has(opt) && (
                <span className="text-xs text-muted-foreground tabular-nums">{facets.get(opt)}</span>
              )}
            </button>
          ))}
          {selectedValues.size > 0 && (
            <>
              <Separator className="my-1" />
              <button
                onClick={() => column.setFilterValue(undefined)}
                className="flex items-center justify-center rounded px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                Clear filter
              </button>
            </>
          )}
          {options.length === 0 && (
            <p className="py-2 text-center text-xs text-muted-foreground">No options</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Column visibility ───────────────────────────────────────────────────────

interface DataTableViewOptionsProps<TData> {
  table: Table<TData>;
}

export function DataTableViewOptions<TData>({ table }: DataTableViewOptionsProps<TData>) {
  const hideable = table.getAllColumns().filter((col) => col.getCanHide());

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <SlidersHorizontal className="size-3.5" />
          Columns
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-40 p-1" align="end">
        <div className="flex flex-col gap-0.5">
          {hideable.map((col) => (
            <button
              key={col.id}
              onClick={() => col.toggleVisibility()}
              className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
            >
              <Checkbox checked={col.getIsVisible()} onCheckedChange={() => col.toggleVisibility()} />
              <span className="capitalize">{col.id}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Pagination ──────────────────────────────────────────────────────────────

const PAGE_SIZES = [20, 50, 100] as const;

interface DataTablePaginationProps<TData> {
  table: Table<TData>;
}

export function DataTablePagination<TData>({ table }: DataTablePaginationProps<TData>) {
  const { pageIndex, pageSize } = table.getState().pagination;
  const total = table.getFilteredRowModel().rows.length;
  const from = pageIndex * pageSize + 1;
  const to = Math.min((pageIndex + 1) * pageSize, total);

  if (total === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
      <span className="text-xs text-muted-foreground">
        {from}–{to} of {total}
      </span>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="text-xs text-muted-foreground tabular-nums">
          {pageIndex + 1} / {table.getPageCount() || 1}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div className="flex rounded-md border overflow-hidden text-xs">
        {PAGE_SIZES.map((size) => (
          <button
            key={size}
            onClick={() => table.setPageSize(size)}
            className={`px-3 py-1.5 transition-colors ${
              pageSize === size
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-accent text-muted-foreground'
            }`}
          >
            {size}
          </button>
        ))}
      </div>
    </div>
  );
}
