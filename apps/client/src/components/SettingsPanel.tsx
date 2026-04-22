import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useSettings, useSaveSettings } from '@/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function SettingsPanel() {
  const { data: settings } = useSettings();
  const save = useSaveSettings();
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    if (settings?.pagespeed_api_key) setApiKey(settings.pagespeed_api_key);
  }, [settings]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    try {
      await save.mutateAsync({ pagespeed_api_key: apiKey });
      toast.success('Settings saved');
    } catch (err) {
      toast.error(String(err));
    }
  }

  return (
    <div className="flex flex-col gap-6 max-w-lg">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Google PageSpeed API Key</CardTitle>
          <CardDescription>
            Optional. Without a key the API is limited to ~25 requests/day per IP.
            Get one at{' '}
            <a
              href="https://developers.google.com/speed/docs/insights/v5/get-started"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              Google Cloud Console
            </a>
            .
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <Input
              type="password"
              placeholder="AIza…"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <Button type="submit" disabled={save.isPending} className="self-start">
              {save.isPending ? 'Saving…' : 'Save'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
