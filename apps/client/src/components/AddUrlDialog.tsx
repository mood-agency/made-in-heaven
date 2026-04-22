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
import { Badge } from '@/components/ui/badge';
import { useAddUrl, useTags, type ScheduleInterval } from '@/api';
import { Plus, X } from 'lucide-react';

const SCHEDULES = [
  { value: 'manual', label: 'Manual only' },
  { value: 'hourly', label: 'Every hour' },
  { value: 'every6h', label: 'Every 6 hours' },
  { value: 'every12h', label: 'Every 12 hours' },
  { value: 'daily', label: 'Daily (9 AM)' },
  { value: 'weekly', label: 'Weekly (Mon 9 AM)' },
];

export default function AddUrlDialog() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [scheduleInterval, setScheduleInterval] = useState<ScheduleInterval>('manual');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const addUrl = useAddUrl();
  const { data: existingTags = [] } = useTags();

  const suggestions = existingTags
    .map((t) => t.name)
    .filter((n) => n.includes(tagInput.toLowerCase()) && !selectedTags.includes(n));

  function addTag(tag: string) {
    const normalized = tag.trim().toLowerCase();
    if (normalized && !selectedTags.includes(normalized)) {
      setSelectedTags((prev) => [...prev, normalized]);
    }
    setTagInput('');
    setShowSuggestions(false);
  }

  function removeTag(tag: string) {
    setSelectedTags((prev) => prev.filter((t) => t !== tag));
  }

  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (tagInput.trim()) addTag(tagInput);
    } else if (e.key === 'Backspace' && !tagInput && selectedTags.length > 0) {
      setSelectedTags((prev) => prev.slice(0, -1));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await addUrl.mutateAsync({ url, name: name || undefined, scheduleInterval, tags: selectedTags });
      toast.success('URL added successfully');
      setOpen(false);
      setUrl('');
      setName('');
      setScheduleInterval('manual');
      setSelectedTags([]);
      setTagInput('');
    } catch (err) {
      toast.error(String(err));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus data-icon="inline-start" />
          Add URL
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add URL to track</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">URL *</label>
            <Input
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              type="url"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Name (optional)</label>
            <Input
              placeholder="My Website"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Analysis schedule</label>
            <Select value={scheduleInterval} onValueChange={(v) => setScheduleInterval(v as ScheduleInterval)}>
              <SelectTrigger>
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
          </div>
          <div className="flex flex-col gap-1.5 relative">
            <label className="text-sm font-medium">Tags (optional)</label>
            <div
              className="flex flex-wrap gap-1.5 min-h-9 px-3 py-1.5 rounded-md border border-input bg-background cursor-text"
              onClick={() => tagInputRef.current?.focus()}
            >
              {selectedTags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1 text-xs">
                  {tag}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
                    className="hover:text-destructive"
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
              <input
                ref={tagInputRef}
                value={tagInput}
                onChange={(e) => { setTagInput(e.target.value); setShowSuggestions(true); }}
                onKeyDown={handleTagKeyDown}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder={selectedTags.length === 0 ? 'Add tags…' : ''}
                className="flex-1 min-w-20 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-50 mt-1 rounded-md border bg-popover shadow-md">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="w-full px-3 py-1.5 text-sm text-left hover:bg-accent"
                    onMouseDown={() => addTag(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Press Enter or comma to add a tag</p>
          </div>
          <Button type="submit" disabled={addUrl.isPending}>
            {addUrl.isPending ? 'Adding…' : 'Add URL'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
