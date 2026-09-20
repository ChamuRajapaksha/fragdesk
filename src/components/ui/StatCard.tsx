import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  accent?: string;
  sparkline?: ReactNode;
  onClick?: () => void;
  className?: string;
}

export default function StatCard({
  icon: Icon,
  label,
  value,
  accent = 'text-frag-primary',
  sparkline,
  onClick,
  className = '',
}: StatCardProps) {
  return (
    <div
      onClick={onClick}
      className={`bg-frag-surface border border-frag-border rounded-lg p-4 md:p-5 ${
        onClick ? 'cursor-pointer hover:border-frag-primary/40 transition-colors' : ''
      } ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-frag-muted text-sm font-medium truncate">{label}</p>
        <Icon size={18} className={`shrink-0 ${accent}`} />
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className={`text-3xl font-bold ${accent}`}>{value}</p>
        {sparkline && <div className="w-24 h-10 max-w-[40%]">{sparkline}</div>}
      </div>
    </div>
  );
}