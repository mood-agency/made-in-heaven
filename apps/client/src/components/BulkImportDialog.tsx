import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useBulkImport, type ScheduleInterval } from '@/api';
import { Upload, Plus, Trash2, FileUp, Download, Loader2 } from 'lucide-react';

const SCHEDULES = [
  { value: 'manual', label: 'Manual' },
  { value: 'daily', label: 'Daily' },
];

interface Row {
  id: number;
  url: string;
  name: string;
  scheduleInterval: ScheduleInterval;
  tags: string;
}

let rowCounter = 0;

function makeRow(): Row {
  return { id: ++rowCounter, url: '', name: '', scheduleInterval: 'manual', tags: '' };
}

function isValidUrl(str: string) {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

function parseCSV(text: string): Row[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];

  // Detect if first line is a header
  const firstLine = lines[0].toLowerCase();
  const hasHeader = firstLine.includes('url');
  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines
    .map((line) => {
      // Handle quoted fields (e.g., "tag1,tag2")
      const fields: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
          fields.push(current);
          current = '';
        } else {
          current += ch;
        }
      }
      fields.push(current);

      const [url = '', name = '', schedule = 'manual', tags = ''] = fields.map((f) => f.trim());
      const validSchedules = ['manual', 'daily'];
      return {
        id: ++rowCounter,
        url,
        name,
        scheduleInterval: (validSchedules.includes(schedule) ? schedule : 'manual') as ScheduleInterval,
        tags,
      };
    })
    .filter((r) => r.url);
}

export default function BulkImportDialog() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>(() => [makeRow(), makeRow(), makeRow()]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bulkImport = useBulkImport();

  function updateRow(id: number, field: keyof Row, value: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, makeRow()]);
  }

  function removeRow(id: number) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const parsed = parseCSV(text);
      if (parsed.length === 0) {
        toast.error('No valid rows found in CSV');
        return;
      }
      setRows(parsed.length > 0 ? [...parsed, makeRow()] : [makeRow()]);
      toast.success(`Loaded ${parsed.length} rows from CSV`);
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  const validRows = rows.filter((r) => r.url && isValidUrl(r.url));

  async function handleImport() {
    if (validRows.length === 0) {
      toast.error('No valid URLs to import');
      return;
    }

    const items = validRows.map((r) => ({
      url: r.url,
      name: r.name || undefined,
      scheduleInterval: r.scheduleInterval,
      tags: r.tags ? r.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
    }));

    try {
      const result = await bulkImport.mutateAsync(items);
      const created = result.created.length;
      const failed = result.errors.length;

      if (failed > 0) {
        toast.warning(`Imported ${created} URLs, ${failed} failed`);
        result.errors.forEach((e) => toast.error(`${e.url}: ${e.message}`));
      } else {
        toast.success(`Imported ${created} URLs successfully`);
      }

      setOpen(false);
      setRows([makeRow(), makeRow(), makeRow()]);
    } catch (err) {
      toast.error(String(err));
    }
  }

  function handleOpenChange(val: boolean) {
    setOpen(val);
    if (!val) setRows([makeRow(), makeRow(), makeRow()]);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload data-icon="inline-start" />
          Import URLs
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-4xl w-full">
        <DialogHeader>
          <DialogTitle>Import URLs</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <FileUp data-icon="inline-start" />
              Upload CSV
            </Button>
            <span className="text-xs text-muted-foreground">
              Format: <code className="bg-muted px-1 rounded">url, name, schedule, tags</code>
              &nbsp;— tags separated by commas inside quotes
            </span>
            <a
              href="/urls-template.csv"
              download="urls-template.csv"
              className="ml-auto flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <Download className="size-3" />
              Download template
            </a>
          </div>

          <div className="rounded-md border overflow-auto max-h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[35%] min-w-[200px]">URL *</TableHead>
                  <TableHead className="w-[20%] min-w-[130px]">Name</TableHead>
                  <TableHead className="w-[140px]">Schedule</TableHead>
                  <TableHead>Tags (comma-separated)</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const invalid = row.url && !isValidUrl(row.url);
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="py-1.5">
                        <Input
                          value={row.url}
                          onChange={(e) => updateRow(row.id, 'url', e.target.value)}
                          placeholder="https://example.com"
                          className={`h-8 text-sm ${invalid ? 'border-destructive focus-visible:ring-destructive' : ''}`}
                        />
                      </TableCell>
                      <TableCell className="py-1.5">
                        <Input
                          value={row.name}
                          onChange={(e) => updateRow(row.id, 'name', e.target.value)}
                          placeholder="My Site"
                          className="h-8 text-sm"
                        />
                      </TableCell>
                      <TableCell className="py-1.5">
                        <Select
                          value={row.scheduleInterval}
                          onValueChange={(v) => updateRow(row.id, 'scheduleInterval', v as ScheduleInterval)}
                        >
                          <SelectTrigger className="h-8 text-sm">
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
                      </TableCell>
                      <TableCell className="py-1.5">
                        <Input
                          value={row.tags}
                          onChange={(e) => updateRow(row.id, 'tags', e.target.value)}
                          placeholder="prod, ecommerce"
                          className="h-8 text-sm"
                        />
                      </TableCell>
                      <TableCell className="py-1.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => removeRow(row.id)}
                        >
                          <Trash2 className="size-3.5 text-muted-foreground" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {bulkImport.isPending && (
            <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin shrink-0" />
              Importando {validRows.length} URL{validRows.length !== 1 ? 's' : ''}… esto puede tardar unos segundos.
            </div>
          )}

          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={addRow} disabled={bulkImport.isPending}>
              <Plus data-icon="inline-start" />
              Add row
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={bulkImport.isPending}>
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                disabled={bulkImport.isPending || validRows.length === 0}
              >
                {bulkImport.isPending
                  ? <><Loader2 className="size-4 animate-spin" />Importando…</>
                  : `Import ${validRows.length} URL${validRows.length !== 1 ? 's' : ''}`}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
