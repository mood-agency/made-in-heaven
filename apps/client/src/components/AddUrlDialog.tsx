import { useState } from 'react';
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
import { useAddUrl } from '@/api';
import { Plus } from 'lucide-react';

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
  const [scheduleInterval, setScheduleInterval] = useState('manual');
  const addUrl = useAddUrl();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await addUrl.mutateAsync({ url, name: name || undefined, scheduleInterval });
      toast.success('URL added successfully');
      setOpen(false);
      setUrl('');
      setName('');
      setScheduleInterval('manual');
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
            <Select value={scheduleInterval} onValueChange={setScheduleInterval}>
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
          <Button type="submit" disabled={addUrl.isPending}>
            {addUrl.isPending ? 'Adding…' : 'Add URL'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
