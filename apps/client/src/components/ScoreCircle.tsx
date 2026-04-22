import { cn } from '@/lib/utils';

interface Props {
  score: number | null;
  label?: string;
  size?: 'sm' | 'md';
}

function scoreColor(score: number | null) {
  if (score === null) return 'text-muted-foreground bg-muted';
  if (score >= 90) return 'text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-950';
  if (score >= 50) return 'text-yellow-700 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-950';
  return 'text-red-700 bg-red-100 dark:text-red-400 dark:bg-red-950';
}

export default function ScoreCircle({ score, label, size = 'md' }: Props) {
  const colorClass = scoreColor(score);
  const sizeClass = size === 'sm' ? 'size-10 text-xs' : 'size-14 text-sm';

  return (
    <div className="flex flex-col items-center gap-1">
      <div className={cn('rounded-full flex items-center justify-center font-bold', sizeClass, colorClass)}>
        {score !== null ? score : '—'}
      </div>
      {label && <span className="text-xs text-muted-foreground">{label}</span>}
    </div>
  );
}
