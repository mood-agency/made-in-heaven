import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts';
import type { Analysis } from '@/api';

export interface MetricConfig {
  key: keyof Analysis;
  label: string;
  unit: string;
}

export const METRICS: MetricConfig[] = [
  { key: 'performanceScore', label: 'Performance', unit: '' },
  { key: 'fcp', label: 'FCP', unit: 'ms' },
  { key: 'lcp', label: 'LCP', unit: 'ms' },
  { key: 'tbt', label: 'TBT', unit: 'ms' },
  { key: 'cls', label: 'CLS', unit: '' },
];

interface Props {
  mobile: Analysis[];
  desktop: Analysis[];
  metric: MetricConfig;
}

export function MetricChart({ mobile, desktop, metric }: Props) {
  const toMap = (list: Analysis[]) =>
    new Map(
      [...list].reverse().map((a) => [
        a.analyzedAt ? new Date(a.analyzedAt).toLocaleString() : '',
        a[metric.key] as number | null,
      ]),
    );

  const mobileMap = toMap(mobile);
  const desktopMap = toMap(desktop);
  const dates = [...new Set([...mobileMap.keys(), ...desktopMap.keys()])].sort();

  const data = dates.map((date) => ({
    date,
    mobile: mobileMap.get(date) ?? null,
    desktop: desktopMap.get(date) ?? null,
  }));

  const chartConfig = {
    mobile: { label: 'Mobile', color: 'hsl(var(--chart-1))' },
    desktop: { label: 'Desktop', color: 'hsl(var(--chart-2))' },
  };

  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-medium">
        {metric.label}
        {metric.unit && <span className="text-muted-foreground"> ({metric.unit})</span>}
      </p>
      <ChartContainer config={chartConfig} className="h-40 w-full">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} />
            <YAxis tick={{ fontSize: 10 }} tickLine={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <ChartLegend content={<ChartLegendContent />} />
            <Line
              type="monotone"
              dataKey="mobile"
              stroke="hsl(var(--chart-1))"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="desktop"
              stroke="hsl(var(--chart-2))"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartContainer>
    </div>
  );
}
